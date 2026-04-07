/**
 * server/payroll-export.js — v2.13.0
 * Payroll export engine
 *   GET  /api/payroll/summary    — hours + cost summary for a period
 *   POST /api/payroll/export     — generate CSV/MYOB/Xero export
 *   GET  /api/payroll/exports    — export history
 *   GET  /api/payroll/exports/:id/download — download generated file
 */
import { Router } from 'express';
import { D, uuid } from './db.js';
import { requireAuth, requireTenant } from './middleware.js';

const r = Router();
r.use(requireAuth, requireTenant);

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = d => d ? new Date(d+'T12:00').toLocaleDateString('en-AU') : '';
const fmtHours = h => parseFloat((h||0).toFixed(2));

function getPayPeriod(date = new Date()) {
  const d = new Date(date);
  // Fortnight: find last Monday
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 13);
  return {
    start: monday.toISOString().split('T')[0],
    end:   sunday.toISOString().split('T')[0],
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────
r.get('/summary', (req, res) => {
  try {
    const { from, to } = req.query;
    const period = from && to ? { start: from, end: to } : getPayPeriod();

    // Clock records for period
    const clocks = D().prepare(`
      SELECT cr.*, e.first_name, e.last_name, e.qualification,
             e.hourly_rate_cents, e.employment_type, e.tax_file_number
      FROM clock_records cr
      JOIN educators e ON e.id=COALESCE(cr.educator_id, cr.member_id)
      WHERE cr.tenant_id=? AND COALESCE(cr.clock_date, cr.date) BETWEEN ? AND ?
        AND cr.clock_out IS NOT NULL
      ORDER BY e.last_name, cr.clock_date
    `).all(req.tenantId, period.start, period.end);

    // Group by educator
    const byEducator = {};
    for (const rec of clocks) {
      if (!byEducator[rec.educator_id]) {
        byEducator[rec.educator_id] = {
          educator_id: rec.educator_id,
          name: `${rec.first_name} ${rec.last_name}`,
          qualification: rec.qualification,
          employment_type: rec.employment_type,
          hourly_rate: (rec.hourly_rate_cents || 3500) / 100,
          tax_file_number: rec.tax_file_number,
          shifts: [],
          total_hours: 0,
          total_break_hours: 0,
          ordinary_hours: 0,
          overtime_hours: 0,
          gross_pay: 0,
        };
      }
      const edu = byEducator[rec.educator_id];
      const workHours = fmtHours(rec.hours_worked || 0);
      const breakHours = fmtHours((rec.total_break_minutes || 0) / 60);
      const netHours = fmtHours(workHours - breakHours);

      edu.shifts.push({
        date: rec.clock_date,
        clock_in: rec.clock_in,
        clock_out: rec.clock_out,
        hours: netHours,
        break_minutes: rec.total_break_minutes || 0,
      });
      edu.total_hours = fmtHours(edu.total_hours + netHours);
      edu.total_break_hours = fmtHours(edu.total_break_hours + breakHours);
    }

    // Calculate pay for each educator
    for (const edu of Object.values(byEducator)) {
      const rate = edu.hourly_rate || 30;
      // SCHCADS Award: first 38h ordinary, rest overtime at 1.5x
      const ordinary = Math.min(edu.total_hours, 38);
      const overtime = Math.max(0, edu.total_hours - 38);
      edu.ordinary_hours = fmtHours(ordinary);
      edu.overtime_hours = fmtHours(overtime);
      edu.gross_pay = fmtHours(ordinary * rate + overtime * rate * 1.5);
    }

    const educators = Object.values(byEducator).sort((a,b) => a.name.localeCompare(b.name));
    const totals = {
      total_hours: fmtHours(educators.reduce((s,e) => s + e.total_hours, 0)),
      total_gross: fmtHours(educators.reduce((s,e) => s + e.gross_pay, 0)),
      educator_count: educators.length,
      period,
    };

    res.json({ educators, totals, period });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Generate export ───────────────────────────────────────────────────────────
r.post('/export', (req, res) => {
  try {
    const { from, to, export_type = 'csv', generated_by } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const clocks = D().prepare(`
      SELECT cr.*, e.first_name, e.last_name, e.qualification,
             e.hourly_rate_cents, e.employment_type, e.bank_account_number,
             e.bank_bsb, e.tax_file_number, e.super_fund, e.super_member_number
      FROM clock_records cr
      JOIN educators e ON e.id=COALESCE(cr.educator_id, cr.member_id)
      WHERE cr.tenant_id=? AND COALESCE(cr.clock_date, cr.date) BETWEEN ? AND ?
        AND cr.clock_out IS NOT NULL
      ORDER BY e.last_name, cr.clock_date
    `).all(req.tenantId, from, to);

    // Group by educator (same as summary)
    const byEducator = {};
    for (const rec of clocks) {
      if (!byEducator[rec.educator_id]) {
        byEducator[rec.educator_id] = {
          educator_id: rec.educator_id,
          first_name: rec.first_name,
          last_name: rec.last_name,
          qualification: rec.qualification,
          employment_type: rec.employment_type || 'casual',
          hourly_rate: (rec.hourly_rate_cents || 3500) / 100,
          bank_account_number: rec.bank_account_number,
          bank_bsb: rec.bank_bsb,
          tax_file_number: rec.tax_file_number,
          super_fund: rec.super_fund,
          super_member_number: rec.super_member_number,
          total_hours: 0,
        };
      }
      const netHours = fmtHours((rec.hours_worked || 0) - (rec.total_break_minutes || 0) / 60);
      byEducator[rec.educator_id].total_hours = fmtHours(byEducator[rec.educator_id].total_hours + netHours);
    }

    const educators = Object.values(byEducator);
    const superRate = 0.115; // 11.5% SGC 2025-26
    let csvContent = '';

    if (export_type === 'myob') {
      // MYOB AccountRight payroll import format
      csvContent = 'Employee Number,Last Name,First Name,Department,Pay Basis,Pay Rate,Hours Worked,Gross Pay,Tax,Net Pay,Super Amount\n';
      educators.forEach((e, i) => {
        const rate = e.hourly_rate_cents || 30;
        const ordinary = Math.min(e.total_hours, 38);
        const overtime = Math.max(0, e.total_hours - 38);
        const gross = fmtHours(ordinary * rate + overtime * rate * 1.5);
        const tax = fmtHours(gross * 0.19); // simplified withholding
        const superAmt = fmtHours(gross * superRate);
        csvContent += `${String(i+1).padStart(4,'0')},${e.last_name},${e.first_name},Childcare,Hourly,${rate},${e.total_hours},${gross},${tax},${fmtHours(gross-tax)},${superAmt}\n`;
      });
    } else if (export_type === 'xero') {
      // Xero Payroll import format
      csvContent = 'EarningsRate,EmployeeLastName,EmployeeFirstName,StartDate,EndDate,UnitCount,Amount\n';
      educators.forEach(e => {
        const rate = e.hourly_rate_cents || 30;
        const ordinary = Math.min(e.total_hours, 38);
        const overtime = Math.max(0, e.total_hours - 38);
        if (ordinary > 0) {
          csvContent += `Ordinary Time,${e.last_name},${e.first_name},${from},${to},${ordinary},${fmtHours(ordinary*rate)}\n`;
        }
        if (overtime > 0) {
          csvContent += `Overtime,${e.last_name},${e.first_name},${from},${to},${overtime},${fmtHours(overtime*rate*1.5)}\n`;
        }
      });
    } else {
      // Standard CSV
      csvContent = 'Last Name,First Name,Employment Type,Qualification,Period Start,Period End,Ordinary Hours,Overtime Hours,Total Hours,Hourly Rate,Gross Pay,Super (11.5%),TFN,Bank BSB,Bank Account\n';
      educators.forEach(e => {
        const rate = e.hourly_rate_cents || 30;
        const ordinary = Math.min(e.total_hours, 38);
        const overtime = Math.max(0, e.total_hours - 38);
        const gross = fmtHours(ordinary * rate + overtime * rate * 1.5);
        const superAmt = fmtHours(gross * superRate);
        csvContent += `${e.last_name},${e.first_name},${e.employment_type},${e.qualification},${from},${to},${ordinary},${overtime},${e.total_hours},${rate},${gross},${superAmt},${e.tax_file_number||''},${e.bank_bsb||''},${e.bank_account_number||''}\n`;
      });
    }

    const totalGross = educators.reduce((s,e) => {
      const rate = e.hourly_rate_cents || 30;
      const ordinary = Math.min(e.total_hours, 38);
      const overtime = Math.max(0, e.total_hours - 38);
      return s + ordinary * rate + overtime * rate * 1.5;
    }, 0);

    const exportId = uuid();
    D().prepare(`
      INSERT INTO payroll_exports
        (id, tenant_id, period_start, period_end, export_type, status,
         total_hours, total_cost_cents, educator_count, generated_by, generated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
    `).run(exportId, req.tenantId, from, to, export_type, 'complete',
           fmtHours(educators.reduce((s,e) => s+e.total_hours, 0)),
           Math.round(totalGross * 100),
           educators.length, generated_by || null);

    res.json({
      ok: true,
      export_id: exportId,
      export_type,
      educator_count: educators.length,
      csv: csvContent,
      filename: `payroll-${export_type}-${from}-${to}.csv`,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

r.get('/exports', (req, res) => {
  try {
    const exports = D().prepare(`
      SELECT * FROM payroll_exports WHERE tenant_id=? ORDER BY generated_at DESC LIMIT 20
    `).all(req.tenantId);
    res.json({ exports });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

export default r;
