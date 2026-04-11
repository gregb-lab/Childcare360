import { useState, useEffect, useCallback, useMemo, Suspense, lazy } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import _ from "lodash";
const PlanningWizardView = lazy(() => import("./LearningModule.jsx").then(m => ({ default: m.PlanningWizardView })));
const ObservationsView   = lazy(() => import("./LearningModule.jsx").then(m => ({ default: m.ObservationsView })));
const LearningJourneyModule = lazy(() => import("./LearningJourneyModule.jsx"));
// BUG-ENR-00: lazy chunk was failing to load on sidebar nav (blank white page).
// Switched to an eager import so the module is bundled into the main chunk
// and can't suffer from a stale-chunk cache miss.
import EnrolmentModule from "./EnrolmentModule.jsx";
const StaffWellbeingModule = lazy(() => import("./StaffWellbeingModule.jsx"));
const WaitlistModule = lazy(() => import("./WaitlistModule.jsx"));
const ParentPortalModule = lazy(() => import("./ParentPortalModule.jsx"));
import { UserMenu, useAuth } from "./AuthModule.jsx";

// ─── Global Toast System ─────────────────────────────────────────────────────
// Usage: window.showToast('Saved!') or window.showToast('Error', 'error')
function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    window.showToast = (msg, type = 'success') => {
      const id = Date.now();
      setToasts(t => [...t, { id, msg, type }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    };
    return () => { delete window.showToast; };
  }, []);
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: t.type === 'error' ? '#FEF2F2' : t.type === 'warning' ? '#FFFBEB' : '#F0FDF4',
          color: t.type === 'error' ? '#C9828A' : t.type === 'warning' ? '#D4A26A' : '#6BA38B',
          border: `1px solid ${t.type === 'error' ? '#FECACA' : t.type === 'warning' ? '#FDE68A' : '#BBF7D0'}`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          animation: 'slideInRight 0.3s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>{t.type === 'error' ? '✗' : t.type === 'warning' ? '⚠' : '✓'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Global Confirm Dialog ───────────────────────────────────────────────────
// Usage: const ok = await window.showConfirm('Delete this item?');
// Drop-in replacement for window.confirm() that uses an in-app modal instead
// of the native browser dialog. Returns Promise<boolean>.
function ConfirmDialog() {
  const [state, setState] = useState(null); // { msg, resolve } | null
  useEffect(() => {
    window.showConfirm = (msg) => new Promise(resolve => setState({ msg: String(msg ?? ''), resolve }));
    return () => { delete window.showConfirm; };
  }, []);
  if (!state) return null;
  const respond = (val) => { state.resolve(val); setState(null); };
  return (
    <div onClick={() => respond(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(61,50,72,0.45)', zIndex: 10000,
               display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, padding: '22px 24px', minWidth: 320, maxWidth: 480,
                 boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid #EDE8F4' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FEF2F2',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        color: '#DC2626', fontSize: 18, fontWeight: 700 }}>?</div>
          <div style={{ flex: 1, fontSize: 14, color: '#3D3248', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {state.msg}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => respond(false)} autoFocus
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #DDD6EE', background: '#fff',
                     color: '#7A6E8A', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
          <button onClick={() => respond(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff',
                     cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
const InvoicingDashboard = lazy(() => import("./InvoicingModule.jsx").then(m => ({ default: m.InvoicingDashboard })));
const OwnerPortal = lazy(() => import("./OwnerPortalModule.jsx").then(m => ({ default: m.OwnerPortal })));
const StaffPortalModule = lazy(() => import("./StaffPortalModule.jsx"));
const WeeklyStoryModule = lazy(() => import("./WeeklyStoryModule.jsx"));
const RatioReportModule = lazy(() => import("./RatioReportModule.jsx"));
const PortalEmulator = lazy(() => import("./PortalEmulator.jsx"));
const OperationsModule = lazy(() => import("./OperationsModule.jsx"));
const CRMModule = lazy(() => import("./CRMModule.jsx"));
const CommsModule = lazy(() => import("./CommsModule.jsx"));
const NotificationsInbox = lazy(() => import("./NotificationsPanel.jsx").then(m => ({ default: m.NotificationsInbox })));
const HQDashboard = lazy(() => import("./NotificationsPanel.jsx").then(m => ({ default: m.HQDashboard })));
const NotificationBellLazy = lazy(() => import("./NotificationsPanel.jsx").then(m => ({ default: m.NotificationBell })));
const KioskModule = lazy(() => import("./KioskModule.jsx"));
const PaymentsModule = lazy(() => import("./PaymentsModule.jsx"));
const BulkCommsModule = lazy(() => import("./BulkCommsModule.jsx"));
const ReportsBuilderModule = lazy(() => import("./ReportsBuilderModule.jsx"));
const AIAssistantModule = lazy(() => import("./AIAssistantModule.jsx"));
const ChecklistsModule = lazy(() => import("./ChecklistsModule.jsx"));
const DeveloperAPIModule = lazy(() => import("./DeveloperAPIModule.jsx"));
const AnalyticsModule = lazy(() => import("./AnalyticsModule.jsx"));
const InvoicingFullModule = lazy(() => import("./InvoicingFullModule.jsx"));
const MessageCentreModule = lazy(() => import("./MessageCentreModule.jsx"));
const PayrollModule = lazy(() => import("./PayrollModule.jsx"));
const QualityModule = lazy(() => import("./QualityModule.jsx"));
const ChildDevModule = lazy(() => import("./ChildDevModule.jsx"));
const AdminPowerModule = lazy(() => import("./AdminPowerModule.jsx"));
const CCSModule = lazy(() => import("./CCSModule.jsx"));
const EngagementModule = lazy(() => import("./EngagementModule.jsx"));
const RunSheetModule = lazy(() => import("./RunSheetModule.jsx"));
const RosteringModule = lazy(() => import("./RosteringModule.jsx").then(m => ({ default: m.RosteringModule })));
const EducatorsModule = lazy(() => import("./EducatorsModule.jsx"));
const ChildrenModule = lazy(() => import("./ChildrenModule.jsx"));
const DailyUpdatesModule = lazy(() => import("./DailyUpdatesModule.jsx"));
const ExcursionsModule = lazy(() => import("./ExcursionsModule.jsx"));
const DocumentsModule = lazy(() => import("./DocumentsModule.jsx"));
const IncidentModule = lazy(() => import("./IncidentModule.jsx"));
const RoomsModule = lazy(() => import("./RoomsModule.jsx"));
const MessagingModule = lazy(() => import("./MessagingModule.jsx"));
const MedicationRegisterModule = lazy(() => import("./MedicationRegisterModule.jsx"));
const SOC2Module = lazy(() => import("./SOC2Module.jsx"));
const VoiceAgentModule = lazy(() => import("./VoiceAgentModule.jsx"));
import { INITIAL_CHILDREN, EYLF_OUTCOMES, DEV_DOMAINS, SKILL_LEVELS } from "./nqf-data.js";

// ─── NSW REGULATORY CONSTANTS (NQF Regulation 123) ────────────────────────────
const AGE_GROUPS = [
  { id: "babies", label: "Babies (0–24 months)", minAge: 0, maxAge: 24, ratio: 4, color: "#C9929E" },
  { id: "toddlers", label: "Toddlers (24–36 months)", minAge: 24, maxAge: 36, ratio: 5, color: "#9B7DC0" },
  { id: "preschool", label: "Preschool (36+ months)", minAge: 36, maxAge: 72, ratio: 10, color: "#6BA38B" },
  { id: "oshc", label: "School Age (OSHC)", minAge: 60, maxAge: 156, ratio: 15, color: "#D4A26A" },
];

const QUALIFICATION_LEVELS = [
  { id: "ect", label: "Early Childhood Teacher (ECT)", level: 5, color: "#7E5BA3" },
  { id: "diploma", label: "Diploma of Early Childhood Education & Care", level: 4, color: "#6B89B8" },
  { id: "working_towards_diploma", label: "Working Towards Diploma", level: 3, color: "#5B8DB5" },
  { id: "cert3", label: "Certificate III in Early Childhood Education & Care", level: 2, color: "#4A8A6E" },
  { id: "working_towards", label: "Working Towards Certificate III", level: 1, color: "#B87D47" },
  { id: "unqualified", label: "Unqualified / Volunteer", level: 0, color: "#B45960" },
];

const ECT_REQUIREMENTS = [
  { minChildren: 0, maxChildren: 24, ectRequired: 0, note: "Access to ECT for 20% of operating time" },
  { minChildren: 25, maxChildren: 59, ectRequired: 1, note: "1 ECT must be in attendance" },
  { minChildren: 60, maxChildren: 79, ectRequired: 1, note: "1 ECT + 1 suitably qualified person" },
  { minChildren: 80, maxChildren: 999, ectRequired: 2, note: "2 ECTs required" },
];

const ROSTER_PERIODS = [
  { id: "weekly", label: "Weekly", days: 7 },
  { id: "fortnightly", label: "Fortnightly", days: 14 },
  { id: "monthly", label: "4-Weekly", days: 28 },
];

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ─── SEED DATA ─────────────────────────────────────────────────────────────────
const INITIAL_EDUCATORS = [
  { id: 1, name: "Sarah Mitchell", qualification: "ect", firstAid: true, cprExpiry: "2026-12-01", anaphylaxisExpiry: "2027-06-15", phone: "0412 345 678", email: "sarah.m@sunshinelc.com.au", isUnder18: false, active: true, wwcc: "WWC0012345", wwccExpiry: "2026-06-15", employmentType: "permanent", hourlyRate: 4200, address: "12 Beach Rd, Cronulla NSW 2230" },
  { id: 2, name: "James Chen", qualification: "diploma", firstAid: true, cprExpiry: "2026-08-20", anaphylaxisExpiry: "2026-08-20", phone: "0423 456 789", email: "james.c@sunshinelc.com.au", isUnder18: false, active: true, wwcc: "WWC0012346", wwccExpiry: "2026-03-20", employmentType: "permanent", hourlyRate: 3800, address: "5 Kingsway, Miranda NSW 2228" },
  { id: 3, name: "Emily Watson", qualification: "diploma", firstAid: true, cprExpiry: "2026-03-01", anaphylaxisExpiry: null, phone: "0434 567 890", email: "emily.w@sunshinelc.com.au", isUnder18: false, active: true, wwcc: "WWC0012347", wwccExpiry: "2025-12-01", employmentType: "permanent", hourlyRate: 3800, address: "88 The Esplanade, Cronulla NSW 2230" },
  { id: 4, name: "Priya Sharma", qualification: "cert3", firstAid: true, cprExpiry: "2027-01-10", anaphylaxisExpiry: "2027-01-10", phone: "0445 678 901", email: "priya.s@sunshinelc.com.au", isUnder18: false, active: true, wwcc: "WWC0012348", wwccExpiry: "2026-08-10", employmentType: "permanent", hourlyRate: 3200, address: "22 Railway Pde, Sutherland NSW 2232" },
  { id: 5, name: "Tom Bradley", qualification: "cert3", firstAid: false, cprExpiry: null, anaphylaxisExpiry: null, phone: "0456 789 012", email: "tom.b@sunshinelc.com.au", isUnder18: false, active: true, wwcc: "WWC0012349", wwccExpiry: "2026-01-30", employmentType: "casual", hourlyRate: 3500, address: "14 Oak St, Engadine NSW 2233" },
  { id: 6, name: "Mei Lin", qualification: "ect", firstAid: true, cprExpiry: "2027-02-28", anaphylaxisExpiry: "2027-08-28", phone: "0467 890 123", email: "mei.l@sunshinelc.com.au", isUnder18: false, active: true, wwcc: "WWC0012350", wwccExpiry: "2027-02-28", employmentType: "permanent", hourlyRate: 4200, address: "7 Surf Lane, Woolooware NSW 2230" },
  { id: 7, name: "Alex Nguyen", qualification: "working_towards", firstAid: true, cprExpiry: "2026-11-15", anaphylaxisExpiry: "2026-11-15", phone: "0478 901 234", email: "alex.n@sunshinelc.com.au", isUnder18: true, active: true, wwcc: "WWC0012351", wwccExpiry: "2026-05-15", employmentType: "casual", hourlyRate: 2900, address: "3 School Pde, Gymea NSW 2227" },
  { id: 8, name: "Rachel Foster", qualification: "cert3", firstAid: true, cprExpiry: "2027-05-20", anaphylaxisExpiry: "2027-05-20", phone: "0489 012 345", email: "rachel.f@sunshinelc.com.au", isUnder18: false, active: true, wwcc: "WWC0012352", wwccExpiry: "2026-11-20", employmentType: "part_time", hourlyRate: 3200, address: "45 President Ave, Caringbah NSW 2229" },
];

const INITIAL_ROOMS = [
  { id: 1, name: "Joeys", ageGroup: "babies", capacity: 16, currentChildren: 12 },
  { id: 2, name: "Possums", ageGroup: "toddlers", capacity: 20, currentChildren: 15 },
  { id: 3, name: "Koalas", ageGroup: "preschool", capacity: 30, currentChildren: 22 },
  { id: 4, name: "Kangaroos", ageGroup: "oshc", capacity: 30, currentChildren: 0 },
];

const generateTimeSlots = () => {
  const slots = [];
  for (let h = 6; h <= 18; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hr = h.toString().padStart(2, "0");
      const mn = m.toString().padStart(2, "0");
      slots.push(`${hr}:${mn}`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

const generateId = () => Date.now() + Math.floor(Math.random() * 1000);

const formatTime = (date) => {
  if (!date) return "--:--";
  return new Date(date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });
};

const formatDuration = (ms) => {
  if (!ms || ms < 0) return "0h 0m";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
};

const getWeekDates = (startDate) => {
  const dates = [];
  const start = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
};

// ─── ICONS (inline SVG) ───────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const icons = {
    dashboard: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
    people: <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />,
    schedule: <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />,
    clock: <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />,
    chart: <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />,
    shield: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />,
    warning: <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />,
    check: <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />,
    close: <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />,
    add: <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />,
    edit: <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />,
    room: <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z" />,
    login: <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12H12v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z" />,
    logout: <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />,
    break_icon: <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z" />,
    alert: <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />,
    child: <path d="M13 2v8h8c0-4.42-3.58-8-8-8zm6.32 13.89C20.37 14.54 21 12.84 21 11H6.44l-.95-2H2v2h2.22s1.89 4.07 2.12 4.42c-1.1.59-1.84 1.75-1.84 3.08C4.5 20.43 6.07 22 8 22c1.76 0 3.22-1.3 3.46-3h2.08c.24 1.7 1.7 3 3.46 3 1.93 0 3.5-1.57 3.5-3.5 0-1.04-.46-1.97-1.18-2.61zM8 20c-.83 0-1.5-.67-1.5-1.5S7.17 17 8 17s1.5.67 1.5 1.5S8.83 20 8 20zm9 0c-.83 0-1.5-.67-1.5-1.5S16.17 17 17 17s1.5.67 1.5 1.5S17.83 20 17 20z" />,
    children_icon: <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.01 2.01 0 0 0 18.06 7h-.12a2 2 0 0 0-1.9 1.37l-.86 2.58c1.08.6 1.82 1.73 1.82 3.05v6h3zm-7.5-10.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v6h1.5v7h3zm6.5 0v-4h1v-4c0-.82-.68-1.5-1.5-1.5h-2c-.82 0-1.5.68-1.5 1.5v4h1v4h3z" />,
    learning: <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z" />,
    observation: <path d="M12 6c3.79 0 7.17 2.13 8.82 5.5C19.17 14.87 15.79 17 12 17s-7.17-2.13-8.82-5.5C4.83 8.13 8.21 6 12 6m0-2C7 4 2.73 7.11 1 11.5 2.73 15.89 7 19 12 19s9.27-3.11 11-7.5C21.27 7.11 17 4 12 4zm0 5c1.38 0 2.5 1.12 2.5 2.5S13.38 14 12 14s-2.5-1.12-2.5-2.5S10.62 9 12 9m0-2c-2.48 0-4.5 2.02-4.5 4.5S9.52 16 12 16s4.5-2.02 4.5-4.5S14.48 7 12 7z" />,
    documents: <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm10-9H8v2h8v-2zm0 4H8v2h8v-2z" />,
    invoicing: <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-2.75 5.65c0 1.69-1.34 2.85-3.25 2.85v-1.23c1.22 0 2-.6 2-1.63 0-.97-.62-1.54-1.58-1.86l-.39-.13c-1.42-.48-2.03-1.28-2.03-2.5C6 7.41 7.12 6.5 8.75 6.5v1.23c-.87 0-1.53.48-1.53 1.28 0 .69.5 1.15 1.33 1.42l.39.13c1.63.55 2.31 1.41 2.31 2.86v.23zm3.5 2.85V17.27c1.22 0 2-.6 2-1.63 0-.97-.62-1.54-1.58-1.86l-.39-.13c-1.42-.48-2.03-1.28-2.03-2.5 0-1.74 1.12-2.65 2.75-2.65v1.23c-.87 0-1.53.48-1.53 1.28 0 .69.5 1.15 1.33 1.42l.39.13c1.63.55 2.31 1.41 2.31 2.86 0 1.69-1.34 2.85-3.25 2.85z" />,
    settings: <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />,
    platform: <path d="M12 1L9 9l-8 3 8 3 3 8 3-8 8-3-8-3-3-8z" />,
    smart_toy: <path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      {icons[name] || icons.dashboard}
    </svg>
  );
};

// ─── COMPLIANCE ENGINE ─────────────────────────────────────────────────────────
const calculateRequiredEducators = (childrenByGroup) => {
  const requirements = {};
  let totalRequired = 0;
  AGE_GROUPS.forEach((group) => {
    const count = childrenByGroup[group.id] || 0;
    const required = Math.ceil(count / group.ratio);
    requirements[group.id] = { children: count, required, ratio: `1:${group.ratio}` };
    totalRequired += required;
  });
  return { requirements, totalRequired };
};

const checkQualificationCompliance = (educators) => {
  const activeOnFloor = educators.filter((e) => e.status === "clocked_in" && !e.onBreak);
  const total = activeOnFloor.length;
  if (total === 0) return { compliant: true, diplomaPercent: 0, issues: [] };
  const diplomaOrHigher = activeOnFloor.filter(
    (e) => ["ect", "diploma"].includes(e.qualification)
  ).length;
  const diplomaPercent = (diplomaOrHigher / total) * 100;
  const issues = [];
  if (diplomaPercent < 50) {
    issues.push(`Only ${diplomaPercent.toFixed(0)}% diploma+ qualified (minimum 50% required)`);
  }
  const under18 = activeOnFloor.filter((e) => e.isUnder18);
  const over18 = activeOnFloor.filter((e) => !e.isUnder18);
  if (under18.length > 0 && over18.length === 0) {
    issues.push("Under-18 educators cannot work without an 18+ supervisor");
  }
  return { compliant: issues.length === 0, diplomaPercent, issues };
};

const getECTRequirement = (totalChildren) => {
  return ECT_REQUIREMENTS.find(
    (r) => totalChildren >= r.minChildren && totalChildren <= r.maxChildren
  ) || ECT_REQUIREMENTS[0];
};

// ─── MAIN APP ──────────────────────────────────────────────────────────────────
// ─── Sidebar User Block ─────────────────────────────────────────────────────
function SidebarUserBlock({ collapsed, auth, onSettings }) {
  const [open, setOpen] = useState(false);
  const tenantName = auth?.currentTenant?.name || "";
  const role = auth?.currentTenant?.role || "";
  const email = auth?.user?.email || "";
  const displayName = auth?.user?.name || email.split("@")[0] || "Account";
  const initials = displayName.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() || "U";

  // Use auth.logout() so refresh token is also cleared and auto-login doesn't re-trigger
  const handleLogout = () => {
    if (typeof auth?.logout === "function") {
      auth.logout();
    } else {
      // Fallback: clear all auth keys then reload
      ["c360_token","c360_refresh","c360_tenant","c360_platform_role","c360_email"]
        .forEach(k => localStorage.removeItem(k));
      window.location.reload();
    }
  };

  if (collapsed) {
    return (
      <div style={{borderTop:"1px solid #E8E0D8",padding:"8px 0",display:"flex",
        flexDirection:"column",alignItems:"center",gap:2}}>
        <button onClick={onSettings} title="Settings"
          style={{background:"none",border:"none",cursor:"pointer",color:"#8A7F96",
            padding:"7px 0",width:"100%",display:"flex",justifyContent:"center",fontSize:16,
            transition:"color 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.color="#7C3AED"}
          onMouseLeave={e=>e.currentTarget.style.color="#8A7F96"}>
          ⚙️
        </button>
        <button onClick={handleLogout} title="Sign out"
          style={{background:"none",border:"none",cursor:"pointer",color:"#8A7F96",
            padding:"7px 0",width:"100%",display:"flex",justifyContent:"center",fontSize:16,
            transition:"color 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.color="#C9828A"}
          onMouseLeave={e=>e.currentTarget.style.color="#8A7F96"}>
          🚪
        </button>
      </div>
    );
  }

  return (
    <div style={{borderTop:"1px solid #E8E0D8",padding:"8px 10px",position:"relative"}}>
      <div onClick={() => setOpen(o => !o)}
        style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",borderRadius:10,
          padding:"8px 10px",transition:"background 0.15s"}}
        onMouseEnter={e=>e.currentTarget.style.background="#EDE8F4"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <div style={{width:32,height:32,borderRadius:"50%",
          background:"linear-gradient(135deg,#8B6DAF,#B5A0CC)",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>
          {initials}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:"#3D3248",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {displayName}
          </div>
          <div style={{fontSize:10,color:"#A89DB5",textTransform:"capitalize"}}>
            {role || "Admin"}
          </div>
        </div>
        <span style={{color:"#A89DB5",fontSize:10,flexShrink:0,
          transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▲</span>
      </div>

      {open && (
        <div style={{position:"absolute",bottom:"calc(100% + 4px)",left:8,right:8,
          background:"#fff",border:"1px solid #D9D0C7",
          borderRadius:12,padding:6,boxShadow:"0 -8px 30px rgba(80,60,90,0.12)",zIndex:200}}>
          <div style={{padding:"6px 12px 10px",borderBottom:"1px solid #EDE8F4",marginBottom:4}}>
            <div style={{fontSize:12,fontWeight:600,color:"#3D3248"}}>{displayName}</div>
            <div style={{fontSize:11,color:"#A89DB5"}}>{email}</div>
            {tenantName && <div style={{fontSize:10,color:"#8B6DAF",fontWeight:600,marginTop:2}}>{tenantName}</div>}
          </div>
          <button onClick={() => { onSettings(); setOpen(false); }}
            style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",
              border:"none",borderRadius:8,background:"transparent",color:"#3D3248",
              cursor:"pointer",fontSize:13,fontFamily:"inherit",textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background="#F5F0FB"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            ⚙️ Settings
          </button>
          <button onClick={() => { setOpen(false); handleLogout(); }}
            style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",
              border:"none",borderRadius:8,background:"transparent",color:"#C9828A",
              cursor:"pointer",fontSize:13,fontFamily:"inherit",textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background="#FDF2F2"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            🚪 Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChildcareRosterApp() {
  const auth = useAuth();
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
        localStorage.setItem("c360_active_tab", e.detail.tab);
      }
    };
    window.addEventListener("c360-navigate", handler);
    return () => window.removeEventListener("c360-navigate", handler);
  }, []);
  const [showPortalEmulator, setShowPortalEmulator] = useState(false);
  const [portalEmulatorMode,  setPortalEmulatorMode]  = useState("parent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("c360_sidebar_collapsed") === "true");
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem("c360_collapsed_groups") || "{}"); } catch { return {}; }
  });
  const [pinnedTabs, setPinnedTabs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("c360_pinned_tabs") || "[]"); } catch { return []; }
  });
  const [showFavMenu, setShowFavMenu] = useState(null);
  const toggleGroup = (label) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem("c360_collapsed_groups", JSON.stringify(next));
      return next;
    });
  };
  const togglePin = (itemId, label) => {
    setPinnedTabs(prev => {
      const next = prev.find(p => p.id === itemId)
        ? prev.filter(p => p.id !== itemId)
        : [...prev, { id: itemId, label }];
      localStorage.setItem("c360_pinned_tabs", JSON.stringify(next));
      return next;
    });
  };
  const toggleSidebar = () => setSidebarCollapsed(v => { const n = !v; localStorage.setItem("c360_sidebar_collapsed", n); return n; });
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem("c360_active_tab");
    const validTabs = [
      "dashboard","children","clockinout","kiosk","rooms","daily_updates","child_dev",
      "medication_register","incidents","excursions","operations",
      "learning","learning_journey","observations","run_sheet","stories","ai_assistant","quality",
      "enrolment","waitlist","crm","engagement",
      "educators","roster","compliance","ratio_report","wellbeing","payroll","staff_wellbeing",
      "invoicing","invoicing_full","reports","analytics","ccs","payments",
      "message_centre","comms","bulk_comms","messaging","documents","voice",
      "risk_assessments","reports_builder","developer_api","admin_power","checklists","notifications","soc2",
      "owner_portal","hq_dashboard",
      "parent","staff","settings","rostering","leave_requests"
    ];
    return (saved && validTabs.includes(saved)) ? saved : "dashboard";
  });
  const [educators, setEducators] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [clockRecords, setClockRecords] = useState([]);
  const [rosterEntries, setRosterEntries] = useState([]);
  const [rosterPeriod, setRosterPeriod] = useState("weekly");
  const [rosterStartDate, setRosterStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split("T")[0];
  });
  const [alerts, setAlerts] = useState([]);
  const [showModal, setShowModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [now, setNow] = useState(new Date());
  
  // ── NQF Learning & Development State ──
  const [nqfChildren, setNqfChildren] = useState(INITIAL_CHILDREN);
  const [liveChildCount, setLiveChildCount] = useState(null);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [liveEducatorCount, setLiveEducatorCount] = useState(null);
  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handler = () => { if (window.innerWidth < 768) setSidebarCollapsed(true); };
    handler(); // check on mount
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Fetch live centre status (educators with clock status + rooms from DB)
  useEffect(() => {
    const getHdrs = () => {
      const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
      return t && tid ? { Authorization: "Bearer " + t, "x-tenant-id": tid, "Content-Type": "application/json" } : null;
    };
    const hdrs = getHdrs();
    if (!hdrs) return;
    const safeFetch = (url) => fetch(url, { headers: getHdrs() }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    safeFetch("/api/live-status").then(d => {
      if (d.educators) setEducators(d.educators);
      if (d.rooms) setRooms(d.rooms);
      if (d.educators) setLiveEducatorCount(d.educators.filter(e => e.status === 'clocked_in').length);
    }).catch(() => {});
    safeFetch("/api/children/debug-count").then(d => { if (d.childCount != null) setLiveChildCount(d.childCount); }).catch(() => {});
    safeFetch("/api/educators/all-leave").then(d => { if (Array.isArray(d)) setPendingLeaveCount(d.filter(r => r.status === 'pending').length); }).catch(() => {});
  }, []);
  const [observations, setObservations] = useState([]);
  const [dailyPlans, setDailyPlans] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Compliance calculations ──
  const complianceStatus = useMemo(() => {
    const childrenByGroup = {};
    rooms.forEach((r) => { childrenByGroup[r.ageGroup] = (childrenByGroup[r.ageGroup] || 0) + r.currentChildren; });
    const { requirements, totalRequired } = calculateRequiredEducators(childrenByGroup);
    const activeEducators = educators.filter((e) => e.status === "clocked_in" && !e.onBreak);
    const onBreak = educators.filter((e) => e.onBreak);
    const totalChildren = Object.values(childrenByGroup).reduce((a, b) => a + b, 0);
    const ectReq = getECTRequirement(totalChildren);
    const activeECTs = activeEducators.filter((e) => e.qualification === "ect").length;
    const qualComp = checkQualificationCompliance(educators);
    const ratioMet = activeEducators.length >= totalRequired;
    const ectMet = activeECTs >= ectReq.ectRequired;
    const allCompliant = ratioMet && ectMet && qualComp.compliant;
    return {
      childrenByGroup, requirements, totalRequired,
      activeEducators: activeEducators.length, onBreak: onBreak.length,
      totalChildren, ectReq, activeECTs, ectMet,
      qualComp, ratioMet, allCompliant,
    };
  }, [educators, rooms]);

  // ── Alert generation ──
  useEffect(() => {
    const newAlerts = [];
    if (!complianceStatus.ratioMet) {
      newAlerts.push({ type: "critical", message: `RATIO BREACH: ${complianceStatus.activeEducators} educators active, ${complianceStatus.totalRequired} required` });
    }
    if (!complianceStatus.ectMet) {
      newAlerts.push({ type: "critical", message: `ECT REQUIREMENT: ${complianceStatus.activeECTs} ECTs on floor, ${complianceStatus.ectReq.ectRequired} required` });
    }
    complianceStatus.qualComp.issues.forEach((issue) => {
      newAlerts.push({ type: "warning", message: issue });
    });
    // WWCC/cert alerts come from server via today?.expiring_certs — no client-side duplication
    setAlerts(newAlerts);
  }, [complianceStatus, educators, now]);

  // ── Clock actions ──
  const clockIn = async (educatorId) => {
    const time = new Date();
    const t = localStorage.getItem("c360_token");
    const tid = localStorage.getItem("c360_tenant");
    const hdr = { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) };
    let recordId;
    try {
      const r = await fetch("/api/clock-records", { method: "POST", headers: hdr, body: JSON.stringify({ memberId: educatorId, clockIn: time.toISOString(), date: time.toISOString().split("T")[0] }) }).then(r=>r.json());
      recordId = r.id;
    } catch(e) { recordId = generateId(); }
    setEducators((prev) =>
      prev.map((e) => e.id === educatorId ? { ...e, status: "clocked_in", clockInTime: time.toISOString(), clockRecordId: recordId, onBreak: false, totalBreak: 0 } : e)
    );
    setClockRecords((prev) => [...prev, { id: recordId, educatorId, type: "clock_in", time: time.toISOString(), date: time.toISOString().split("T")[0] }]);
  };

  const clockOut = async (educatorId) => {
    const time = new Date();
    const educator = educators.find((e) => e.id === educatorId);
    if (!educator) return;
    const clockInTime = new Date(educator.clockInTime);
    const totalMs = time - clockInTime - (educator.totalBreak || 0);
    const totalBreakMins = Math.round((educator.totalBreak || 0) / 60000);
    const t = localStorage.getItem("c360_token");
    const tid = localStorage.getItem("c360_tenant");
    const hdr = { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) };
    if (educator.clockRecordId) {
      try { await fetch(`/api/clock-records/${educator.clockRecordId}`, { method: "PUT", headers: hdr, body: JSON.stringify({ clockOut: time.toISOString(), totalBreakMins }) }); } catch(e) {}
    }
    setEducators((prev) =>
      prev.map((e) => e.id === educatorId ? { ...e, status: "clocked_out", clockInTime: null, clockRecordId: null, onBreak: false, breakStart: null, todayHours: e.todayHours + totalMs } : e)
    );
    setClockRecords((prev) => [...prev, { id: generateId(), educatorId, type: "clock_out", time: time.toISOString(), date: time.toISOString().split("T")[0], duration: totalMs }]);
  };

  const startBreak = async (educatorId) => {
    const time = new Date();
    const educator = educators.find((e) => e.id === educatorId);
    const t = localStorage.getItem("c360_token");
    const tid = localStorage.getItem("c360_tenant");
    const hdr = { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) };
    if (educator?.clockRecordId) {
      try { await fetch(`/api/clock-records/${educator.clockRecordId}`, { method: "PUT", headers: hdr, body: JSON.stringify({ breakStart: time.toISOString() }) }); } catch(e) {}
    }
    setEducators((prev) =>
      prev.map((e) => e.id === educatorId ? { ...e, onBreak: true, breakStart: time.toISOString() } : e)
    );
    setClockRecords((prev) => [...prev, { id: generateId(), educatorId, type: "break_start", time: time.toISOString(), date: time.toISOString().split("T")[0] }]);
  };

  const endBreak = async (educatorId) => {
    const time = new Date();
    const educator = educators.find((e) => e.id === educatorId);
    if (!educator) return;
    const breakMs = time - new Date(educator.breakStart);
    const t = localStorage.getItem("c360_token");
    const tid = localStorage.getItem("c360_tenant");
    const hdr = { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) };
    if (educator.clockRecordId) {
      try { await fetch(`/api/clock-records/${educator.clockRecordId}`, { method: "PUT", headers: hdr, body: JSON.stringify({ breakEnd: time.toISOString() }) }); } catch(e) {}
    }
    setEducators((prev) =>
      prev.map((e) => e.id === educatorId ? { ...e, onBreak: false, breakStart: null, totalBreak: (e.totalBreak || 0) + breakMs } : e)
    );
    setClockRecords((prev) => [...prev, { id: generateId(), educatorId, type: "break_end", time: time.toISOString(), date: time.toISOString().split("T")[0], duration: breakMs }]);
  };

  // ── Roster management ──
  const addRosterEntry = (entry) => {
    setRosterEntries((prev) => [...prev, { ...entry, id: generateId() }]);
  };

  const removeRosterEntry = (id) => {
    setRosterEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // ── Educator CRUD ──
  const saveEducator = (data) => {
    if (data.id) {
      setEducators((prev) => prev.map((e) => e.id === data.id ? { ...e, ...data } : e));
    } else {
      setEducators((prev) => [...prev, { ...data, id: generateId(), status: "clocked_out", clockInTime: null, onBreak: false, breakStart: null, totalBreak: 0, todayHours: 0 }]);
    }
    setShowModal(null);
    setEditItem(null);
  };

  // ── Room CRUD ──
  const saveRoom = async (data) => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    const hdr = { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) };
    try {
      if (data.id) {
        await fetch(`/api/rooms/${data.id}`, { method:"PUT", headers:hdr, body:JSON.stringify({ name:data.name, ageGroup:data.ageGroup||data.age_group, capacity:data.capacity, description:data.description }) });
        setRooms(prev => prev.map(r => r.id===data.id ? {...r,...data,age_group:data.ageGroup||data.age_group} : r));
      } else {
        const r = await fetch("/api/rooms", { method:"POST", headers:hdr, body:JSON.stringify({ name:data.name, ageGroup:data.ageGroup, capacity:data.capacity||20, description:data.description }) });
        const nr = await r.json();
        setRooms(prev => [...prev, { ...data, id:nr.id, age_group:data.ageGroup }]);
      }
    } catch(e) { console.error("saveRoom error", e); }
    setShowModal(null);
    setEditItem(null);
  };

  // ── Nav items ──
  // Nav groups: each group has a label and items
  const navGroups = [
    { label: "Overview", items: [
        { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    ]},
    { label: "Children", items: [
        { id: "children", label: "Children", icon: "children_icon" },
        { id: "kiosk", label: "📲 Kiosk Sign-In", icon: "clock" },
        { id: "clockinout", label: "Clock In/Out", icon: "clock" },
        { id: "rooms", label: "Rooms", icon: "room" },
        { id: "daily_updates", label: "Daily Updates", icon: "observation" },
        { id: "child_dev", label: "🌱 Development", icon: "learning" },
        { id: "medication_register", label: "Medications", icon: "shield" },
        { id: "incidents", label: "Incidents", icon: "warning" },
        { id: "excursions", label: "Excursions", icon: "learning" },
        { id: "operations", label: "⚙️ Daily Operations", icon: "settings" },
    ]},
    { label: "Learning", items: [
        { id: "learning", label: "Learning Plans", icon: "learning" },
        { id: "learning_journey", label: "Learning Journeys", icon: "learning" },
        { id: "observations", label: "Observations", icon: "observation" },
        { id: "run_sheet", label: "Run Sheets", icon: "assignment" },
        { id: "stories", label: "✨ Weekly Stories", icon: "learning" },
        { id: "ai_assistant", label: "🤖 AI Assistant", icon: "smart_toy" },
        { id: "quality", label: "🏆 Quality (QIP)", icon: "shield" },
    ]},
    { label: "Enrolment & CRM", items: [
        { id: "enrolment", label: "Enrolments", icon: "people" },
        { id: "waitlist", label: "Waitlist", icon: "people" },
        { id: "crm", label: "🎯 Enquiries & CRM", icon: "chart" },
        { id: "engagement", label: "🤝 Engagement", icon: "people" },
    ]},
    { label: "Staff & Rostering", items: [
        { id: "educators", label: "Educators", icon: "people" },
        { id: "roster", label: "Roster", icon: "schedule" },
        { id: "compliance", label: "Compliance", icon: "shield" },
        { id: "ratio_report", label: "Ratio Report", icon: "chart" },
        { id: "wellbeing", label: "Staff Wellbeing", icon: "people" },
        { id: "leave_requests", label: "Leave Requests", icon: "calendar" },
        { id: "payroll", label: "💵 Payroll Export", icon: "chart" },
    ]},
    { label: "Finance", items: [
        { id: "invoicing_full", label: "💳 Invoicing & Payments", icon: "invoicing" },
        { id: "ccs", label: "💰 CCS & Subsidy", icon: "invoicing" },
        { id: "payments", label: "🔗 Payment Links", icon: "invoicing" },
        { id: "reports", label: "Reports", icon: "chart" },
        { id: "analytics", label: "📈 Analytics", icon: "chart" },
    ]},
    { label: "Message Centre", items: [
        { id: "message_centre", label: "💬 Message Centre", icon: "observation" },
        { id: "documents", label: "Documents", icon: "documents" },
        { id: "voice", label: "AI Voice Agent", icon: "smart_toy" },
    ]},
    { label: "Compliance & Safety", items: [
        { id: "risk_assessments", label: "⚠️ Risk Assessments", icon: "shield" },
        { id: "reports_builder", label: "📊 Report Builder", icon: "chart" },
        { id: "developer_api", label: "🚀 Developer API", icon: "settings" },
        { id: "admin_power", label: "🏢 Admin Power", icon: "dashboard" },
        { id: "notifications", label: "🔔 Notifications", icon: "observation" },
        { id: "soc2", label: "🔒 SOC2 Compliance", icon: "shield" },
    ]},
    ...(auth?.isPlatformAdmin ? [{ label: "Platform", items: [
        { id: "owner_portal", label: "Owner Portal", icon: "platform" },
        { id: "hq_dashboard", label: "🌐 HQ Dashboard", icon: "dashboard" },
    ]}] : []),
  ];

  // Flat list for legacy code that iterates navItems
  const navItems = navGroups.flatMap(g => g.items);

  const criticalAlertCount = alerts.filter((a) => a.type === "critical").length;

  // Platform admin with no tenant — show owner portal only
  if (auth?.isPlatformAdmin && !auth?.currentTenant) {
    return (
      <div style={{ display: "flex", height: "100vh", fontFamily: "'Nunito', 'DM Sans', -apple-system, sans-serif", background: "#FAF7F4", color: "#3D3248", overflow: "hidden" }}>
        <nav style={{ width: 240, background: "#FDFBF9", borderRight: "1px solid #E8E0D8", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "24px 20px", borderBottom: "1px solid #E8E0D8" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                  <defs><linearGradient id="g1" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#8B6DAF"/><stop offset="100%" stopColor="#B5A0CC"/></linearGradient></defs>
                  <rect width="36" height="36" rx="10" fill="url(#g1)"/>
                  <circle cx="18" cy="18" r="11" stroke="white" strokeWidth="2" fill="none" strokeDasharray="4 2"/>
                  <circle cx="18" cy="18" r="6.5" fill="white" fillOpacity="0.95"/>
                  <text x="18" y="21.5" textAnchor="middle" fontSize="6" fontWeight="800" fontFamily="Nunito,sans-serif" fill="#8B6DAF">360</text>
                </svg>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>Childcare360</div>
                <div style={{ fontSize: 11, color: "#A89DB5" }}>Platform Admin</div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, padding: "12px 10px" }}>
            <button style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", background: "rgba(139,109,175,0.10)", color: "#7E5BA3" }}>
              <Icon name="platform" size={18} color="#7E5BA3" /> Owner Portal
            </button>
            {auth.tenants?.length > 0 && (
              <>
                <div style={{ height: 1, background: "#E8E0D8", margin: "12px 12px" }} />
                <div style={{ padding: "4px 14px", fontSize: 11, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Switch to Centre</div>
                {auth.tenants.map(t => (
                  <button key={t.id} onClick={() => auth.switchTenant(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 14px", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit", background: "transparent", color: "#6B5F7A", transition: "all 0.2s" }}>
                    <Icon name="room" size={16} color="#A89DB5" /> {t.name}
                  </button>
                ))}
              </>
            )}
          </div>
          <div style={{ padding: "8px 10px", borderTop: "1px solid #E8E0D8" }}>
            <UserMenu onSettings={() => {}} />
          </div>
        </nav>
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 32px", background: "#FAF7F4" }}>
          <div style={{ animation: "fadeInUp 0.35s ease-out" }}>
            <Suspense fallback={<div style={{padding:40,textAlign:"center",color:"#8A7F96"}}>Loading…</div>}>
              <OwnerPortal />
            </Suspense>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Nunito', 'DM Sans', -apple-system, sans-serif", background: "#FAF7F4", color: "#3D3248", overflow: "hidden" }}>

      {/* ── SIDEBAR ── */}
      <nav style={{ width: sidebarCollapsed ? 64 : 240, background: "#FDFBF9", borderRight: "1px solid #E8E0D8", display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.2s ease", overflow: "hidden" }}>
        <div style={{ padding: sidebarCollapsed ? "16px 0" : "16px 16px 16px 20px", borderBottom: "1px solid #E8E0D8", display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "space-between" }}>
          {!sidebarCollapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="32" height="32" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                <defs><linearGradient id="g1" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#8B6DAF"/><stop offset="100%" stopColor="#B5A0CC"/></linearGradient></defs>
                <rect width="36" height="36" rx="10" fill="url(#g1)"/>
                <circle cx="18" cy="18" r="11" stroke="white" strokeWidth="2" fill="none" strokeDasharray="4 2"/>
                <circle cx="18" cy="18" r="6.5" fill="white" fillOpacity="0.95"/>
                <text x="18" y="21.5" textAnchor="middle" fontSize="6" fontWeight="800" fontFamily="Nunito,sans-serif" fill="#8B6DAF">360</text>
              </svg>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>Childcare360</div>
                <div style={{ fontSize: 10, color: "#A89DB5" }}>v2.9.0</div>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <svg width="32" height="32" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
              <defs><linearGradient id="g1c" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#8B6DAF"/><stop offset="100%" stopColor="#B5A0CC"/></linearGradient></defs>
              <rect width="36" height="36" rx="10" fill="url(#g1c)"/>
              <circle cx="18" cy="18" r="11" stroke="white" strokeWidth="2" fill="none" strokeDasharray="4 2"/>
              <circle cx="18" cy="18" r="6.5" fill="white" fillOpacity="0.95"/>
              <text x="18" y="21.5" textAnchor="middle" fontSize="6" fontWeight="800" fontFamily="Nunito,sans-serif" fill="#8B6DAF">360</text>
            </svg>
          )}
          <button onClick={toggleSidebar} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#A89DB5", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              {sidebarCollapsed
                ? <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z"/>
                : <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>}
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          {/* Favourites */}
          {pinnedTabs.length > 0 && (
            <div>
              {!sidebarCollapsed && (
                <div style={{fontSize:9,fontWeight:800,color:"#C4A8E8",letterSpacing:"0.08em",
                  textTransform:"uppercase",padding:"10px 14px 4px",display:"flex",
                  justifyContent:"space-between",alignItems:"center"}}>
                  <span>⭐ Favourites</span>
                  <span style={{fontSize:8,color:"#7A6B8A",cursor:"pointer"}}
                    onClick={()=>{setPinnedTabs([]);localStorage.removeItem("c360_pinned_tabs");}}>clear</span>
                </div>
              )}
              {pinnedTabs.map(p => (
                <button key={p.id}
                  title={sidebarCollapsed ? p.label : undefined}
                  onClick={() => { setActiveTab(p.id); localStorage.setItem("c360_active_tab", p.id); }}
                  style={{display:"flex",alignItems:"center",gap:sidebarCollapsed?0:10,
                    width:"100%",padding:sidebarCollapsed?"9px 0":"7px 14px",
                    justifyContent:sidebarCollapsed?"center":"flex-start",
                    border:"none",borderRadius:8,cursor:"pointer",fontSize:13,marginBottom:1,
                    fontWeight:activeTab===p.id?700:400,fontFamily:"inherit",
                    background:activeTab===p.id?"rgba(139,109,175,0.12)":"transparent",
                    color:activeTab===p.id?"#C4A8E8":"#8A7F9A"}}>
                  <span style={{fontSize:sidebarCollapsed?16:11}}>⭐</span>
                  {!sidebarCollapsed && <span style={{flex:1,textAlign:"left"}}>{p.label}</span>}
                </button>
              ))}
              <div style={{height:1,background:"rgba(255,255,255,0.08)",margin:"4px 8px 2px"}}/>
            </div>
          )}
          {navGroups.map((group, gi) => {
            const visibleItems = group.items.filter(item => {
              if (auth.currentTenant?.role === "educator") {
                return ["dashboard","clockinout"].includes(item.id);
              }
              return true;
            });
            if (!visibleItems.length) return null;
            return (
              <div key={gi}>
                {group.label && !sidebarCollapsed && (
                  <div onClick={() => toggleGroup(group.label)}
                    style={{fontSize:9,fontWeight:800,color:"#A89DB5",letterSpacing:"0.08em",
                    textTransform:"uppercase",padding:"10px 14px 4px",marginTop:gi>0?4:0,
                    display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",
                    userSelect:"none"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#C4A8E8"}
                    onMouseLeave={e=>e.currentTarget.style.color="#A89DB5"}>
                    <span>{group.label}</span>
                    <span style={{fontSize:8,transition:"transform 0.2s",
                      transform:collapsedGroups[group.label]?"rotate(-90deg)":"rotate(0deg)"}}>▾</span>
                  </div>
                )}
                {gi > 0 && sidebarCollapsed && (
                  <div style={{height:1,background:"rgba(255,255,255,0.08)",margin:"6px 8px"}}/>
                )}

                {(sidebarCollapsed || !collapsedGroups[group.label]) && visibleItems.map((item) => (
                  <button
                    key={item.id}
                    title={sidebarCollapsed ? item.label : undefined}
                    onClick={() => { setActiveTab(item.id); localStorage.setItem("c360_active_tab", item.id); setShowFavMenu(null); }}
                    onContextMenu={(e) => { e.preventDefault(); setShowFavMenu(showFavMenu===item.id?null:item.id); }}
                    onMouseEnter={e => { if (activeTab !== item.id) { e.currentTarget.style.background = "rgba(139,109,175,0.06)"; e.currentTarget.style.color = "#5C4E6A"; }}}
                    onMouseLeave={e => { if (activeTab !== item.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B5F7A"; }}}
                    style={{
                      display: "flex", alignItems: "center", gap: sidebarCollapsed ? 0 : 10,
                      justifyContent: sidebarCollapsed ? "center" : "flex-start",
                      width: "100%", padding: sidebarCollapsed ? "9px 0" : "8px 14px",
                      border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13,
                      fontWeight: activeTab === item.id ? 700 : 500,
                      fontFamily: "inherit", marginBottom: 1, transition: "all 0.15s ease",
                      position: "relative",
                      background: activeTab === item.id ? "rgba(139,109,175,0.12)" : "transparent",
                      color: activeTab === item.id ? "#C4A8E8" : "#8A7F9A",
                    }}
                  >
                    <Icon name={item.icon} size={17} color={activeTab === item.id ? "#C4A8E8" : "#7A7090"} />
                    {!sidebarCollapsed && <span style={{flex:1,textAlign:"left"}}>{item.label}</span>}
                    {!sidebarCollapsed && showFavMenu===item.id && (
                      <span onClick={(e)=>{e.stopPropagation();togglePin(item.id,item.label);setShowFavMenu(null);}}
                        style={{fontSize:11,padding:"1px 6px",borderRadius:6,
                          background:pinnedTabs.find(p=>p.id===item.id)?"#C4A8E822":"#A89DB522",
                          color:"#C4A8E8",cursor:"pointer",fontWeight:700}}>
                        {pinnedTabs.find(p=>p.id===item.id)?"★ Unpin":"☆ Pin"}
                      </span>
                    )}
                    {!sidebarCollapsed && item.badge && (
                      <span style={{background:"#E65100",color:"#fff",borderRadius:10,
                        fontSize:9,fontWeight:800,padding:"1px 5px",minWidth:16,textAlign:"center"}}>
                        {item.badge}
                      </span>
                    )}
                    {!sidebarCollapsed && item.id === "compliance" && criticalAlertCount > 0 && (
                      <span style={{background:"#C9828A",color:"#fff",borderRadius:10,
                        fontSize:9,fontWeight:800,padding:"1px 5px",minWidth:16,textAlign:"center"}}>
                        {criticalAlertCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* User account / settings / logout */}
        <SidebarUserBlock
          collapsed={sidebarCollapsed}
          auth={auth}
          onSettings={() => setActiveTab("settings")}
        />

        {!sidebarCollapsed && !complianceStatus.allCompliant && complianceStatus.totalChildren > 0 && (
          <div style={{ padding: "4px 14px 10px" }}>
            <div onClick={() => setActiveTab("compliance")} style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: "rgba(201,130,138,0.08)",
              border: "1px solid rgba(201,130,138,0.15)",
              color: "#C06B73", textAlign: "center", cursor: "pointer",
            }}>
              ⚠ Non-Compliant
            </div>
          </div>
        )}
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, overflowY: "auto", padding: 0, background: "#FAF7F4", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div key={activeTab} style={{ animation: "fadeInUp 0.35s ease-out", padding: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <header style={{ padding: "20px 32px", borderBottom: "1px solid #E8E0D8", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FDFBF9" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>
              {(()=>{
              const labels = {
                soc2:"SOC2 Compliance", parent_portal:"Parent Portal",
                staff_portal:"Staff Portal", voice:"AI Voice Agent",
                excursions:"Excursions", observations:"Observations",
                daily_updates:"Live Updates", wellbeing:"Staff Wellbeing",
                medication_register:"Medication Register",
                learning_journey:"Learning Journey",
              };
              return navItems.find(n=>n.id===activeTab)?.label || labels[activeTab] || activeTab;
            })()}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#A89DB5" }}>
              {["children","learning","observations"].includes(activeTab)
                ? `EYLF V2.0 / MTOP V2.0 · ${now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`
                : activeTab === "documents"
                ? "Pending Review · Children's Docs · Educator Docs"
                : activeTab === "invoicing"
                ? "Fee Schedules · CCS Subsidies · Invoices · Payments"
                : `${now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · ${now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
              }
            </p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,position:"relative"}}>
            {/* Notification Bell */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowNotifications(v=>!v)}
                style={{position:"relative",border:"none",cursor:"pointer",padding:6,borderRadius:8,
                  background:showNotifications?"#EDE8F4":"transparent"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={notifications.length>0?"#E65100":"#8A7F96"} strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {notifications.length>0&&(
                  <span style={{position:"absolute",top:2,right:2,background:"#E65100",color:"#fff",borderRadius:"50%",
                    width:16,height:16,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotifications&&(
                <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,width:300,background:"#fff",
                  borderRadius:12,border:"1px solid #EDE8F4",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:1000}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #EDE8F4",fontWeight:700,fontSize:13,color:"#3D3248"}}>
                    Notifications {notifications.length>0&&<span style={{color:"#E65100"}}>({notifications.length})</span>}
                  </div>
                  {notifications.length===0?(
                    <div style={{padding:"20px 16px",textAlign:"center",color:"#A89DB5",fontSize:12}}>✅ All clear — no alerts</div>
                  ):notifications.map(n=>(
                    <div key={n.id} onClick={()=>{setActiveTab(n.tab);setShowNotifications(false);}}
                      style={{padding:"10px 16px",borderBottom:"1px solid #F5F0FB",cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start",
                        background:"transparent"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#F8F5FC"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:14,flexShrink:0}}>{n.type==="error"?"🔴":n.type==="warn"?"🟡":"🔵"}</span>
                      <span style={{fontSize:12,color:"#3D3248",lineHeight:1.4}}>{n.msg}</span>
                    </div>
                  ))}
                  <div style={{padding:"8px 16px",textAlign:"center"}}>
                    <button onClick={()=>setShowNotifications(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#8A7F96"}}>Dismiss</button>
                  </div>
                </div>
              )}
            </div>
            {alerts.length > 0 && (
              <div onClick={() => setActiveTab("compliance")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, background: "rgba(201,130,138,0.12)", border: "1px solid rgba(201,130,138,0.2)", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(201,130,138,0.22)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(201,130,138,0.12)"}>
                <Icon name="alert" size={16} color="#C9828A" />
                <span style={{ fontSize: 12, color: "#C9828A", fontWeight: 600 }}>{alerts.length} Alert{alerts.length !== 1 ? "s" : ""}</span>
              </div>
            )}
            <Suspense fallback={null}><NotificationBellLazy onOpenInbox={() => setActiveTab("notifications")} /></Suspense>
            <UserMenu onSettings={() => setActiveTab("settings")} />
          </div>
        </header>

        <div style={{ padding: "24px 32px" }}>
          <Suspense fallback={
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
              height:"60vh", flexDirection:"column", gap:16 }}>
              <div style={{ fontSize:36 }}>⚙️</div>
              <div style={{ color:"#8A7F96", fontSize:14 }}>Loading…</div>
            </div>
          }>
          {activeTab === "dashboard" && <DashboardView complianceStatus={complianceStatus} educators={educators} rooms={rooms} alerts={alerts} clockRecords={clockRecords} now={now} onNavigate={setActiveTab} />}
          {activeTab === "educators" && <EducatorsModule />}
          {activeTab === "rooms" && <RoomsModule />}
          {activeTab === "roster" && <RosteringModule />}
          {activeTab === "clockinout" && <ClockInOutView educators={educators} clockIn={clockIn} clockOut={clockOut} startBreak={startBreak} endBreak={endBreak} now={now} clockRecords={clockRecords} />}
          {activeTab === "compliance" && <ComplianceView complianceStatus={complianceStatus} alerts={alerts} educators={educators} rooms={rooms} />}
          {activeTab === "children" && <ChildrenModule />}
          {activeTab === "daily_updates" && <DailyUpdatesModule />}
          {activeTab === "learning_journey" && <LearningJourneyModule />}
          {activeTab === "enrolment" && <EnrolmentModule />}
          {activeTab === "waitlist" && <WaitlistModule />}
          {activeTab === "stories" && <WeeklyStoryModule />}
          {activeTab === "ratio_report" && <RatioReportModule />}
          {activeTab === "operations" && <OperationsModule />}
          {activeTab === "crm" && <CRMModule />}
          {activeTab === "engagement" && <EngagementModule />}
          {activeTab === "ccs" && <CCSModule />}
          {activeTab === "admin_power" && <AdminPowerModule />}
          {activeTab === "child_dev" && <ChildDevModule />}
          {activeTab === "quality" && <QualityModule />}
          {activeTab === "kiosk" && <KioskModule />}
          {activeTab === "payroll" && <PayrollModule />}
          {activeTab === "wellbeing" && <StaffWellbeingModule />}
          {activeTab === "leave_requests" && <LeaveRequestsView />}
          {activeTab === "parent" && <Suspense fallback={null}><PortalEmulator mode="parent" onClose={() => setActiveTab("dashboard")} ParentModule={ParentPortalModule} StaffModule={StaffPortalModule} /></Suspense>}
          {activeTab === "excursions" && <ExcursionsModule />}
          {activeTab === "incidents" && <IncidentModule />}
          {activeTab === "run_sheet" && <RunSheetModule />}
          {activeTab === "documents" && <DocumentsModule />}
          {activeTab === "medication_register" && <MedicationRegisterModule />}
          {activeTab === "learning" && <PlanningWizardView children={nqfChildren} rooms={rooms} dailyPlans={dailyPlans} setDailyPlans={setDailyPlans} />}
          {activeTab === "observations" && <ObservationsView children={nqfChildren} rooms={rooms} observations={observations} setObservations={setObservations} />}
          {activeTab === "invoicing" && <InvoicingDashboard children={nqfChildren} />}
          {activeTab === "messaging" && <MessagingModule />}
          {activeTab === "reports" && <ReportsView educators={educators} rooms={rooms} clockRecords={clockRecords} complianceStatus={complianceStatus} rosterEntries={rosterEntries} />}
          {activeTab === "staff" && <Suspense fallback={null}><PortalEmulator mode="staff" onClose={() => setActiveTab("dashboard")} ParentModule={ParentPortalModule} StaffModule={StaffPortalModule} /></Suspense>}
          {activeTab === "settings" && <SettingsView />}
          {activeTab === "soc2" && <SOC2Module tenantId={auth.currentTenant?.id} />}
          {activeTab === "voice" && <VoiceAgentModule />}
          {activeTab === "message_centre" && <Suspense fallback={null}><MessageCentreModule /></Suspense>}
          {activeTab === "comms" && <Suspense fallback={null}><CommsModule /></Suspense>}
          {activeTab === "bulk_comms" && <Suspense fallback={null}><BulkCommsModule /></Suspense>}
          {activeTab === "reports_builder" && <Suspense fallback={null}><ReportsBuilderModule /></Suspense>}
          {activeTab === "developer_api" && <Suspense fallback={null}><DeveloperAPIModule /></Suspense>}
          {activeTab === "ai_assistant" && <Suspense fallback={null}><AIAssistantModule /></Suspense>}
          {activeTab === "analytics" && <Suspense fallback={null}><AnalyticsModule /></Suspense>}
          {activeTab === "invoicing_full" && <Suspense fallback={null}><InvoicingFullModule /></Suspense>}
          {activeTab === "checklists" && <Suspense fallback={null}><ChecklistsModule /></Suspense>}
          {activeTab === "risk_assessments" && <Suspense fallback={null}><ReportsBuilderModule /></Suspense>}
          {activeTab === "staff_wellbeing" && <Suspense fallback={null}><StaffWellbeingModule /></Suspense>}
          {activeTab === "notifications" && <Suspense fallback={null}><NotificationsInbox /></Suspense>}
          {activeTab === "hq_dashboard" && <Suspense fallback={null}><HQDashboard /></Suspense>}
          {activeTab === "payments" && <Suspense fallback={null}><PaymentsModule /></Suspense>}
          {activeTab === "owner_portal" && auth?.isPlatformAdmin && <OwnerPortal />}
          </Suspense>
        </div>
        </div>
      </main>

      {/* ── MODALS ── */}
      {showModal === "educator" && <EducatorModal educator={editItem} onSave={saveEducator} onClose={() => { setShowModal(null); setEditItem(null); }} />}
      {showModal === "room" && <RoomModal room={editItem} onSave={saveRoom} onClose={() => { setShowModal(null); setEditItem(null); }} />}
      <ToastContainer />
      <ConfirmDialog />
      <style>{`
        @keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

// ─── SHARED STYLES ─────────────────────────────────────────────────────────────
const cardStyle = { background: "#FFFFFF", borderRadius: 14, border: "1px solid #E8E0D8", padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(80,60,90,0.04)", transition: "all 0.25s ease" };
const btnPrimary = { padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #8B6DAF, #9B7DC0)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 3px 10px rgba(139,109,175,0.2)", transition: "all 0.2s ease" };
const btnSecondary = { padding: "8px 16px", borderRadius: 10, border: "1px solid #D9D0C7", background: "#F8F5F1", color: "#5C4E6A", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease" };
const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #D9D0C7", background: "#F8F5F1", color: "#3D3248", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.2s, box-shadow 0.2s" };
const selectStyle = { ...inputStyle, cursor: "pointer" };
const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#8A7F96", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" };
const tagStyle = (color) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}30` });

// ─── STAT CARD ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "#8B6DAF", icon, onClick }) {
  return (
    <div onClick={onClick} style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 14, padding: 18, flex: "1 1 0", borderRadius: 16, cursor: onClick ? "pointer" : "default", boxShadow: "0 2px 12px rgba(80,60,90,0.04)" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 25px rgba(80,60,90,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(80,60,90,0.04)"; }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon || "dashboard"} size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: "#8A7F96", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#A89DB5", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── LEAVE REQUESTS VIEW ──────────────────────────────────────────────────────
function LeaveRequestsView() {
  const [leaves, setLeaves] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [noteModal, setNoteModal] = useState(null); // { leaveId, educatorId, action, notes }
  const [processing, setProcessing] = useState(null);

  const API2 = (path, opts={}) => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    return fetch(path, { method: opts.method||"GET",
      headers: { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}) }).then(r => r.json());
  };

  const load = useCallback(() => {
    setLoading(true);
    API2("/api/educators/all-leave").then(data => {
      setLeaves(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAction = (educatorId, leaveId, action) => {
    setNoteModal({ leaveId, educatorId, action, notes: "" });
  };

  const confirmAction = async () => {
    if (!noteModal) return;
    setProcessing(noteModal.leaveId);
    try {
      await API2(`/api/educators/${noteModal.educatorId}/leave/${noteModal.leaveId}`, {
        method: "PUT", body: { status: noteModal.action, notes: noteModal.notes || null }
      });
      await load(); // reload from server to get persisted state
      if (window.showToast) window.showToast(`Leave request ${noteModal.action}`, "success");
    } catch (e) {
      if (window.showToast) window.showToast("Action failed", "error");
    }
    setProcessing(null);
    setNoteModal(null);
  };

  const filtered = filter === "all" ? leaves : leaves.filter(l => l.status === filter);
  const counts = { all: leaves.length, pending: leaves.filter(l=>l.status==="pending").length, approved: leaves.filter(l=>l.status==="approved").length, denied: leaves.filter(l=>l.status==="denied").length };

  const thS = { padding: "10px 8px", color: "#5C4E6A", fontSize: 11, fontWeight: 700, textTransform: "uppercase", textAlign: "left" };
  const tdS = { padding: "10px 8px", fontSize: 13 };
  const actionBtn = (color, bg, border) => ({ padding: "4px 10px", borderRadius: 6, border: `1px solid ${border}`, background: bg, color, fontWeight: 700, fontSize: 10, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#3D2C4E", marginBottom: 16 }}>Leave Requests</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["all","pending","approved","denied"].map(v => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ padding: "7px 16px", borderRadius: 8, border: filter === v ? "none" : "1px solid #D9D0C7",
              background: filter === v ? "linear-gradient(135deg, #8B6DAF, #9B7DC0)" : "#F8F5F1",
              color: filter === v ? "#fff" : "#5C4E6A", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {v.charAt(0).toUpperCase() + v.slice(1)} {counts[v] > 0 ? `(${counts[v]})` : ""}
          </button>
        ))}
      </div>
      <div style={cardStyle}>
        {loading ? <div style={{ textAlign: "center", padding: 32, color: "#8A7F96" }}>Loading...</div> : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#8A7F96" }}>No {filter !== "all" ? filter + " " : ""}leave requests found.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
                <th style={thS}>Educator</th><th style={thS}>Type</th><th style={thS}>Dates</th>
                <th style={thS}>Days</th><th style={thS}>Reason</th><th style={thS}>Notes</th>
                <th style={thS}>Status</th><th style={thS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const leaveId = l.id || l.leave_id;
                const educatorId = l.educator_id;
                const start = l.start_date || "";
                const end = l.end_date || "";
                const days = l.days_requested || l.days || (start && end ? Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1) : "—");
                const isBusy = processing === leaveId;
                return (
                  <tr key={leaveId || i} style={{ borderBottom: "1px solid #F0EBE5", opacity: isBusy ? 0.5 : 1 }}>
                    <td style={{ ...tdS, fontWeight: 600 }}>{l.educator_name || "—"}</td>
                    <td style={tdS}><span style={{ textTransform: "capitalize" }}>{(l.leave_type || "—").replace(/_/g," ")}</span></td>
                    <td style={tdS}>{start}{end && start !== end ? ` → ${end}` : ""}</td>
                    <td style={tdS}>{days}</td>
                    <td style={{ ...tdS, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.reason || "—"}</td>
                    <td style={{ ...tdS, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "#8A7F96" }}>{l.notes || "—"}</td>
                    <td style={tdS}>
                      <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                        background: l.status === "approved" ? "#DEF7EC" : l.status === "denied" ? "#FDE8E8" : "#FEF3CD",
                        color: l.status === "approved" ? "#03543F" : l.status === "denied" ? "#9B1C1C" : "#92400E"
                      }}>{(l.status || "pending").toUpperCase()}</span>
                    </td>
                    <td style={{ ...tdS, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {l.status === "pending" && <>
                          <button style={actionBtn("#03543F","#DEF7EC","#A7F3D0")} onClick={() => openAction(educatorId, leaveId, "approved")}>✓ Approve</button>
                          <button style={actionBtn("#9B1C1C","#FDE8E8","#FCA5A5")} onClick={() => openAction(educatorId, leaveId, "denied")}>✗ Deny</button>
                        </>}
                        {l.status === "approved" && <button style={actionBtn("#92400E","#FEF3CD","#FDE68A")} onClick={() => openAction(educatorId, leaveId, "pending")}>↩ Revert</button>}
                        {l.status === "denied" && <button style={actionBtn("#92400E","#FEF3CD","#FDE68A")} onClick={() => openAction(educatorId, leaveId, "pending")}>↩ Revert</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Action confirmation modal with notes */}
      {noteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#3D3248" }}>
              {noteModal.action === "approved" ? "✓ Approve Leave" : noteModal.action === "denied" ? "✗ Deny Leave" : "↩ Revert to Pending"}
            </h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5C4E6A", marginBottom: 4 }}>Notes (optional)</label>
              <textarea
                value={noteModal.notes} onChange={e => setNoteModal({ ...noteModal, notes: e.target.value })}
                placeholder={noteModal.action === "denied" ? "Reason for denial..." : "Add a note..."}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, resize: "vertical", minHeight: 60, boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setNoteModal(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D9D0C7", background: "#F8F5F1", color: "#5C4E6A", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={confirmAction} disabled={!!processing}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none",
                  background: noteModal.action === "approved" ? "#16A34A" : noteModal.action === "denied" ? "#DC2626" : "#D97706",
                  color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: processing ? 0.6 : 1 }}>
                {processing ? "Processing..." : noteModal.action === "approved" ? "Confirm Approve" : noteModal.action === "denied" ? "Confirm Deny" : "Revert to Pending"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD VIEW ────────────────────────────────────────────────────────────
function DashboardView({ complianceStatus, educators, rooms, alerts, clockRecords, now, onNavigate }) {
  const [today, setToday] = useState(null);
  const [ratioData, setRatioData] = useState(null);
  const [ratioLoading, setRatioLoading] = useState(false);

  const getHdrs = () => {
    const tok = localStorage.getItem("c360_token");
    const tid = localStorage.getItem("c360_tenant");
    return { "Content-Type":"application/json", ...(tok?{Authorization:`Bearer ${tok}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) };
  };
  const hdrs = getHdrs();

  // Fetch with auto-refresh on 401
  const authFetch = async (url, opts = {}) => {
    let res = await fetch(url, { ...opts, headers: getHdrs() });
    if (res.status === 401) {
      const rt = localStorage.getItem("c360_refresh");
      if (rt) {
        try {
          const rr = await fetch("/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) });
          if (rr.ok) { const d = await rr.json(); localStorage.setItem("c360_token", d.accessToken); if (d.refreshToken) localStorage.setItem("c360_refresh", d.refreshToken); res = await fetch(url, { ...opts, headers: getHdrs() }); }
        } catch {}
      }
    }
    return res;
  };

  // Load dashboard data + auto-load ratio on mount
  useEffect(() => {
    authFetch("/api/dashboard/today").then(r=>r.json()).then(d=>{
      if (!d.error) setToday(d);
    }).catch(()=>{});
    // Auto-load ratio compliance with timeout fallback
    const loadRatio = () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const ctrl = new AbortController();
      const timer = setTimeout(() => { ctrl.abort(); setRatioData({ intervals: [], total_slots: 0, improvements_needed: 0 }); }, 5000);
      authFetch(`/api/roster/ratio-interval?date=${todayStr}`, { signal: ctrl.signal })
        .then(r=>r.json()).then(d=>{ clearTimeout(timer); setRatioData(d.error ? { intervals:[], total_slots:0, improvements_needed:0 } : d); })
        .catch(()=>{ clearTimeout(timer); setRatioData({ intervals:[], total_slots:0, improvements_needed:0 }); });
    };
    loadRatio();
    const iv = setInterval(loadRatio, 30*60*1000);
    return () => clearInterval(iv);
  }, []);

  const P2="#7C3AED",OK2="#16A34A",WA2="#D97706",DA2="#DC2626",IN2="#0284C7",MU2="#8A7F96";
  const card2={background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"18px 22px"};

  const rp = today?.responsible_person;
  const rpName = rp ? `${rp.first_name} ${rp.last_name}` : "Not assigned";
  const rpInitials = rp ? `${rp.first_name?.[0]||""}${rp.last_name?.[0]||""}` : "?";
  const rpQualColor = {ect:"#7C3AED",diploma:"#0284C7",cert3:"#16A34A",working_towards:"#D97706"}[rp?.qualification] || MU2;

  // FIX 1+2: Correct navigation targets
  const quickActions = [
    { icon:"📝", label:"Write Post",         tab:"message_centre",     color:"#7C3AED" },
    { icon:"📋", label:"Enrolment Forms",     tab:"enrolment",          color:"#0284C7", count: today?.enrolment_forms },
    { icon:"⏳", label:"Waitlist",            tab:"waitlist",           color:"#16A34A" },
    { icon:"🚨", label:"Incidents",           tab:"incidents",          color:"#DC2626", count: today?.active_incidents },
    { icon:"🏖️", label:"Leave Requests",     tab:"leave_requests",     color:"#D97706", count: today?.pending_leave },
    { icon:"🚪", label:"Sign In/Out",         tab:"clockinout",         color:"#0284C7" },
    { icon:"✅", label:"Checklists",          tab:"checklists",         color:"#16A34A", count: today?.checklists_pending },
    { icon:"💊", label:"Medication Today",    tab:"medication_register", color:"#DC2626", count: today?.medication_today, alert: (today?.medication_today||0) > 0 },
    { icon:"📁", label:"Expiring Docs",       tab:"documents",          color:"#D97706", count: today?.expiring_certs?.length, preAction: () => localStorage.setItem('c360_docs_tab','expiring') },
    { icon:"🏥", label:"Expiring Certs",      tab:"educators",          color:"#E65100", count: today?.expiring_certs?.length, preAction: () => localStorage.setItem('c360_educator_tab','certexpiry') },
  ];

  // FIX 3: Use today API data consistently for KPIs
  const signedIn = today?.signed_in_today ?? educators.filter(e=>e.status==="clocked_in").length;
  const clockedIn = today?.educators_clocked_in ?? educators.filter(e=>e.status==="clocked_in").length;
  const enrolled = today?.children_enrolled ?? 0;
  const attRate = enrolled > 0 ? Math.round(signedIn / enrolled * 100) : 0;

  // FIX 5: Full qualification + compliance data
  const totalEds = educators.length;
  const qualRows = [
    { label:"ECT (Bachelor+)", key:"ect", color:"#7C3AED" },
    { label:"Diploma", key:"diploma", color:"#0284C7" },
    { label:"Certificate III", key:"cert3", color:"#16A34A" },
    { label:"Working Towards Dip", key:"working_towards_diploma", color:"#5B8DB5" },
    { label:"Working Towards C3", key:"working_towards", color:"#D97706" },
  ];
  const certRows = [
    { label:"First Aid Current", check: e => e.firstAid || e.first_aid, color:"#16A34A" },
    { label:"WWCC Current", check: e => e.wwccExpiry && new Date(e.wwccExpiry) > new Date(), color:"#16A34A" },
    { label:"WWCC Expiring Soon", check: e => { const d = e.wwccExpiry ? (new Date(e.wwccExpiry) - new Date()) / 86400000 : 999; return d > 0 && d < 30; }, color:"#D97706" },
  ];

  // FIX 4: Deduplicate alerts by educator name
  const deduped = {};
  (today?.expiring_certs||[]).forEach(c => {
    const key = `${c.first_name} ${c.last_name}`;
    if (!deduped[key]) deduped[key] = { ...c, certs: [] };
    deduped[key].certs.push(c.cert_type);
    if (c.id && !deduped[key].id) deduped[key].id = c.id;
  });
  const dedupedAlerts = Object.values(deduped);

  return (
    <div style={{ padding:"24px 28px" }}>

      {/* ── RESPONSIBLE PERSON ON DUTY ── */}
      <div style={{ ...card2, marginBottom:16, background:"linear-gradient(135deg,#F8F5FC,#EDE4F0)",
        borderLeft:"4px solid #7C3AED", display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ width:52, height:52, borderRadius:14,
          background:rp ? `linear-gradient(135deg,${rpQualColor},${rpQualColor}AA)` : "#E8E0D8",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:20, fontWeight:800, color:"#fff", flexShrink:0 }}>
          {rpInitials}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:MU2, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em" }}>
            Responsible Person on Duty
          </div>
          <div style={{ fontSize:18, fontWeight:800, color:"#3D3248", marginTop:2 }}>{rpName}</div>
          {rp && <div style={{ fontSize:11, color:rpQualColor, fontWeight:600, textTransform:"uppercase" }}>{rp.qualification?.replace("_"," ")}</div>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
          <div style={{ fontSize:12, color:MU2 }}>
            {new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          {(today?.medication_today||0) > 0 && (
            <div onClick={()=>onNavigate("medication_register")}
              style={{ background:"#FEF2F2", border:"1px solid #FCA5A5", color:"#DC2626",
                padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer" }}>
              💊 {today.medication_today} Medication{today.medication_today!==1?"s":""} Today
            </div>
          )}
        </div>
      </div>

      {/* ── QUICK ACTION BAR ── */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:20, padding:"12px 16px",
        background:"#fff", borderRadius:12, border:"1px solid #EDE8F4" }}>
        {quickActions.map(a => (
          <button key={a.label} onClick={()=>{ if(a.preAction) a.preAction(); onNavigate(a.tab); }}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px",
              borderRadius:20, border:`1px solid ${a.color}22`, background:`${a.color}08`,
              color:"#3D3248", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit", position:"relative",
              outline: a.alert?"2px solid #DC2626":"none" }}>
            <span>{a.icon}</span>
            <span>{a.label}</span>
            {(a.count||0) > 0 && (
              <span style={{ background:a.color, color:"#fff", borderRadius:10,
                padding:"1px 6px", fontSize:10, fontWeight:800, minWidth:16, textAlign:"center" }}>
                {a.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── KPI ROW (FIX 3 + 7: real data) ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Children Enrolled", val: enrolled, icon:"👶", color:P2, click:"children" },
          { label:"Signed In Today",   val: signedIn, icon:"🟢", color:OK2, click:"clockinout" },
          { label:"Staff On Duty",     val: clockedIn, icon:"👩‍🏫", color:IN2, click:"clockinout" },
          { label:"Attendance Rate",   val: `${attRate}%`, icon:"📊", color:attRate>=80?OK2:attRate>=60?WA2:DA2 },
        ].map(k => (
          <div key={k.label} onClick={()=>k.click && onNavigate(k.click)}
            style={{ ...card2, textAlign:"center", padding:"16px", cursor:k.click?"pointer":undefined }}>
            <div style={{ fontSize:22, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.color }}>{k.val}</div>
            <div style={{ fontSize:11, color:MU2, fontWeight:600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── ROOM CARDS + RATIO COMPLIANCE (FIX 6: auto-loaded) ── */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:20 }}>
        <div style={card2}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:14, color:"#3D3248" }}>Rooms</div>
            <div style={{ fontSize:12, color:MU2 }}>signed in today / enrolled</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
            {(today?.room_occupancy || []).map(r => {
              const pct = r.capacity > 0 ? Math.round(r.enrolled / r.capacity * 100) : 0;
              const barColor = pct >= 90 ? DA2 : pct >= 75 ? WA2 : OK2;
              return (
                <div key={r.id} onClick={()=>onNavigate("rooms")} style={{ background:"#F8F5FC", borderRadius:10, padding:"10px 12px", border:"1px solid #EDE8F4", cursor:"pointer" }}>
                  <div style={{ fontWeight:700, fontSize:12, color:"#3D3248", marginBottom:4 }}>{r.name}</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                    <span style={{ fontSize:20, fontWeight:800, color:OK2 }}>{r.signedIn || 0}</span>
                    <span style={{ fontSize:12, color:MU2 }}>/ {r.enrolled}</span>
                    <span style={{ fontSize:10, color:MU2 }}>({r.capacity} cap)</span>
                  </div>
                  <div style={{ height:4, background:"#EDE8F4", borderRadius:4, marginTop:6 }}>
                    <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:barColor, borderRadius:4, transition:"width 0.3s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FIX 6: Ratio always shown, auto-refreshes */}
        <div style={card2}>
          <div style={{ fontWeight:700, fontSize:14, color:"#3D3248", marginBottom:4 }}>Ratio Compliance</div>
          <div style={{ fontSize:11, color:MU2, marginBottom:10 }}>30-min interval · auto-refreshes</div>
          {!ratioData ? (
            <div style={{ textAlign:"center", padding:20, color:MU2, fontSize:12 }}>Loading ratio data...</div>
          ) : (
            <div>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={{ flex:1, background:"#FEF2F2", borderRadius:8, padding:"6px 10px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:DA2 }}>{ratioData.improvements_needed||0}</div>
                  <div style={{ fontSize:9, color:DA2, fontWeight:700 }}>NON-COMPLIANT</div>
                </div>
                <div style={{ flex:1, background:"#F0FDF4", borderRadius:8, padding:"6px 10px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:OK2 }}>{(ratioData.total_slots||0)-(ratioData.improvements_needed||0)}</div>
                  <div style={{ fontSize:9, color:OK2, fontWeight:700 }}>COMPLIANT</div>
                </div>
              </div>
              <div style={{ maxHeight:160, overflowY:"auto" }}>
                {(ratioData.intervals||[]).filter(i=>i.children_count>0).map(iv=>(
                  <div key={iv.slot} style={{ display:"flex", alignItems:"center", gap:6, padding:"2px 0",
                    borderBottom:"1px solid #F5F0FF", fontSize:11 }}>
                    <span style={{ minWidth:38, color:MU2, fontFamily:"monospace" }}>{iv.slot}</span>
                    <span style={{ minWidth:20, color:"#3D3248" }}>👶{iv.children_count}</span>
                    <span style={{ minWidth:20, color:"#3D3248" }}>👩‍🏫{iv.staff_count}</span>
                    {iv.deficit > 0
                      ? <span style={{ background:DA2, color:"#fff", borderRadius:10, padding:"1px 6px", fontWeight:700, fontSize:10 }}>-{iv.deficit}</span>
                      : <span style={{ color:OK2, fontWeight:700 }}>✓</span>
                    }
                  </div>
                ))}
              </div>
              <button onClick={()=>onNavigate("ratio_report")} style={{ padding:"7px 14px",borderRadius:8,border:`1px solid ${P2}`,background:"#fff",color:P2,fontWeight:600,cursor:"pointer",fontSize:12, marginTop:8, width:"100%", fontFamily:"inherit" }}>
                Full Ratio Report →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── ALERTS + EDUCATOR QUALS + COMPLIANCE ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* FIX 4: Deduplicated alerts, clickable */}
        <div style={card2}>
          <div style={{ fontWeight:700, fontSize:14, color:"#3D3248", marginBottom:12 }}>Alerts & Actions</div>
          {alerts.length === 0 && dedupedAlerts.length === 0 ? (
            <div style={{ color:OK2, fontSize:13, fontWeight:600 }}>✅ No outstanding alerts</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {alerts.slice(0,5).map((a,i) => (
                <div key={i} onClick={()=>onNavigate("educators")} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
                  borderRadius:8, cursor:"pointer",
                  background: a.type==="critical"?"#FEF2F2":"#FFFBEB",
                  border:`1px solid ${a.type==="critical"?"#FCA5A5":"#FDE68A"}`,
                  fontSize:12, color: a.type==="critical"?DA2:WA2 }}>
                  {a.type==="critical"?"🔴":"🟡"} {a.message}
                </div>
              ))}
              {dedupedAlerts.map((c,i) => (
                <div key={"cert-"+i} onClick={()=>{ if(c.id) localStorage.setItem('c360_educator_select',c.id); onNavigate("educators"); }} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
                  borderRadius:8, background:"#FFFBEB", border:"1px solid #FDE68A", fontSize:12, color:WA2, cursor:"pointer" }}>
                  ⚠️ {c.first_name} {c.last_name} — {c.certs.join(", ")} expiring {c.expires_on ? `(${c.expires_on})` : "soon"}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FIX 5: Full qualifications + compliance widget */}
        <div style={card2}>
          <div style={{ fontWeight:700, fontSize:14, color:"#3D3248", marginBottom:10 }}>Staff Qualifications & Compliance</div>
          <div style={{ fontSize:10, color:MU2, marginBottom:8, fontWeight:600 }}>QUALIFICATIONS ({totalEds} educators)</div>
          {qualRows.map(q => {
            const count = educators.filter(e=>e.qualification===q.key).length;
            if (count === 0) return null;
            return (
              <div key={q.key} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:q.color, flexShrink:0 }} />
                <div style={{ flex:1, fontSize:12, color:"#3D3248" }}>{q.label}</div>
                <div style={{ fontWeight:700, fontSize:12, color:q.color, minWidth:20, textAlign:"right" }}>{count}</div>
                <div style={{ width:60, height:5, background:"#EDE8F4", borderRadius:3 }}>
                  <div style={{ height:"100%", width:`${totalEds?count/totalEds*100:0}%`, background:q.color, borderRadius:3 }} />
                </div>
              </div>
            );
          })}
          <div style={{ fontSize:10, color:MU2, margin:"10px 0 6px", fontWeight:600, borderTop:"1px solid #EDE8F4", paddingTop:8 }}>COMPLIANCE STATUS</div>
          {certRows.map(cr => {
            const count = educators.filter(cr.check).length;
            const isWarning = cr.label.includes("Expiring");
            return (
              <div key={cr.label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:10 }}>{isWarning ? "⚠️" : count === totalEds ? "✅" : "🟡"}</span>
                <div style={{ flex:1, fontSize:11, color: isWarning ? WA2 : "#3D3248" }}>{cr.label}</div>
                <div style={{ fontWeight:700, fontSize:11, color: isWarning ? WA2 : count === totalEds ? OK2 : WA2 }}>{count}/{totalEds}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function EducatorsView({ educators, onEdit, onAdd }) {
  const [search, setSearch] = useState("");
  const [filterQual, setFilterQual] = useState("all");

  const filtered = educators.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase());
    const matchQual = filterQual === "all" || e.qualification === filterQual;
    return matchSearch && matchQual;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search educators..."
          style={{ ...inputStyle, flex: 1, maxWidth: 320 }}
        />
        <select value={filterQual} onChange={(e) => setFilterQual(e.target.value)} style={{ ...selectStyle, width: 220 }}>
          <option value="all">All Qualifications</option>
          {QUALIFICATION_LEVELS.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
        </select>
        <button onClick={onAdd} style={btnPrimary}><Icon name="add" size={16} color="#fff" /> Add Educator</button>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #E8E0D8" }}>
              {["Name", "Qualification", "Status", "First Aid", "WWCC", "Under 18", "Actions"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#A89DB5", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((ed) => {
              const qual = QUALIFICATION_LEVELS.find((q) => q.id === ed.qualification);
              const wwccDays = ed.wwccExpiry ? Math.ceil((new Date(ed.wwccExpiry) - new Date()) / 86400000) : null;
              return (
                <tr key={ed.id} style={{ borderBottom: "1px solid #F0EBE6", transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#F0EBE6"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600 }}>{ed.name}</div>
                    <div style={{ fontSize: 11, color: "#A89DB5" }}>{ed.email}</div>
                  </td>
                  <td style={{ padding: "12px 16px" }}><span style={tagStyle(qual?.color || "#A89DB5")}>{qual?.label || "Unknown"}</span></td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={tagStyle(ed.status === "clocked_in" ? (ed.onBreak ? "#D4A26A" : "#6BA38B") : "#A89DB5")}>
                      {ed.status === "clocked_in" ? (ed.onBreak ? "On Break" : "Active") : "Off Duty"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>{ed.firstAid ? <Icon name="check" size={16} color="#6BA38B" /> : <Icon name="close" size={16} color="#C06B73" />}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={tagStyle(wwccDays !== null && wwccDays < 30 ? (wwccDays < 0 ? "#C06B73" : "#D4A26A") : "#6BA38B")}>
                      {wwccDays !== null ? (wwccDays < 0 ? "Expired" : `${wwccDays}d`) : "N/A"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>{ed.isUnder18 ? <span style={tagStyle("#D4A26A")}>Yes</span> : <span style={{ color: "#A89DB5" }}>No</span>}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <button onClick={() => onEdit(ed)} style={{ ...btnSecondary, padding: "6px 12px" }}>
                      <Icon name="edit" size={14} color="#8A7F96" /> Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ROOMS VIEW ────────────────────────────────────────────────────────────────
function RoomsView({ rooms, setRooms, onEdit, onAdd }) {
  const updateChildren = (roomId, delta) => {
    setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, currentChildren: Math.max(0, Math.min(r.capacity, r.currentChildren + delta)) } : r));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#8A7F96" }}>Manage rooms and track real-time child attendance for ratio compliance.</p>
        <button onClick={onAdd} style={btnPrimary}><Icon name="add" size={16} color="#fff" /> Add Room</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {rooms.map((room) => {
          const group = AGE_GROUPS.find((g) => g.id === room.ageGroup);
          const required = Math.ceil(room.currentChildren / (group?.ratio || 10));
          const occupancyPct = room.capacity > 0 ? (room.currentChildren / room.capacity) * 100 : 0;
          return (
            <div key={room.id} style={{ ...cardStyle, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: group?.color || "#8B6DAF" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{room.name}</h3>
                  <span style={tagStyle(group?.color || "#8B6DAF")}>{group?.label || room.ageGroup}</span>
                </div>
                <button onClick={() => onEdit(room)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 11 }}>Edit</button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
                <button onClick={() => updateChildren(room.id, -1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #D9D0C7", background: "#E8E0D8", color: "#3D3248", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", fontFamily: "'DM Sans', sans-serif", color: group?.color }}>{room.currentChildren}</div>
                  <div style={{ fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>of {room.capacity} children</div>
                </div>
                <button onClick={() => updateChildren(room.id, 1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #D9D0C7", background: "#E8E0D8", color: "#3D3248", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>

              <div style={{ background: "#E8E0D8", borderRadius: 6, height: 6, marginBottom: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 6, background: occupancyPct > 90 ? "#C06B73" : group?.color, width: `${occupancyPct}%`, transition: "width 0.3s" }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                <span style={{ color: "#A89DB5" }}>Ratio 1:{group?.ratio}</span>
                <span style={{ color: "#A88BC7", fontWeight: 700 }}>Need {required} educator{required !== 1 ? "s" : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ROSTER VIEW ───────────────────────────────────────────────────────────────
function RosterView({ educators, rooms, rosterEntries, addRosterEntry, removeRosterEntry, rosterPeriod, setRosterPeriod, rosterStartDate, setRosterStartDate, complianceStatus }) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [newEntry, setNewEntry] = useState({ educatorId: "", roomId: "", startTime: "07:00", endTime: "15:00" });

  const weekDates = getWeekDates(rosterStartDate);
  const periodConfig = ROSTER_PERIODS.find((p) => p.id === rosterPeriod);
  const allDates = [];
  for (let i = 0; i < (periodConfig?.days || 7); i++) {
    const d = new Date(rosterStartDate);
    d.setDate(d.getDate() + i);
    allDates.push(d.toISOString().split("T")[0]);
  }
  const currentDate = allDates[selectedDay] || allDates[0];
  const dayEntries = rosterEntries.filter((e) => e.date === currentDate);

  const handleAdd = () => {
    if (!newEntry.educatorId || !newEntry.roomId) return;
    addRosterEntry({ ...newEntry, date: currentDate, educatorId: parseInt(newEntry.educatorId), roomId: parseInt(newEntry.roomId) });
    setNewEntry({ ...newEntry, educatorId: "", roomId: "" });
  };

  // Check roster compliance for each day
  const dayCompliance = useMemo(() => {
    return allDates.map((date) => {
      const entries = rosterEntries.filter((e) => e.date === date);
      const uniqueEducators = new Set(entries.map((e) => e.educatorId)).size;
      return { date, entries: entries.length, educators: uniqueEducators, compliant: uniqueEducators >= complianceStatus.totalRequired };
    });
  }, [allDates, rosterEntries, complianceStatus.totalRequired]);

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>Period</label>
          <select value={rosterPeriod} onChange={(e) => setRosterPeriod(e.target.value)} style={{ ...selectStyle, width: 160 }}>
            {ROSTER_PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.days} days)</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Start Date</label>
          <input type="date" value={rosterStartDate} onChange={(e) => setRosterStartDate(e.target.value)} style={{ ...inputStyle, width: 170 }} />
        </div>
        <div style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, background: "rgba(139,109,175,0.08)", border: "1px solid rgba(99,102,241,0.2)", fontSize: 12, color: "#A88BC7", fontFamily: "'DM Sans', sans-serif" }}>
          Min. {complianceStatus.totalRequired} educators per shift
        </div>
      </div>

      {/* Day Selector */}
      <div style={{ ...cardStyle, display: "flex", gap: 4, padding: 8, overflowX: "auto", flexWrap: "nowrap" }}>
        {allDates.slice(0, rosterPeriod === "weekly" ? 7 : 14).map((date, i) => {
          const d = new Date(date + "T00:00:00");
          const dc = dayCompliance[i];
          const isSelected = i === selectedDay;
          return (
            <button
              key={date}
              onClick={() => setSelectedDay(i)}
              style={{
                flex: "0 0 auto", padding: "10px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                background: isSelected ? "#8B6DAF" : "transparent",
                color: isSelected ? "#fff" : "#8A7F96",
                fontFamily: "inherit", fontSize: 12, fontWeight: 600, textAlign: "center", minWidth: 60,
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 10, opacity: 0.7, fontFamily: "'DM Sans', sans-serif" }}>{DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1]?.slice(0, 3)}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{d.getDate()}</div>
              {dc && dc.entries > 0 && (
                <div style={{ width: 6, height: 6, borderRadius: "50%", margin: "4px auto 0", background: dc.compliant ? "#6BA38B" : "#C06B73" }} />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginTop: 16 }}>
        {/* Day Schedule */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>
            {new Date(currentDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {dayEntries.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#A89DB5" }}>
              <Icon name="schedule" size={40} color="#D9D0C7" />
              <p style={{ marginTop: 12, fontSize: 13 }}>No shifts rostered for this day</p>
            </div>
          ) : (
            <div>
              {dayEntries.map((entry) => {
                const ed = educators.find((e) => e.id === entry.educatorId);
                const room = rooms.find((r) => r.id === entry.roomId);
                const group = AGE_GROUPS.find((g) => g.id === room?.ageGroup);
                const qual = QUALIFICATION_LEVELS.find((q) => q.id === ed?.qualification);
                return (
                  <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8, marginBottom: 8, background: "#E8E0D8", border: "1px solid #303348" }}>
                    <div style={{ width: 4, height: 40, borderRadius: 2, background: group?.color || "#8B6DAF" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{ed?.name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: "#A89DB5" }}>
                        {room?.name || "Unknown Room"} · <span style={{ color: qual?.color }}>{qual?.label?.split(" ")[0]}</span>
                      </div>
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#A88BC7" }}>
                      {entry.startTime} — {entry.endTime}
                    </div>
                    <button onClick={() => removeRosterEntry(entry.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                      <Icon name="close" size={16} color="#A89DB5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Shift Panel */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Add Shift</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Educator</label>
            <select value={newEntry.educatorId} onChange={(e) => setNewEntry({ ...newEntry, educatorId: e.target.value })} style={selectStyle}>
              <option value="">Select educator...</option>
              {educators.filter((e) => e.active).map((e) => {
                const qual = QUALIFICATION_LEVELS.find((q) => q.id === e.qualification);
                return <option key={e.id} value={e.id}>{e.name} ({qual?.label?.split(" ")[0]})</option>;
              })}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Room</label>
            <select value={newEntry.roomId} onChange={(e) => setNewEntry({ ...newEntry, roomId: e.target.value })} style={selectStyle}>
              <option value="">Select room...</option>
              {rooms.map((r) => {
                const group = AGE_GROUPS.find((g) => g.id === r.ageGroup);
                return <option key={r.id} value={r.id}>{r.name} ({group?.label})</option>;
              })}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Start</label>
              <select value={newEntry.startTime} onChange={(e) => setNewEntry({ ...newEntry, startTime: e.target.value })} style={selectStyle}>
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>End</label>
              <select value={newEntry.endTime} onChange={(e) => setNewEntry({ ...newEntry, endTime: e.target.value })} style={selectStyle}>
                {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleAdd} style={{ ...btnPrimary, width: "100%", justifyContent: "center" }}>
            <Icon name="add" size={16} color="#fff" /> Add to Roster
          </button>

          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "#FAF7F4", border: "1px solid #E8E0D8" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#A89DB5", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>Day Summary</div>
            <div style={{ fontSize: 12, color: "#8A7F96", lineHeight: 1.8 }}>
              Shifts: <strong style={{ color: "#3D3248" }}>{dayEntries.length}</strong><br />
              Unique Educators: <strong style={{ color: "#3D3248" }}>{new Set(dayEntries.map((e) => e.educatorId)).size}</strong><br />
              Required: <strong style={{ color: "#A88BC7" }}>{complianceStatus.totalRequired}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CLOCK IN/OUT VIEW ─────────────────────────────────────────────────────────
function ClockInOutView({ educators, clockIn, clockOut, startBreak, endBreak, now, clockRecords }) {
  const [pin, setPin] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [clockTab, setClockTab] = useState("educators");

  const clockedIn = educators.filter((e) => e.status === "clocked_in");
  const clockedOut = educators.filter((e) => e.status === "clocked_out" && e.active);

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[["educators","👩‍🏫 Educator Clock In/Out"],["children","👶 Child Sign In/Out"]].map(([id,label]) => (
          <button key={id} onClick={() => setClockTab(id)}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: clockTab === id ? "#8B6DAF" : "#E8E0D8", color: clockTab === id ? "#fff" : "#8A7F96" }}>
            {label}
          </button>
        ))}
      </div>

      {clockTab === "children" && <ChildSignInPanel />}
      {clockTab === "educators" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Active Educators */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#6BA38B", boxShadow: "0 0 8px rgba(139,109,175,211,153,0.4)" }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>On Duty ({clockedIn.length})</h3>
          </div>

          {clockedIn.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "#A89DB5", fontSize: 13 }}>No educators currently clocked in</div>
          ) : (
            clockedIn.map((ed) => {
              const elapsed = now - new Date(ed.clockInTime);
              const breakTime = ed.onBreak ? (now - new Date(ed.breakStart)) + (ed.totalBreak || 0) : (ed.totalBreak || 0);
              const workingTime = elapsed - breakTime;
              const qual = QUALIFICATION_LEVELS.find((q) => q.id === ed.qualification);
              return (
                <div key={ed.id} style={{ padding: "14px 16px", borderRadius: 10, marginBottom: 10, background: ed.onBreak ? "rgba(212,162,106,0.06)" : "rgba(139,109,175,211,153,0.06)", border: `1px solid ${ed.onBreak ? "rgba(212,162,106,0.12)" : "rgba(139,109,175,211,153,0.15)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{ed.name}</div>
                      <div style={{ fontSize: 11, color: "#A89DB5" }}>
                        <span style={{ color: qual?.color }}>{qual?.label?.split(" ")[0]}</span> · In since {formatTime(ed.clockInTime)}
                      </div>
                    </div>
                    {ed.onBreak && <span style={tagStyle("#D4A26A")}>ON BREAK</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, padding: "6px 10px", borderRadius: 6, background: "#FFFFFF", textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>WORKING</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color: "#6BA38B" }}>{formatDuration(workingTime)}</div>
                    </div>
                    <div style={{ flex: 1, padding: "6px 10px", borderRadius: 6, background: "#FFFFFF", textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>BREAK</div>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color: "#D4A26A" }}>{formatDuration(breakTime)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {ed.onBreak ? (
                      <button onClick={() => endBreak(ed.id)} style={{ ...btnPrimary, flex: 1, justifyContent: "center", background: "linear-gradient(135deg, #9B7DC0, #8B6DAF)", fontSize: 12, padding: "8px 12px" }}>
                        <Icon name="login" size={14} color="#fff" /> End Break
                      </button>
                    ) : (
                      <button onClick={() => startBreak(ed.id)} style={{ ...btnSecondary, flex: 1, textAlign: "center" }}>
                        ☕ Start Break
                      </button>
                    )}
                    <button onClick={() => clockOut(ed.id)} style={{ ...btnSecondary, flex: 1, textAlign: "center", borderColor: "rgba(201,130,138,0.25)", color: "#C9828A" }}>
                      <Icon name="logout" size={14} color="#C9828A" /> Clock Out
                    </button>
                  </div>
                  {ed.onBreak && (
                    <div style={{ marginTop: 8, fontSize: 10, fontFamily: "'DM Sans', sans-serif", color: "#D4A26A", textAlign: "center" }}>
                      ⚠ NOT COUNTED IN RATIO DURING BREAK (Reg. 123)
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Off Duty Educators */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#A89DB5" }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Off Duty ({clockedOut.length})</h3>
          </div>

          {clockedOut.map((ed) => {
            const qual = QUALIFICATION_LEVELS.find((q) => q.id === ed.qualification);
            return (
              <div key={ed.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8, marginBottom: 8, background: "#E8E0D8" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ed.name}</div>
                  <div style={{ fontSize: 11, color: "#A89DB5" }}>
                    <span style={{ color: qual?.color }}>{qual?.label?.split(" ")[0]}</span>
                    {ed.todayHours > 0 && <span> · Today: {formatDuration(ed.todayHours)}</span>}
                  </div>
                </div>
                <button onClick={() => clockIn(ed.id)} style={{ ...btnPrimary, fontSize: 12, padding: "8px 14px" }}>
                  <Icon name="login" size={14} color="#fff" /> Clock In
                </button>
              </div>
            );
          })}
        </div>
      </div>}

      {/* Today's Log — only show for educator tab */}
      {clockTab === "educators" && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Today's Time Log</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {[...clockRecords].reverse().slice(0, 20).map((r) => {
              const ed = educators.find((e) => e.id === r.educatorId);
              const colors = { clock_in: "#6BA38B", clock_out: "#C9828A", break_start: "#D4A26A", break_end: "#9B7DC0" };
              const labels = { clock_in: "IN", clock_out: "OUT", break_start: "BRK→", break_end: "←BRK" };
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, background: "#E8E0D8", fontSize: 12 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: colors[r.type], fontSize: 10, width: 32 }}>{labels[r.type]}</span>
                  <span style={{ fontWeight: 600, flex: 1 }}>{ed?.name?.split(" ")[0]}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", color: "#A89DB5", fontSize: 11 }}>{formatTime(r.time)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COMPLIANCE VIEW ───────────────────────────────────────────────────────────
function ComplianceView({ complianceStatus, alerts, educators, rooms }) {
  const cs = complianceStatus;

  return (
    <div>
      {/* Overall Status */}
      <div style={{ ...cardStyle, background: cs.allCompliant ? "rgba(107,163,139,0.06)" : "rgba(201,130,138,0.05)", border: `1px solid ${cs.allCompliant ? "rgba(107,163,139,0.2)" : "rgba(201,130,138,0.2)"}`, display: "flex", alignItems: "center", gap: 20, padding: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: cs.allCompliant ? "rgba(107,163,139,0.12)" : "rgba(201,130,138,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={cs.allCompliant ? "shield" : "warning"} size={32} color={cs.allCompliant ? "#6BA38B" : "#C06B73"} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: cs.allCompliant ? "#6BA38B" : "#C9828A" }}>
            {cs.allCompliant ? "Fully Compliant" : "Compliance Issues Detected"}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8A7F96" }}>
            {cs.allCompliant ? "All NQF requirements are currently being met" : `${alerts.length} issue${alerts.length !== 1 ? "s" : ""} requiring attention`}
          </p>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div style={{ ...cardStyle }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Active Alerts</h3>
          {alerts.map((alert, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8, marginBottom: 8, background: alert.type === "critical" ? "rgba(201,130,138,0.06)" : "rgba(212,162,106,0.06)", border: `1px solid ${alert.type === "critical" ? "rgba(201,130,138,0.12)" : "rgba(212,162,106,0.12)"}` }}>
              <Icon name={alert.type === "critical" ? "warning" : "alert"} size={18} color={alert.type === "critical" ? "#C06B73" : "#D4A26A"} />
              <span style={{ flex: 1, fontSize: 13 }}>{alert.message}</span>
              <span style={tagStyle(alert.type === "critical" ? "#C06B73" : "#D4A26A")}>{alert.type}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Regulation 123 - Ratios */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Educator-to-Child Ratios</h3>
          <p style={{ margin: "0 0 16px", fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>EDUCATION AND CARE SERVICES NATIONAL REGULATIONS — REG 123</p>

          {AGE_GROUPS.map((group) => {
            const req = cs.requirements[group.id];
            if (!req || req.children === 0) return null;
            return (
              <div key={group.id} style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 8, background: "#E8E0D8" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: group.color }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{group.label}</span>
                  </div>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#A88BC7" }}>1:{group.ratio}</span>
                </div>
                <div style={{ fontSize: 12, color: "#8A7F96" }}>
                  {req.children} children → <strong style={{ color: "#3D3248" }}>{req.required} educator{req.required !== 1 ? "s" : ""} required</strong>
                </div>
              </div>
            );
          })}

          <div style={{ padding: "12px 14px", borderRadius: 8, background: cs.ratioMet ? "rgba(107,163,139,0.08)" : "rgba(201,130,138,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: cs.ratioMet ? "#83B99E" : "#C9828A" }}>
              {cs.ratioMet ? "✓ Ratios Met" : "✗ Ratio Breach"}
            </span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#8A7F96" }}>
              {cs.activeEducators}/{cs.totalRequired} active
            </span>
          </div>
        </div>

        {/* Regulation 126 - Qualifications */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Qualification Requirements</h3>
          <p style={{ margin: "0 0 16px", fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>REGULATION 126 — 50% DIPLOMA+ REQUIREMENT</p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: "#8A7F96" }}>Diploma or Higher</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: cs.qualComp.diplomaPercent >= 50 ? "#6BA38B" : "#C06B73" }}>
                {cs.qualComp.diplomaPercent.toFixed(0)}%
              </span>
            </div>
            <div style={{ background: "#E8E0D8", borderRadius: 6, height: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 6, background: cs.qualComp.diplomaPercent >= 50 ? "#6BA38B" : "#C06B73", width: `${Math.min(100, cs.qualComp.diplomaPercent)}%`, transition: "width 0.3s" }} />
            </div>
            <div style={{ position: "relative", marginTop: 4 }}>
              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>50% minimum ▲</div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8A7F96", marginBottom: 8 }}>ECT Requirement</div>
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#E8E0D8" }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <strong style={{ color: "#3D3248" }}>{cs.activeECTs}</strong> of <strong style={{ color: "#A88BC7" }}>{cs.ectReq.ectRequired}</strong> ECTs on floor
              </div>
              <div style={{ fontSize: 11, color: "#A89DB5" }}>{cs.ectReq.note}</div>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)", fontSize: 11, color: "#8A7F96", lineHeight: 1.6 }}>
            <strong style={{ color: "#A88BC7" }}>Key rules:</strong><br />
            • Educators on planned breaks cannot be counted in ratios<br />
            • Under-18 educators must be supervised by 18+ educator<br />
            • Ratios calculated across the whole service<br />
            • Educators must be working directly with children
          </div>
        </div>

        {/* WWCC Status */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Working With Children Check</h3>
          {educators.map((ed) => {
            const days = ed.wwccExpiry ? Math.ceil((new Date(ed.wwccExpiry) - new Date()) / 86400000) : null;
            const status = days === null ? "unknown" : days < 0 ? "expired" : days < 30 ? "expiring" : "valid";
            const colors = { valid: "#6BA38B", expiring: "#D4A26A", expired: "#C06B73", unknown: "#A89DB5" };
            return (
              <div key={ed.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #F0EBE6", fontSize: 12 }}>
                <span style={{ flex: 1, fontWeight: 500 }}>{ed.name}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", color: "#A89DB5", fontSize: 11 }}>{ed.wwcc || "—"}</span>
                <span style={tagStyle(colors[status])}>
                  {status === "expired" ? "EXPIRED" : status === "expiring" ? `${days}d left` : status === "valid" ? "Valid" : "N/A"}
                </span>
              </div>
            );
          })}
        </div>

        {/* First Aid */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>First Aid Certification</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {educators.map((ed) => (
              <div key={ed.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: "#E8E0D8", fontSize: 12 }}>
                <Icon name={ed.firstAid ? "check" : "close"} size={14} color={ed.firstAid ? "#6BA38B" : "#C06B73"} />
                <span style={{ fontWeight: 500 }}>{ed.name}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(99,102,241,0.06)", fontSize: 11, color: "#8A7F96" }}>
            At least one educator with a current first aid qualification must be in attendance at all times.
          </div>
        </div>

        {/* Responsible Person */}
        <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>🛡️ Responsible Person in Attendance</h3>
              <p style={{ margin: 0, fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>
                EDUCATION AND CARE SERVICES NATIONAL LAW — SECTION 162 · A Responsible Person must be present at the service at all times during operation
              </p>
            </div>
          </div>
          {(() => {
            const today = new Date();
            const responsiblePersons = educators.filter(ed => {
              if (!ed.active) return false;
              const faOk = ed.firstAid;
              const cprOk = ed.cprExpiry ? new Date(ed.cprExpiry) > today : false;
              const anaOk = ed.anaphylaxisExpiry ? new Date(ed.anaphylaxisExpiry) > today : false;
              return faOk && cprOk && anaOk;
            });
            const clockedInRPs = responsiblePersons.filter(ed => ed.status === "clocked_in" && !ed.onBreak);
            const hasRP = clockedInRPs.length > 0;
            return (
              <div>
                <div style={{ padding: "14px 16px", borderRadius: 10, marginBottom: 14, background: hasRP ? "rgba(107,163,139,0.10)" : "rgba(192,107,115,0.10)", border: `1px solid ${hasRP ? "#6BA38B" : "#C06B73"}30` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{hasRP ? "✅" : "🚨"}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: hasRP ? "#6BA38B" : "#C06B73" }}>
                        {hasRP ? `Responsible Person On-Site (${clockedInRPs.length})` : "NO RESPONSIBLE PERSON ON SITE"}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 2 }}>
                        {hasRP ? clockedInRPs.map(e => e.name).join(", ") : "Centre cannot legally operate without a Responsible Person present"}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Qualified Responsible Persons (First Aid + CPR + Anaphylaxis current)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                  {educators.map(ed => {
                    const today2 = new Date();
                    const faOk = ed.firstAid;
                    const cprOk = ed.cprExpiry ? new Date(ed.cprExpiry) > today2 : false;
                    const anaOk = ed.anaphylaxisExpiry ? new Date(ed.anaphylaxisExpiry) > today2 : false;
                    const isRP = faOk && cprOk && anaOk;
                    const onSite = ed.status === "clocked_in" && !ed.onBreak;
                    return (
                      <div key={ed.id} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid", borderColor: isRP ? (onSite ? "#6BA38B" : "#D4A26A") : "#E8E0D8", background: isRP ? (onSite ? "rgba(107,163,139,0.06)" : "rgba(212,162,106,0.06)") : "#FDFBF9" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>{isRP ? (onSite ? "🟢" : "🟡") : "⬜"}</span>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "#3D3248" }}>{ed.name}</span>
                          {onSite && isRP && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "#6BA38B", color: "#fff", padding: "2px 7px", borderRadius: 10 }}>ON SITE</span>}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 10 }}>
                          <span style={{ color: faOk ? "#6BA38B" : "#C06B73" }}>{faOk ? "✓" : "✗"} First Aid</span>
                          <span style={{ color: cprOk ? "#6BA38B" : "#C06B73" }}>{cprOk ? "✓" : "✗"} CPR</span>
                          <span style={{ color: anaOk ? "#6BA38B" : "#C06B73" }}>{anaOk ? "✓" : "✗"} Anaphylaxis</span>
                        </div>
                        {!isRP && <div style={{ fontSize: 10, color: "#C06B73", marginTop: 4 }}>Not eligible — update certifications to qualify</div>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(139,109,175,0.06)", border: "1px solid rgba(139,109,175,0.12)", fontSize: 11, color: "#8A7F96", lineHeight: 1.7 }}>
                  <strong style={{ color: "#A88BC7" }}>Requirements for Responsible Person (Reg 162):</strong><br />
                  • Current First Aid certificate (approved first aid qualification)<br />
                  • Current CPR certificate (updated every 12 months)<br />
                  • Current Anaphylaxis management training<br />
                  • Must not be on break or off-site during their designation period
                </div>
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
}

// ─── CHILD SIGN IN/OUT PANEL ────────────────────────────────────────────────
function ChildSignInPanel() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionChild, setActionChild] = useState(null);
  const [absentChild, setAbsentChild] = useState(null);
  const [absentReason, setAbsentReason] = useState("");
  const [processing, setProcessing] = useState(null);

  const API2 = (path, opts={}) => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    return fetch(path, { method: opts.method||"GET",
      headers: { "Content-Type": "application/json", ...(t?{Authorization:`Bearer ${t}`}:{}), ...(tid?{"x-tenant-id":tid}:{}) },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}) }).then(r => r.json());
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await API2("/api/children/attendance-today");
      if (Array.isArray(d)) setChildren(d);
    } catch(e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = () => new Date().toTimeString().slice(0,5);

  const signIn = async (child) => {
    setProcessing(child.id);
    const r = await API2(`/api/children/${child.id}/sign-in`, { method:"POST", body: { sign_in_time: now() } });
    if (r.ok) { await load(); if (window.showToast) window.showToast(`${child.first_name} signed in at ${now()}`); }
    else if (window.showToast) window.showToast(r.error||"Sign-in failed", "error");
    setProcessing(null);
  };

  const signOut = async (child) => {
    setProcessing(child.id);
    const r = await API2(`/api/children/${child.id}/sign-out`, { method:"POST", body: { sign_out_time: now() } });
    if (r.ok) { await load(); if (window.showToast) window.showToast(`${child.first_name} signed out at ${now()}`); }
    else if (window.showToast) window.showToast(r.error||"Sign-out failed", "error");
    setProcessing(null);
  };

  const markAbsent = async () => {
    if (!absentChild) return;
    setProcessing(absentChild.id);
    const r = await API2(`/api/children/${absentChild.id}/mark-absent`, { method:"POST", body: { reason: absentReason } });
    if (r.ok) { await load(); setAbsentChild(null); setAbsentReason(""); if (window.showToast) window.showToast(`${absentChild.first_name} marked absent`); }
    else if (window.showToast) window.showToast(r.error||"Failed", "error");
    setProcessing(null);
  };

  const purple = "#8B6DAF", lp = "#F0EBF8";
  const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13, background: "#fff", fontFamily: "inherit" };

  const filtered = children.filter(c =>
    !search || `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  // Group by room
  const byRoom = {};
  filtered.forEach(c => {
    const key = c.room_name || "Unassigned";
    if (!byRoom[key]) byRoom[key] = [];
    byRoom[key].push(c);
  });

  const signedIn  = children.filter(c => c.sign_in && !c.sign_out && !c.absent);
  const signedOut = children.filter(c => c.sign_out);
  const absent    = children.filter(c => c.absent);
  const notYet    = children.filter(c => !c.sign_in && !c.absent);

  if (loading) return <div style={{ textAlign:"center", padding:40, color:"#8A7F96" }}>Loading today's attendance…</div>;

  return (
    <div>
      {/* Medication alerts for today */}
      {children.filter(c=>c.active_plans>0||c.allergies&&c.allergies!=="None").length>0&&(
        <div style={{background:"#FFF3E0",borderRadius:10,border:"1px solid #FFCC80",padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:20}}>💊</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:12,color:"#E65100"}}>Medical Alerts Today</div>
            <div style={{fontSize:11,color:"#8A7F96",marginTop:2}}>
              {children.filter(c=>c.allergies&&c.allergies!=="None").map(c=>(
                <span key={c.id} style={{display:"inline-block",background:"#FFEBEE",color:"#C62828",borderRadius:6,padding:"1px 8px",marginRight:4,marginTop:2,fontWeight:600,fontSize:10}}>
                  ⚠ {c.first_name}: {c.allergies}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {[
          ["Present",   signedIn.length,  "#6BA38B", "#E8F5E9"],
          ["Signed Out", signedOut.length, "#8B6DAF", "#F0EBF8"],
          ["Absent",     absent.length,    "#C9828A", "#FEF2F2"],
          ["Not Arrived",notYet.length,    "#D4A26A", "#FFF8E1"],
        ].map(([l,v,col,bg]) => (
          <div key={l} style={{ background:bg, borderRadius:12, padding:"14px 18px", border:`1px solid ${col}30` }}>
            <div style={{ fontSize:26, fontWeight:800, color:col }}>{v}</div>
            <div style={{ fontSize:12, color:col, fontWeight:600, marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>

            {notYet.length > 0 && (
        <div style={{display:"flex",gap:8,marginBottom:12,padding:"10px 12px",background:"#E3F2FD",borderRadius:10,border:"1px solid #BBDEFB",alignItems:"center"}}>
          <span style={{fontSize:12,color:"#1565C0",flex:1}}>{notYet.length} children not yet signed in</span>
          <button onClick={async()=>{
            if(!window.confirm("Mark all pending children as present now?")) return;
            const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
            const hdr={"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})};
            const nowTime=new Date().toTimeString().slice(0,5);
            for(const ch of notYet){ await fetch(`/api/children/${ch.id}/sign-in`,{method:"POST",headers:hdr,body:JSON.stringify({sign_in_time:nowTime})}).catch(()=>{}); }
            load();
            if(window.showToast) window.showToast(`${notYet.length} children signed in`);
          }} style={{padding:"6px 14px",borderRadius:8,background:"#1565C0",color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:12}}>
            Mark All Present
          </button>
        </div>
      )}
      {/* Search + refresh */}
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search child name…" style={{ ...inp, flex:1 }} />
        <button onClick={load} style={{ padding:"8px 16px", background:lp, color:purple, border:"none", borderRadius:8, cursor:"pointer", fontWeight:600 }}>
          ↻ Refresh
        </button>
      
        <button onClick={()=>{
          const today=new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
          const rows=children.map(c=>"<tr><td style='padding:6px 10px;border:1px solid #ddd'>"+c.first_name+" "+c.last_name+"</td><td style='padding:6px 10px;border:1px solid #ddd'>"+(c.room_name||"--")+"</td><td style='padding:6px 10px;border:1px solid #ddd'>"+(c.sign_in||"--")+"</td><td style='padding:6px 10px;border:1px solid #ddd'>"+(c.sign_out||"--")+"</td><td style='padding:6px 10px;border:1px solid #ddd'>"+(c.absent?"ABSENT":"")+"</td><td style='padding:6px 10px;border:1px solid #ddd;width:80px'>&nbsp;</td></tr>").join("");
          const w=window.open("","_blank");
          w.document.write("<html><head><title>Attendance Register</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}h2{color:#3D3248}table{width:100%;border-collapse:collapse}th{background:#3D3248;color:#fff;padding:8px 10px;text-align:left}tr:nth-child(even){background:#f9f9f9}@media print{.noprint{display:none}}</style></head><body><h2>Daily Attendance Register</h2><p style='color:#666;margin-bottom:16px'>"+today+"</p><table><thead><tr><th>Child Name</th><th>Room</th><th>Sign In</th><th>Sign Out</th><th>Absent</th><th>Parent Signature</th></tr></thead><tbody>"+rows+"</tbody></table><div class='noprint' style='margin-top:16px'><button onclick='window.print()' style='padding:8px 20px;background:#3D3248;color:#fff;border:none;border-radius:6px;cursor:pointer'>Print</button></div></body></html>");
          w.document.close();
        }} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #DDD6EE",background:"#FDFBF9",color:"#5C4E6A",cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap"}}>
          Print Register
        </button>
      </div>

      {/* Medical Alerts — children with allergies/medical plans currently present */}
      {(()=>{
        const present=children.filter(c=>c.sign_in&&!c.sign_out&&!c.absent&&c.allergies&&c.allergies!=="None");
        if(!present.length) return null;
        return(
          <div style={{marginBottom:16,padding:"10px 14px",background:"#FFF5F5",borderRadius:10,border:"1px solid #FFCDD2"}}>
            <div style={{fontWeight:700,fontSize:12,color:"#B71C1C",marginBottom:6}}>🚨 Medical Alerts — {present.length} child{present.length!==1?"ren":""} present with allergies/conditions</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {present.map(c=>(
                <div key={c.id} style={{background:"#fff",borderRadius:8,padding:"4px 10px",border:"1px solid #FFCDD2",fontSize:11}}>
                  <strong style={{color:"#3D3248"}}>{c.first_name} {c.last_name}</strong>
                  <span style={{color:"#B71C1C",marginLeft:4}}>· {c.allergies}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Children by room */}
      {Object.entries(byRoom).map(([room, kids]) => (
        <div key={room} style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#3D3248", marginBottom:10, padding:"8px 12px",
            background:"#F8F5FC", borderRadius:8, display:"flex", justifyContent:"space-between" }}>
            <span>🏠 {room}</span>
            <span style={{ fontSize:11, color:"#8A7F96" }}>{kids.filter(c=>c.sign_in&&!c.absent).length}/{kids.length} present</span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:10 }}>
            {kids.map(child => {
              const isSignedIn = !!child.sign_in && !child.sign_out && !child.absent;
              const isSignedOut = !!child.sign_out;
              const isAbsent = !!child.absent;
              const isProcessing = processing === child.id;

              let statusBg = "#FDFBF9", statusBorder = "#EDE8F4", statusLabel = "Not arrived", statusColor = "#A89DB5";
              if (isSignedIn)  { statusBg = "#E8F5E9"; statusBorder="#A5D6A7"; statusLabel=`In ${child.sign_in}`; statusColor="#2E7D32"; }
              if (isSignedOut) { statusBg = "#F0EBF8"; statusBorder="#C5B8E0"; statusLabel=`Out ${child.sign_out}`; statusColor="#8B6DAF"; }
              if (isAbsent)    { statusBg = "#FEF2F2"; statusBorder="#FECACA"; statusLabel="Absent"; statusColor="#B71C1C"; }

              return (
                <div key={child.id} style={{ background:statusBg, borderRadius:12, border:`1px solid ${statusBorder}`, padding:"14px 16px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:lp, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:purple, flexShrink:0, overflow:"hidden" }}>
                      {child.photo_url ? <img src={child.photo_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : (child.first_name||"?").charAt(0)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:"#3D3248" }}>{child.first_name} {child.last_name}</div>
                      {child.allergies && child.allergies !== "None" && (
                        <div style={{ fontSize:10, color:"#B71C1C", fontWeight:700 }}>⚠ {child.allergies}</div>
                      )}
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:statusColor }}>{statusLabel}</span>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {!isSignedIn && !isAbsent && !isSignedOut && (
                      <button onClick={()=>signIn(child)} disabled={isProcessing}
                        style={{ flex:1, padding:"7px", background:"#6BA38B", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, opacity:isProcessing?0.6:1 }}>
                        {isProcessing ? "…" : "✓ Sign In"}
                      </button>
                    )}
                    {isSignedIn && (
                      <button onClick={()=>signOut(child)} disabled={isProcessing}
                        style={{ flex:1, padding:"7px", background:purple, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12, opacity:isProcessing?0.6:1 }}>
                        {isProcessing ? "…" : "⬆ Sign Out"}
                      </button>
                    )}
                    {isSignedOut && (
                      <div style={{ flex:1, textAlign:"center", fontSize:12, color:"#8B6DAF", fontWeight:600, padding:"7px 0" }}>
                        ✓ Departed {child.sign_out}
                      </div>
                    )}
                    {!isAbsent && !isSignedOut && (
                      <button onClick={()=>{ setAbsentChild(child); setAbsentReason(""); }}
                        style={{ padding:"7px 10px", background:"#FFEBEE", color:"#B71C1C", border:"1px solid #FFCDD2", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:11 }}>
                        Absent
                      </button>
                    )}
                    {isAbsent && (
                      <div style={{ flex:1, textAlign:"center", fontSize:12, color:"#B71C1C", fontWeight:600, padding:"7px 0" }}>
                        ✗ Absent{child.absent_reason ? `: ${child.absent_reason}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:"#8A7F96" }}>No children found</div>
      )}

      {/* Mark Absent Modal */}
      {absentChild && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000 }}>
          <div style={{ background:"#fff", borderRadius:16, padding:28, width:380, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin:"0 0 16px", fontSize:16, color:"#3D3248" }}>Mark Absent — {absentChild.first_name}</h3>
            <label style={{ fontSize:11, color:"#8A7F96", fontWeight:700, display:"block", marginBottom:6 }}>REASON (OPTIONAL)</label>
            <select value={absentReason} onChange={e=>setAbsentReason(e.target.value)} style={{ ...inp, width:"100%", marginBottom:20 }}>
              <option value="">Select reason…</option>
              {["Sick","Family holiday","Medical appointment","Public holiday","Parent notified","No reason given","Other"].map(r=>(
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={markAbsent}
                style={{ flex:1, padding:"10px", background:"#B71C1C", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700 }}>
                Confirm Absent
              </button>
              <button onClick={()=>setAbsentChild(null)}
                style={{ flex:0.5, padding:"10px", background:"#F5F5F5", color:"#555", border:"1px solid #DDD", borderRadius:8, cursor:"pointer", fontWeight:600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REPORTS VIEW ──────────────────────────────────────────────────────────────
function ReportsView({ educators, rooms, clockRecords, complianceStatus, rosterEntries }) {
  const [reportType, setReportType] = useState("hours");
  const [timesheet, setTimesheet] = useState(null);
  const [loadingTs, setLoadingTs] = useState(false);

  // Fetch real timesheet data for current week
  useEffect(() => {
    const t = localStorage.getItem("c360_token");
    const tid = localStorage.getItem("c360_tenant");
    if (!t || !tid) return;
    const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${t}`, "x-tenant-id": tid };
    const now = new Date();
    const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const start = mon.toISOString().split("T")[0];
    const end = sun.toISOString().split("T")[0];
    setLoadingTs(true);
    fetch(`/api/rostering/timesheet?start_date=${start}&end_date=${end}`, { headers: hdr })
      .then(r => r.json()).then(d => { if (d.educators) setTimesheet(d); }).catch(() => {})
      .finally(() => setLoadingTs(false));
  }, []);

  // Weekly hours from real clock records (today's data) + timesheet for weekly
  const hoursData = useMemo(() => {
    return DAYS_OF_WEEK.map((day, i) => {
      const dayDate = new Date(); dayDate.setDate(new Date().getDate() - new Date().getDay() + i + 1);
      const dayStr = dayDate.toISOString().split("T")[0];
      const dayRecs = clockRecords.filter(r => r.date === dayStr && r.type === "clock_out");
      const workMs = dayRecs.reduce((s, r) => s + (r.duration || 0), 0);
      const breakMs = clockRecords.filter(r => r.date === dayStr && r.type === "break_end").reduce((s,r) => s+(r.duration||0), 0);
      return { day: day.slice(0, 3), working: Math.round(workMs / 3600000 * 10) / 10, breaks: Math.round(breakMs / 3600000 * 10) / 10, total: Math.round((workMs + breakMs) / 3600000 * 10) / 10 };
    });
  }, [clockRecords]);

  // Compliance trend from real compliance status (current week snapshot × 4 historical approx)
  const complianceTrend = useMemo(() => {
    const base = complianceStatus.allCompliant ? 95 : 70;
    const ratioBase = complianceStatus.ratioMet ? 98 : 65;
    const qualBase = complianceStatus.qualComp?.compliant ? 95 : 72;
    return ["Wk -3", "Wk -2", "Wk -1", "This Week"].map((week, i) => ({
      week,
      ratioCompliance: Math.min(100, ratioBase - (3 - i) * 2),
      qualCompliance: Math.min(100, qualBase - (3 - i) * 1.5),
      overall: Math.min(100, base - (3 - i) * 2),
    }));
  }, [complianceStatus]);

  // Educator hours from timesheet API (real) or clock records (today fallback)
  const educatorHours = useMemo(() => {
    if (timesheet?.educators?.length) {
      return timesheet.educators.map(e => ({
        name: e.name.split(" ")[0],
        actual: Math.round(e.total_hours * 10) / 10,
        scheduled: e.contracted_hours || 38,
        today: Math.round((e.days[new Date().toISOString().split("T")[0]] || 0) * 10) / 10,
      }));
    }
    return educators.map((e) => {
      const records = clockRecords.filter((r) => r.educatorId === e.id && r.type === "clock_out");
      const totalMs = records.reduce((sum, r) => sum + (r.duration || 0), 0);
      const scheduled = rosterEntries.filter((r) => r.educatorId === e.id).length * 8;
      return { name: e.name.split(" ")[0], actual: Math.round(totalMs / 3600000 * 10) / 10, scheduled, today: Math.round((e.todayHours||0) / 3600000 * 10) / 10 };
    });
  }, [timesheet, educators, clockRecords, rosterEntries]);

  // Room utilisation
  const roomUtil = rooms.map((r) => {
    const group = AGE_GROUPS.find((g) => g.id === r.ageGroup);
    return { name: r.name, utilisation: r.capacity > 0 ? Math.round((r.currentChildren / r.capacity) * 100) : 0, fill: group?.color || "#8B6DAF" };
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { id: "hours", label: "Hours & Attendance" },
          { id: "payroll", label: "Payroll Summary" },
          { id: "compliance", label: "Compliance Trends" },
          { id: "utilisation", label: "Room Utilisation" },
          { id: "qualifications", label: "Qualification Analysis" },
          { id: "certifications", label: "Cert Expiry" },
          { id: "schedule", label: "📅 Schedule Reports" },
          { id: "availability", label: "📆 Educator Availability" },
          { id: "attendance", label: "📋 Attendance Register" },
          { id: "children_report", label: "👶 Children Report" },
          { id: "occupancy", label: "📊 Occupancy" },
          { id: "emergency_contacts", label: "📞 Emergency Contacts" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: reportType === tab.id ? "#8B6DAF" : "#E8E0D8",
              color: reportType === tab.id ? "#fff" : "#8A7F96",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {reportType === "hours" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Weekly Hours Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hoursData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D8" />
                <XAxis dataKey="day" tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} />
                <YAxis tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} />
                <Tooltip contentStyle={{ background: "#E8E0D8", border: "1px solid #D9D0C7", borderRadius: 8, fontSize: 12, color: "#3D3248" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="working" stackId="a" fill="#8B6DAF" radius={[0, 0, 0, 0]} name="Working" />
                <Bar dataKey="breaks" stackId="a" fill="#D4A26A" radius={[4, 4, 0, 0]} name="Breaks" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Educator Hours Today</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={educatorHours} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D8" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#8A7F96", fontSize: 11 }} axisLine={false} width={70} />
                <Tooltip contentStyle={{ background: "#E8E0D8", border: "1px solid #D9D0C7", borderRadius: 8, fontSize: 12, color: "#3D3248" }} />
                <Bar dataKey="today" fill="#9B7DC0" radius={[0, 6, 6, 0]} name="Today (hrs)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Educator Hours Summary</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E8E0D8" }}>
                  {["Educator", "Today (hrs)", "Logged (hrs)", "Scheduled (hrs)", "Variance"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#A89DB5", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {educatorHours.map((eh, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F0EBE6" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{eh.name}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "'DM Sans', sans-serif" }}>{eh.today}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "'DM Sans', sans-serif" }}>{eh.actual}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "'DM Sans', sans-serif" }}>{eh.scheduled}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "'DM Sans', sans-serif", color: eh.actual >= eh.scheduled ? "#6BA38B" : "#C9828A" }}>
                      {eh.actual >= eh.scheduled ? "+" : ""}{(eh.actual - eh.scheduled).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportType === "compliance" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>4-Week Compliance Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={complianceTrend}>
                <defs>
                  <linearGradient id="colorRatio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B6DAF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B6DAF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorQual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6BA38B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6BA38B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D8" />
                <XAxis dataKey="week" tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} />
                <YAxis domain={[70, 100]} tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} />
                <Tooltip contentStyle={{ background: "#E8E0D8", border: "1px solid #D9D0C7", borderRadius: 8, fontSize: 12, color: "#3D3248" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="ratioCompliance" stroke="#8B6DAF" fillOpacity={1} fill="url(#colorRatio)" name="Ratio %" strokeWidth={2} />
                <Area type="monotone" dataKey="qualCompliance" stroke="#6BA38B" fillOpacity={1} fill="url(#colorQual)" name="Qual %" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Current Compliance Checklist</h3>
            {[
              { label: "Educator-to-child ratios met (Reg 123)", met: complianceStatus.ratioMet },
              { label: "ECT requirement met (Div 5)", met: complianceStatus.ectMet },
              { label: "50% diploma+ qualified (Reg 126)", met: complianceStatus.qualComp.compliant },
              { label: "Under-18 supervision compliant", met: !educators.some((e) => e.isUnder18 && e.status === "clocked_in" && !educators.some((s) => !s.isUnder18 && s.status === "clocked_in")) },
              { label: "First aid personnel present", met: educators.some((e) => e.firstAid && e.status === "clocked_in" && !e.onBreak) },
              { label: "All WWCC current", met: !educators.some((e) => e.wwccExpiry && new Date(e.wwccExpiry) < new Date()) },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #F0EBE6" }}>
                <Icon name={item.met ? "check" : "close"} size={16} color={item.met ? "#6BA38B" : "#C06B73"} />
                <span style={{ fontSize: 12, color: item.met ? "#8A7F96" : "#C9828A" }}>{item.label}</span>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Compliance Score</h3>
            <div style={{ textAlign: "center", padding: 20 }}>
              {(() => {
                const checks = [complianceStatus.ratioMet, complianceStatus.ectMet, complianceStatus.qualComp.compliant];
                const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
                const color = score === 100 ? "#6BA38B" : score >= 66 ? "#D4A26A" : "#C06B73";
                return (
                  <>
                    <div style={{ fontSize: 56, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color, letterSpacing: "-0.05em" }}>{score}%</div>
                    <div style={{ fontSize: 12, color: "#A89DB5", marginTop: 4 }}>NQF Compliance Score</div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {reportType === "utilisation" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Room Utilisation</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={roomUtil} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D8" />
                <XAxis dataKey="name" tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ background: "#E8E0D8", border: "1px solid #D9D0C7", borderRadius: 8, fontSize: 12, color: "#3D3248" }} formatter={(v) => `${v}%`} />
                <Bar dataKey="utilisation" radius={[6, 6, 0, 0]}>
                  {roomUtil.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {rooms.map((room) => {
            const group = AGE_GROUPS.find((g) => g.id === room.ageGroup);
            const util = room.capacity > 0 ? Math.round((room.currentChildren / room.capacity) * 100) : 0;
            const required = Math.ceil(room.currentChildren / (group?.ratio || 10));
            return (
              <div key={room.id} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: group?.color }} />
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{room.name}</h4>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ padding: "8px 10px", borderRadius: 6, background: "#E8E0D8", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>CHILDREN</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: group?.color }}>{room.currentChildren}</div>
                  </div>
                  <div style={{ padding: "8px 10px", borderRadius: 6, background: "#E8E0D8", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>CAPACITY</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{room.capacity}</div>
                  </div>
                  <div style={{ padding: "8px 10px", borderRadius: 6, background: "#E8E0D8", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>NEED</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#A88BC7" }}>{required}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reportType === "qualifications" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Qualification Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={QUALIFICATION_LEVELS.map((q) => ({ name: q.label.split(" ")[0], value: educators.filter((e) => e.qualification === q.id).length, fill: q.color })).filter((d) => d.value > 0)}
                  dataKey="value" innerRadius={50} outerRadius={90} paddingAngle={4} strokeWidth={0}
                >
                  {QUALIFICATION_LEVELS.map((q, i) => <Cell key={i} fill={q.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#E8E0D8", border: "1px solid #D9D0C7", borderRadius: 8, fontSize: 12, color: "#3D3248" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Qualification Breakdown</h3>
            {QUALIFICATION_LEVELS.map((q) => {
              const count = educators.filter((e) => e.qualification === q.id).length;
              const pct = educators.length > 0 ? Math.round((count / educators.length) * 100) : 0;
              return (
                <div key={q.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#8A7F96" }}>{q.label}</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: q.color }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ background: "#E8E0D8", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: q.color, width: `${pct}%`, transition: "width 0.3s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>ECT Requirements Reference</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E8E0D8" }}>
                  {["Children Attending", "ECTs Required", "Notes"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#A89DB5", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ECT_REQUIREMENTS.map((req, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F0EBE6", background: complianceStatus.totalChildren >= req.minChildren && complianceStatus.totalChildren <= req.maxChildren ? "rgba(99,102,241,0.06)" : "transparent" }}>
                    <td style={{ padding: "10px 14px", fontFamily: "'DM Sans', sans-serif" }}>{req.minChildren}–{req.maxChildren === 999 ? "∞" : req.maxChildren}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "#A88BC7" }}>{req.ectRequired}</td>
                    <td style={{ padding: "10px 14px", color: "#8A7F96" }}>{req.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {reportType === "payroll" && <PayrollReportTab educators={educators} />}
      {reportType === "certifications" && <CertExpiryReportTab educators={educators} />}
      {reportType === "schedule" && <ScheduleReportsTab />}
      {reportType === "attendance" && <AttendanceRegisterTab />}
      {reportType === "children_report" && <ChildrenReportTab />}
      {reportType === "occupancy" && <OccupancyReportTab />}
      {reportType === "availability" && <EducatorAvailabilityTab />}
      {reportType === "emergency_contacts" && <EmergencyContactsTab />}
    </div>
  );
}

// ─── PAYROLL REPORT TAB ────────────────────────────────────────────────────────
function PayrollReportTab({ educators: propEdus }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const [start, setStart] = useState(mon.toISOString().slice(0, 10));
  const [end, setEnd] = useState(sun.toISOString().slice(0, 10));

  const API3 = (path) => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    return fetch(path, { headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) } }).then(r => r.json());
  };

  const load = async () => {
    if (!start || !end) return;
    setLoading(true); setErr("");
    try {
      const d = await API3(`/api/rostering/timesheet?start_date=${start}&end_date=${end}`);
      if (d.error) setErr(d.error);
      else setData(d);
    } catch(e) { setErr("Failed to load payroll data"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [start, end]);

  const purple = "#8B6DAF";
  const cardStyle = { background: "#FFFFFF", borderRadius: 14, border: "1px solid #E8E0D8", padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(80,60,90,0.04)" };
  const fmtMoney = c => `$${((c || 0) / 100).toFixed(2)}`;

  return (
    <div>
      {/* Date range selector */}
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700, color: "#3D3248", fontSize: 14 }}>Pay Period</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "#8A7F96" }}>From</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "#8A7F96" }}>To</label>
          <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #D9D0C7", fontSize: 13 }} />
        </div>
        <button onClick={load} style={{ padding: "8px 18px", background: purple, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        {data && (
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#8A7F96" }}>
            {data.entry_count} roster entries · {data.educators?.length || 0} staff
          </div>
        )}
      </div>

      {err && <div style={{ ...cardStyle, background: "#FEF2F2", color: "#C9828A" }}>⚠ {err}</div>}

      {/* Summary totals */}
      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              ["Total Hours", `${(data.totals?.total_hours || 0).toFixed(1)}h`, "#8B6DAF"],
              ["Total Cost", fmtMoney(data.totals?.total_cost_cents), "#6BA38B"],
              ["Overtime Hours", `${(data.totals?.overtime_hours || 0).toFixed(1)}h`, data.totals?.overtime_hours > 0 ? "#E65100" : "#6BA38B"],
              ["Staff on Payroll", data.educators?.length || 0, "#3D3248"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ ...cardStyle, padding: "14px 18px", marginBottom: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
                <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Per-educator breakdown */}
          <div style={cardStyle}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Educator Payroll Breakdown</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
                  {["Educator", "Employment", "Hours Worked", "Contracted", "Overtime", "Rate", "Total Cost", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.educators || []).map(ed => {
                  const statusColor = ed.status === "capped" ? "#E65100" : ed.status === "near_cap" ? "#D4A26A" : "#6BA38B";
                  const statusLabel = ed.status === "capped" ? "Over 38h" : ed.status === "near_cap" ? "Near cap" : "Normal";
                  return (
                    <tr key={ed.id} style={{ borderBottom: "1px solid #F0EBE6" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{ed.name}</td>
                      <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{ed.employment_type || "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{ed.total_hours.toFixed(1)}h</td>
                      <td style={{ padding: "10px 12px", color: "#8A7F96" }}>{(ed.contracted_hours || 38).toFixed(0)}h</td>
                      <td style={{ padding: "10px 12px", color: ed.overtime_hours > 0 ? "#E65100" : "#8A7F96", fontWeight: ed.overtime_hours > 0 ? 700 : 400 }}>
                        {ed.overtime_hours > 0 ? `+${ed.overtime_hours.toFixed(1)}h` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#8A7F96" }}>${((ed.hourly_rate_cents || 0) / 100).toFixed(2)}/hr</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{fmtMoney(ed.total_cost_cents)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: statusColor + "20", color: statusColor, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {data.totals && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid #E8E0D8", background: "#F8F5FC" }}>
                    <td colSpan={2} style={{ padding: "12px", fontWeight: 700 }}>TOTAL</td>
                    <td style={{ padding: "12px", fontWeight: 700 }}>{(data.totals.total_hours || 0).toFixed(1)}h</td>
                    <td />
                    <td style={{ padding: "12px", fontWeight: 700, color: "#E65100" }}>
                      {(data.totals.overtime_hours || 0) > 0 ? `+${(data.totals.overtime_hours).toFixed(1)}h` : "—"}
                    </td>
                    <td />
                    <td style={{ padding: "12px", fontWeight: 800, color: "#3D3248", fontSize: 15 }}>{fmtMoney(data.totals.total_cost_cents)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {!data && !loading && !err && (
        <div style={{ ...cardStyle, textAlign: "center", padding: 40, color: "#8A7F96" }}>
          Select a date range to generate payroll summary
        </div>
      )}
    </div>
  );
}

// ─── CERT EXPIRY REPORT TAB ────────────────────────────────────────────────────
function SmtpConfigPanel({ svc, setSvc, onSave }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const inp2 = { padding:"9px 12px",borderRadius:8,border:"1px solid #D9D0C7",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit" };
  const lbl2 = { fontSize:11,fontWeight:700,color:"#8A7F96",display:"block",marginBottom:5,textTransform:"uppercase" };
  const u = (k,v) => setSvc(s=>({...s,[k]:v}));

  const testSmtp = async () => {
    setTesting(true); setTestResult(null);
    try {
      const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
      const r = await fetch("/api/settings/test-email",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`,"x-tenant-id":tid},
        body:JSON.stringify({
          smtp_host: svc?.smtp_host, smtp_port: svc?.smtp_port,
          smtp_user: svc?.smtp_user, smtp_password: svc?.smtp_password,
          smtp_from: svc?.smtp_from, smtp_secure: svc?.smtp_secure,
        })
      }).then(r=>r.json());
      setTestResult(r);
    } catch(e) { setTestResult({error: e.message}); }
    setTesting(false);
  };

  return (
    <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",padding:"20px 24px",marginTop:16}}>
      <h3 style={{margin:"0 0 6px",fontSize:14,fontWeight:700}}>📧 SMTP Email Settings</h3>
      <p style={{margin:"0 0 18px",fontSize:12,color:"#8A7F96"}}>Configure outbound email for roster notifications, invoice delivery, and report scheduling.</p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div>
          <label style={lbl2}>SMTP Host</label>
          <input value={svc?.smtp_host||""} onChange={e=>u("smtp_host",e.target.value)} placeholder="smtp.gmail.com" style={inp2}/>
        </div>
        <div>
          <label style={lbl2}>Port</label>
          <input type="number" value={svc?.smtp_port||587} onChange={e=>u("smtp_port",parseInt(e.target.value)||587)} style={inp2}/>
        </div>
        <div>
          <label style={lbl2}>Username / Email</label>
          <input value={svc?.smtp_user||""} onChange={e=>u("smtp_user",e.target.value)} placeholder="noreply@yourcentre.com.au" style={inp2}/>
        </div>
        <div>
          <label style={lbl2}>Password / App Password</label>
          <input type="password" value={svc?.smtp_password||""} onChange={e=>u("smtp_password",e.target.value)} placeholder="App-specific password" style={inp2}/>
        </div>
        <div>
          <label style={lbl2}>From Name & Address</label>
          <input value={svc?.smtp_from||""} onChange={e=>u("smtp_from",e.target.value)} placeholder="Sunshine ELC &lt;noreply@yourcentre.com.au&gt;" style={inp2}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <label style={{...lbl2,marginBottom:10}}>Security</label>
          <div style={{display:"flex",gap:12}}>
            {[["TLS/STARTTLS","false"],["SSL (port 465)","true"]].map(([l,v])=>(
              <label key={v} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13}}>
                <input type="radio" name="smtp_secure" checked={(svc?.smtp_secure||"false")===v} onChange={()=>u("smtp_secure",v)}/> {l}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div style={{background:"#F8F5FC",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:11,color:"#5C4E6A"}}>
        <strong>Quick setup guides:</strong> Gmail → use App Password, port 587, TLS · Microsoft 365 → smtp.office365.com, port 587 · Sendinblue/Brevo → smtp-relay.brevo.com, port 587
      </div>

      {testResult && (
        <div style={{padding:"10px 14px",borderRadius:8,marginBottom:12,fontSize:12,
          background:testResult.ok?"#E8F5E9":"#FFEBEE",
          color:testResult.ok?"#1B5E20":"#B71C1C",
          border:`1px solid ${testResult.ok?"#A5D6A7":"#EF9A9A"}`}}>
          {testResult.ok ? "✅ Test email sent successfully! Check your inbox." : `❌ ${testResult.error}`}
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <button onClick={onSave} style={{padding:"9px 22px",background:"#8B6DAF",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>Save SMTP Settings</button>
        <button onClick={testSmtp} disabled={testing||!svc?.smtp_host}
          style={{padding:"9px 18px",background:"#E3F2FD",color:"#1565C0",border:"1px solid #90CAF9",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:13,opacity:(!svc?.smtp_host||testing)?0.6:1}}>
          {testing?"Sending…":"📨 Send Test Email"}
        </button>
      </div>
    </div>
  );
}


function ScheduleReportsTab() {
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState({ report_type:"payroll", frequency:"weekly", day_of_week:"1", time:"07:00", email:"", enabled:true, format:"pdf" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inp2 = { padding:"9px 12px", borderRadius:8, border:"1px solid #D9D0C7", fontSize:13, width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  const lbl2 = { fontSize:11, fontWeight:700, color:"#8A7F96", display:"block", marginBottom:5, textTransform:"uppercase" };
  const u = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async () => {
    try {
      const d = await fetch("/api/reports/schedules", {
        headers:{ Authorization:"Bearer "+localStorage.getItem("c360_token"), "x-tenant-id":localStorage.getItem("c360_tenant") }
      }).then(r=>r.json());
      if(Array.isArray(d)) setSchedules(d);
    } catch(e){}
  };
  useEffect(()=>{ load(); },[]);

  const save = async () => {
    if(!form.email) { if(window.showToast) window.showToast("Email address required","error"); return; }
    setSaving(true);
    try {
      await fetch("/api/reports/schedules", {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer "+localStorage.getItem("c360_token"), "x-tenant-id":localStorage.getItem("c360_tenant") },
        body: JSON.stringify(form)
      });
      setSaved(true); load();
      if(window.showToast) window.showToast("Report schedule saved ✓");
      setTimeout(()=>setSaved(false),3000);
    } catch(e){ if(window.showToast) window.showToast("Save failed","error"); }
    setSaving(false);
  };

  const toggle = async (id, enabled) => {
    try {
      await fetch("/api/reports/schedules/"+id, {
        method:"PUT",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer "+localStorage.getItem("c360_token"), "x-tenant-id":localStorage.getItem("c360_tenant") },
        body: JSON.stringify({ enabled })
      });
      load();
    } catch(e){}
  };

  const del = async (id) => {
    try {
      await fetch("/api/reports/schedules/"+id, {
        method:"DELETE",
        headers:{ Authorization:"Bearer "+localStorage.getItem("c360_token"), "x-tenant-id":localStorage.getItem("c360_tenant") }
      });
      load();
    } catch(e){}
  };

  const reportLabels = { payroll:"Payroll Summary", certifications:"Cert Expiry", hours:"Hours & Attendance", compliance:"Compliance Trends", utilisation:"Room Utilisation" };
  const freqLabels = { daily:"Daily", weekly:"Weekly", fortnightly:"Fortnightly", monthly:"Monthly" };
  const dayLabels = { "1":"Mon","2":"Tue","3":"Wed","4":"Thu","5":"Fri","6":"Sat","0":"Sun" };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {/* New schedule form */}
        <div style={cardStyle}>
          <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:700 }}>📅 New Report Schedule</h3>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <label style={lbl2}>Report Type</label>
              <select value={form.report_type} onChange={e=>u("report_type",e.target.value)} style={inp2}>
                {Object.entries(reportLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl2}>Format</label>
              <select value={form.format} onChange={e=>u("format",e.target.value)} style={inp2}>
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
                <option value="email_body">Email Summary</option>
              </select>
            </div>
            <div>
              <label style={lbl2}>Frequency</label>
              <select value={form.frequency} onChange={e=>u("frequency",e.target.value)} style={inp2}>
                {Object.entries(freqLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl2}>{form.frequency==="daily"?"Time":"Day & Time"}</label>
              <div style={{ display:"flex", gap:6 }}>
                {form.frequency!=="daily" && (
                  <select value={form.day_of_week} onChange={e=>u("day_of_week",e.target.value)} style={{...inp2, width:90}}>
                    {Object.entries(dayLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                )}
                <input type="time" value={form.time} onChange={e=>u("time",e.target.value)} style={inp2}/>
              </div>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl2}>Send to Email(s)</label>
            <input type="email" value={form.email} onChange={e=>u("email",e.target.value)} placeholder="manager@centre.com.au, owner@centre.com.au" style={inp2}/>
            <div style={{ fontSize:10, color:"#A89DB5", marginTop:3 }}>Separate multiple addresses with commas</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, cursor:"pointer" }}>
              <input type="checkbox" checked={form.enabled} onChange={e=>u("enabled",e.target.checked)}/>
              Active from creation
            </label>
            <button onClick={save} disabled={saving}
              style={{ padding:"9px 22px", background:"#8B6DAF", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:13, opacity:saving?0.6:1 }}>
              {saving?"Saving…":saved?"✓ Saved":"Save Schedule"}
            </button>
          </div>
        </div>

        {/* Info panel */}
        <div style={cardStyle}>
          <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700 }}>ℹ️ How Report Scheduling Works</h3>
          <div style={{ fontSize:12, color:"#5C4E6A", lineHeight:1.8 }}>
            <div style={{ marginBottom:8 }}>📧 Scheduled reports are emailed automatically at the configured time.</div>
            <div style={{ marginBottom:8 }}>📊 Reports reflect live data at the time of sending — always up to date.</div>
            <div style={{ marginBottom:8 }}>📅 <strong>Payroll Summary</strong> is ideal for Friday afternoon weekly sends.</div>
            <div style={{ marginBottom:8 }}>🏥 <strong>Cert Expiry</strong> weekly sends keep managers on top of compliance.</div>
            <div style={{ marginBottom:8 }}>📋 <strong>Compliance Trends</strong> monthly sends for board reporting.</div>
          </div>
          <div style={{ background:"#FEF3C7", border:"1px solid #FDE68A", borderRadius:8, padding:"10px 14px", marginTop:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#92400E", marginBottom:4 }}>⚙️ Email Setup Required</div>
            <div style={{ fontSize:11, color:"#92400E" }}>Configure SMTP settings in Settings → Notifications to enable email delivery. Without SMTP, schedules are saved but emails will not be sent.</div>
          </div>
        </div>
      </div>

      {/* Existing schedules */}
      {schedules.length > 0 && (
        <div style={{ ...cardStyle, marginTop:20 }}>
          <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:700 }}>Active Schedules</h3>
          {schedules.map(s => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, background:"#F8F5FC", marginBottom:8, border:"1px solid #EDE8F4" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{reportLabels[s.report_type] || s.report_type}</div>
                <div style={{ fontSize:11, color:"#8A7F96", marginTop:2 }}>
                  {freqLabels[s.frequency]} {s.frequency!=="daily"?`· ${dayLabels[s.day_of_week]}`:""} at {s.time} → {s.email} · {s.format?.toUpperCase()}
                </div>
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, cursor:"pointer" }}>
                <div onClick={()=>toggle(s.id, !s.enabled)}
                  style={{ width:36,height:20,borderRadius:10,background:s.enabled?"#6BA38B":"#DDD",position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0 }}>
                  <div style={{ position:"absolute",top:3,left:s.enabled?18:3,width:14,height:14,borderRadius:7,background:"#fff",transition:"left 0.2s" }}/>
                </div>
                {s.enabled ? "Active" : "Paused"}
              </label>
              <button onClick={()=>del(s.id)} style={{ padding:"5px 10px",background:"#FFEBEE",color:"#C9828A",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600 }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function EducatorAvailabilityTab() {
  const [educators, setEducators] = useState([]);
  const [loading, setLoading] = useState(true);

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const A3 = (path) => {
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    return fetch(path,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})}}).then(r=>r.json());
  };

  useEffect(()=>{
    A3("/api/educators").then(d=>{ if(Array.isArray(d)) setEducators(d); }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const exportCSV = () => {
    const rows=[["Educator","Qualification","Employment","Mon","Tue","Wed","Thu","Fri","Sat","Sun","Contracted Hrs"]];
    educators.filter(e=>e.status==="active").forEach(e=>{
      const av = e.availability||{};
      rows.push([
        `${e.first_name} ${e.last_name}`, e.qualification||"", e.employment_type||"",
        ...DAYS.map(d=>av[d.toLowerCase()]?.available?"✓":""),
        e.contracted_hours||""
      ]);
    });
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="educator_availability.csv";a.click();
  };

  const active = educators.filter(e=>e.status==="active");

  if (loading) return <div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Loading…</div>;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:12,color:"#8A7F96"}}>{active.length} active educators</div>
        <button onClick={exportCSV} style={{padding:"7px 16px",background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>⬇ Export CSV</button>
      </div>

      <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr style={{background:"#EDE8F4"}}>
              <th style={{padding:"9px 14px",textAlign:"left",fontWeight:700,color:"#5C4E6A",fontSize:11}}>Educator</th>
              <th style={{padding:"9px 10px",textAlign:"left",fontWeight:700,color:"#5C4E6A",fontSize:11}}>Type</th>
              {DAYS.map(d=>(
                <th key={d} style={{padding:"9px 8px",textAlign:"center",fontWeight:700,color:"#5C4E6A",fontSize:11,minWidth:44}}>{d}</th>
              ))}
              <th style={{padding:"9px 10px",textAlign:"center",fontWeight:700,color:"#5C4E6A",fontSize:11}}>Hrs</th>
            </tr>
          </thead>
          <tbody>
            {active.map((edu,i)=>{
              const av = edu.availability||{};
              const availDays = DAYS.filter(d=>av[d.toLowerCase()]?.available).length;
              return(
                <tr key={edu.id} style={{background:i%2===0?"#FDFBF9":"#fff",borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"8px 14px"}}>
                    <div style={{fontWeight:600,color:"#3D3248"}}>{edu.first_name} {edu.last_name}</div>
                    <div style={{fontSize:10,color:"#8A7F96"}}>{edu.qualification?.replace(/_/g," ")}</div>
                  </td>
                  <td style={{padding:"8px 10px"}}>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,background:"#F0EBF8",color:"#5C4E6A",fontWeight:600,whiteSpace:"nowrap"}}>
                      {edu.employment_type?.replace(/_/g," ")||"—"}
                    </span>
                  </td>
                  {DAYS.map(d=>{
                    const dayKey = d.toLowerCase();
                    const isAvail = av[dayKey]?.available;
                    const hours = isAvail ? `${av[dayKey]?.start||""}-${av[dayKey]?.end||""}` : null;
                    return(
                      <td key={d} style={{padding:"6px 4px",textAlign:"center"}}>
                        {isAvail
                          ? <div title={hours||""} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                              <div style={{width:24,height:24,borderRadius:"50%",background:"#E8F5E9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#2E7D32"}}>✓</div>
                              {hours&&hours!=="-"&&<div style={{fontSize:8,color:"#8A7F96",marginTop:1}}>{hours}</div>}
                            </div>
                          : <div style={{width:24,height:24,borderRadius:"50%",background:"#F5F5F5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#E0D6E8",margin:"0 auto"}}>—</div>
                        }
                      </td>
                    );
                  })}
                  <td style={{padding:"8px 10px",textAlign:"center",fontWeight:700,color:"#8B6DAF",fontSize:12}}>
                    {edu.contracted_hours||availDays*8||"—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {active.length===0&&<div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>No active educators found</div>}
    </div>
  );
}


function OccupancyReportTab() {
  const [rooms, setRooms] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);

  const API3 = (path) => {
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    return fetch(path,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})}}).then(r=>r.json());
  };

  useEffect(()=>{
    Promise.allSettled([API3("/api/rooms"),API3("/api/children")])
      .then(([rm,ch])=>{
        if(rm.status==="fulfilled"&&Array.isArray(rm.value)) setRooms(rm.value);
        if(ch.status==="fulfilled"&&Array.isArray(ch.value)) setChildren(ch.value);
      })
      .finally(()=>setLoading(false));
  },[]);

  if(loading) return <div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Loading…</div>;

  const totalCapacity = rooms.reduce((s,r)=>s+(r.capacity||0),0);
  const totalEnrolled = children.length;
  const overallPct = totalCapacity>0 ? Math.round(totalEnrolled/totalCapacity*100) : 0;

  const exportCSV = () => {
    const rows=[["Room","Age Group","Capacity","Enrolled","Occupancy %","Available Spots"]];
    rooms.forEach(r=>{
      const enrolled=children.filter(c=>c.room_id===r.id).length;
      const pct=r.capacity>0?Math.round(enrolled/r.capacity*100):0;
      rows.push([r.name,r.age_group||"",r.capacity||0,enrolled,pct+"%",(r.capacity||0)-enrolled]);
    });
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="occupancy_report.csv";a.click();
  };

  return (
    <div>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}>
        {[
          ["Total Capacity", totalCapacity, "#3D3248"],
          ["Enrolled", totalEnrolled, "#6BA38B"],
          ["Available Spots", totalCapacity-totalEnrolled, "#5B8DB5"],
          ["Occupancy", overallPct+"%", overallPct>=90?"#C06B73":overallPct>=75?"#D4A26A":"#6BA38B"],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:"14px 18px",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:800,color:c,lineHeight:1}}>{v}</div>
            <div style={{fontSize:11,color:"#8A7F96",marginTop:4,fontWeight:600,textTransform:"uppercase"}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Export button */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button onClick={exportCSV} style={{padding:"7px 16px",background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Room occupancy table */}
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #EDE8F4",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:"#EDE8F4"}}>
              {["Room","Age Group","Capacity","Enrolled","Available","Occupancy"].map(h=>(
                <th key={h} style={{padding:"10px 16px",textAlign:"left",fontWeight:700,color:"#5C4E6A",fontSize:11,textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room,i)=>{
              const enrolled = children.filter(c=>c.room_id===room.id).length;
              const pct = room.capacity>0 ? Math.round(enrolled/room.capacity*100) : 0;
              const available = (room.capacity||0)-enrolled;
              const barColor = pct>=90?"#C06B73":pct>=75?"#D4A26A":"#6BA38B";
              return(
                <tr key={room.id} style={{background:i%2===0?"#FDFBF9":"#fff",borderBottom:"1px solid #F0EBF8"}}>
                  <td style={{padding:"10px 16px",fontWeight:700,color:"#3D3248"}}>{room.name}</td>
                  <td style={{padding:"10px 16px",color:"#8A7F96",fontSize:12}}>{room.age_group||"—"}</td>
                  <td style={{padding:"10px 16px",textAlign:"center",fontWeight:600}}>{room.capacity||0}</td>
                  <td style={{padding:"10px 16px",textAlign:"center",fontWeight:700,color:"#3D3248"}}>{enrolled}</td>
                  <td style={{padding:"10px 16px",textAlign:"center",color:available===0?"#C06B73":"#6BA38B",fontWeight:700}}>{available}</td>
                  <td style={{padding:"10px 16px",minWidth:140}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1,height:8,borderRadius:4,background:"#EDE8F4",overflow:"hidden"}}>
                        <div style={{height:"100%",width:pct+"%",background:barColor,borderRadius:4,transition:"width 0.3s ease"}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:barColor,minWidth:34}}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Enrolled children by room */}
      <div style={{marginTop:20,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {rooms.map(room=>{
          const roomKids = children.filter(c=>c.room_id===room.id);
          return(
            <div key={room.id} style={{background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:"14px 16px"}}>
              <div style={{fontWeight:700,color:"#3D3248",marginBottom:8,fontSize:13}}>{room.name}
                <span style={{fontWeight:400,color:"#8A7F96",fontSize:11,marginLeft:8}}>{roomKids.length}/{room.capacity||"?"}</span>
              </div>
              {roomKids.length===0
                ? <div style={{fontSize:12,color:"#A89DB5",textAlign:"center",padding:"8px 0"}}>No children enrolled</div>
                : <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {roomKids.map(c=>(
                      <span key={c.id} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#F0EBF8",color:"#5C4E6A",fontWeight:600}}>
                        {c.first_name} {c.last_name?c.last_name[0]+".":""}
                      </span>
                    ))}
                  </div>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}


function EmergencyContactsTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(()=>{
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    fetch("/api/children",{headers:{Authorization:`Bearer ${t}`,"x-tenant-id":tid}})
      .then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setData(d); }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const filtered = data.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(s)
      || (c.parent1_name||"").toLowerCase().includes(s)
      || (c.parent1_phone||"").includes(s);
  });

  const exportCSV = () => {
    const rows=[["Child Name","Room","Allergy Alert","Parent 1 Name","Parent 1 Phone","Parent 1 Email","Parent 2 Name","Parent 2 Phone","Parent 2 Email"]];
    filtered.forEach(c=>rows.push([
      `${c.first_name} ${c.last_name}`, c.room_name||"—",
      c.allergies&&c.allergies!=="None"?c.allergies:"",
      c.parent1_name||"",c.parent1_phone||"",c.parent1_email||"",
      c.parent2_name||"",c.parent2_phone||"",c.parent2_email||"",
    ]));
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="emergency_contacts.csv";a.click();
  };

  const print = () => {
    const rows = filtered.map(c=>`
      <tr ${c.allergies&&c.allergies!=="None"?'style="background:#FFF3F3"':''}>
        <td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold">${c.first_name} ${c.last_name}</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${c.room_name||"—"}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;color:#B71C1C;font-weight:bold">${c.allergies&&c.allergies!=="None"?c.allergies:""}</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${c.parent1_name||"—"}</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${c.parent1_phone||"—"}</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${c.parent2_name||"—"}</td>
        <td style="padding:6px 10px;border:1px solid #ddd">${c.parent2_phone||"—"}</td>
      </tr>`).join("");
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>Emergency Contacts</title><style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}th{background:#3D3248;color:#fff;padding:8px 10px;text-align:left}@media print{.noprint{display:none}}</style></head><body><h2>Emergency Contacts Register</h2><p>${new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p><table><thead><tr><th>Child</th><th>Room</th><th>⚠ Allergy Alert</th><th>Parent 1</th><th>P1 Phone</th><th>Parent 2</th><th>P2 Phone</th></tr></thead><tbody>${rows}</tbody></table><div class="noprint" style="margin-top:16px"><button onclick="window.print()" style="padding:8px 20px;background:#3D3248;color:#fff;border:none;border-radius:6px;cursor:pointer">Print</button></div></body></html>`);
    w.document.close();
  };

  const inp3 = { padding:"8px 12px", borderRadius:8, border:"1px solid #D9D0C7", fontSize:13, width:260, boxSizing:"border-box" };

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search child or parent..." style={inp3}/>
        <div style={{flex:1}}/>
        <button onClick={print} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #DDD6EE",background:"#FDFBF9",color:"#5C4E6A",cursor:"pointer",fontWeight:700,fontSize:12}}>🖨 Print</button>
        <button onClick={exportCSV} style={{padding:"8px 14px",background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>⬇ Export CSV</button>
      </div>

      {filtered.filter(c=>c.allergies&&c.allergies!=="None").length>0&&(
        <div style={{background:"#FFF3F3",borderRadius:10,border:"1px solid #FFCDD2",padding:"10px 16px",marginBottom:14,fontSize:12}}>
          <strong style={{color:"#B71C1C"}}>⚠ {filtered.filter(c=>c.allergies&&c.allergies!=="None").length} children with allergy alerts</strong>
          <span style={{color:"#8A7F96",marginLeft:8}}>Highlighted in red below</span>
        </div>
      )}

      {loading ? <div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Loading…</div> : (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:"#EDE8F4"}}>
                {["Child","Room","⚠ Allergy Alert","Parent 1","P1 Phone","P1 Email","Parent 2","P2 Phone"].map(h=>(
                  <th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:700,color:"#5C4E6A",fontSize:11}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>{
                const hasAllergy = c.allergies && c.allergies !== "None";
                return (
                  <tr key={c.id} style={{background:hasAllergy?"#FFF5F5":i%2===0?"#FDFBF9":"#fff",borderBottom:"1px solid #F0EBF8"}}>
                    <td style={{padding:"8px 12px",fontWeight:700,color:"#3D3248"}}>{c.first_name} {c.last_name}</td>
                    <td style={{padding:"8px 12px",fontSize:11,color:"#8A7F96"}}>{c.room_name||"—"}</td>
                    <td style={{padding:"8px 12px",fontWeight:hasAllergy?700:400,color:hasAllergy?"#B71C1C":"#A89DB5",fontSize:11}}>{hasAllergy?`⚠ ${c.allergies}`:"—"}</td>
                    <td style={{padding:"8px 12px",fontWeight:600}}>{c.parent1_name||"—"}</td>
                    <td style={{padding:"8px 12px"}}><a href={`tel:${c.parent1_phone}`} style={{color:"#1565C0",textDecoration:"none"}}>{c.parent1_phone||"—"}</a></td>
                    <td style={{padding:"8px 12px",fontSize:11}}>{c.parent1_email||"—"}</td>
                    <td style={{padding:"8px 12px"}}>{c.parent2_name||"—"}</td>
                    <td style={{padding:"8px 12px"}}><a href={`tel:${c.parent2_phone}`} style={{color:"#1565C0",textDecoration:"none"}}>{c.parent2_phone||"—"}</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function AttendanceRegisterTab() {
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0,10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0,10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const inp2 = { padding:"9px 12px",borderRadius:8,border:"1px solid #D9D0C7",fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit" };
  const lbl2 = { fontSize:11,fontWeight:700,color:"#8A7F96",display:"block",marginBottom:5,textTransform:"uppercase" };

  const load = async () => {
    setLoading(true);
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    const hdr={Authorization:`Bearer ${t}`,"x-tenant-id":tid,"Content-Type":"application/json"};
    try {
      const r = await fetch(`/api/children/attendance-report?from=${fromDate}&to=${toDate}`,{headers:hdr}).then(r=>r.json());
      if(!r.error) setData(r);
      else if(window.showToast) window.showToast(r.error,"error");
    } catch(e){}
    setLoading(false);
  };

  const exportCSV = () => {
    if(!data) return;
    const rows=[["Child","Date","Arrived","Departed","Hours","Absent","Reason"]];
    (data.records||[]).forEach(r=>{
      rows.push([`${r.first_name} ${r.last_name}`,r.date,r.sign_in_time||"",r.sign_out_time||"",r.hours?.toFixed(1)||"",r.absent?"Yes":"No",r.absent_reason||""]);
    });
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join('\n');
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`attendance_${fromDate}_to_${toDate}.csv`;
    a.click();
  };

  const days = data ? [...new Set((data.records||[]).map(r=>r.date))].sort() : [];
  const children = data ? [...new Set((data.records||[]).map(r=>r.child_id))].map(id=>{
    const rec = data.records.find(r=>r.child_id===id);
    return {id, name:`${rec.first_name} ${rec.last_name}`};
  }).sort((a,b)=>a.name.localeCompare(b.name)) : [];

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:10,marginBottom:16,alignItems:"end"}}>
        <div><label style={lbl2}>From Date</label><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} style={inp2}/></div>
        <div><label style={lbl2}>To Date</label><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} style={inp2}/></div>
        <button onClick={load} disabled={loading}
          style={{padding:"9px 20px",background:"#8B6DAF",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,height:38,marginTop:20,opacity:loading?0.6:1}}>
          {loading?"Loading…":"Generate"}
        </button>
        {data&&<button onClick={exportCSV}
          style={{padding:"9px 16px",background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12,height:38,marginTop:20}}>
          ⬇ CSV
        </button>}
      </div>

      {data&&(
        <>
          <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            {[
              ["Total Records",data.records?.length||0,"#3D3248"],
              ["Present Days",(data.records||[]).filter(r=>r.sign_in_time).length,"#2E7D32"],
              ["Absent Days",(data.records||[]).filter(r=>r.absent).length,"#C06B73"],
              ["Avg Hours/Day",((data.records||[]).filter(r=>r.hours>0).reduce((s,r)=>s+(r.hours||0),0)/Math.max(1,(data.records||[]).filter(r=>r.hours>0).length)).toFixed(1),"#8B6DAF"],
            ].map(([l,v,c])=>(
              <div key={l} style={{padding:"10px 18px",borderRadius:10,background:"#fff",border:"1px solid #EDE8F4",textAlign:"center",minWidth:100}}>
                <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
                <div style={{fontSize:10,color:"#8A7F96",marginTop:2,fontWeight:600}}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:600}}>
              <thead>
                <tr style={{background:"#EDE8F4"}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:700,color:"#5C4E6A",position:"sticky",left:0,background:"#EDE8F4",zIndex:1}}>Child</th>
                  {days.map(d=><th key={d} style={{padding:"6px 8px",fontWeight:700,color:"#5C4E6A",minWidth:70}}>
                    <div>{new Date(d+"T12:00:00").toLocaleDateString("en-AU",{weekday:"short"})}</div>
                    <div style={{fontSize:9,fontWeight:400}}>{d.slice(5)}</div>
                  </th>)}
                  <th style={{padding:"6px 8px",fontWeight:700,color:"#5C4E6A"}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {children.map((ch,ci)=>{
                  const childRecs = (data.records||[]).filter(r=>r.child_id===ch.id);
                  const totalHrs = childRecs.reduce((s,r)=>s+(r.hours||0),0);
                  return(
                    <tr key={ch.id} style={{background:ci%2===0?"#FDFBF9":"#fff"}}>
                      <td style={{padding:"6px 12px",fontWeight:600,color:"#3D3248",position:"sticky",left:0,background:ci%2===0?"#FDFBF9":"#fff",zIndex:1,borderRight:"1px solid #EDE8F4"}}>{ch.name}</td>
                      {days.map(d=>{
                        const rec=childRecs.find(r=>r.date===d);
                        return(
                          <td key={d} style={{padding:"4px 6px",textAlign:"center",borderLeft:"1px solid #F5F0FB"}}>
                            {!rec?<span style={{color:"#E0D6E8"}}>—</span>
                            :rec.absent?<span style={{fontSize:10,fontWeight:700,color:"#C06B73",background:"#FFEBEE",padding:"1px 6px",borderRadius:8}}>ABS</span>
                            :rec.sign_in_time?<span style={{fontSize:9,color:"#2E7D32",fontWeight:600}}>{rec.sign_in_time?.slice(0,5)}{rec.sign_out_time?<><br/>{rec.sign_out_time?.slice(0,5)}</>:""}</span>
                            :<span style={{color:"#E0D6E8"}}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{padding:"4px 8px",textAlign:"center",fontWeight:700,color:"#8B6DAF",borderLeft:"1px solid #EDE8F4"}}>{totalHrs>0?totalHrs.toFixed(1)+"h":"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!data&&!loading&&<div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Select a date range and click Generate to view the attendance register.</div>}
    </div>
  );
}

function ChildrenReportTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(()=>{
    setLoading(true);
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    fetch("/api/children",{headers:{Authorization:`Bearer ${t}`,"x-tenant-id":tid}})
      .then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setData(d); }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const exportCSV = () => {
    const rows=[["First Name","Last Name","DOB","Age","Room","Status","Allergies","Emergency Contact","Emergency Phone"]];
    const ageStr = dob => { if(!dob)return""; const m=(new Date()-new Date(dob))/(1000*60*60*24*30.5); return m<24?Math.round(m)+"m":Math.round(m/12)+"y"; };
    filtered.forEach(c=>{
      rows.push([c.first_name,c.last_name,c.dob||"",ageStr(c.dob),c.room_name||"",c.status||"active",c.allergies||"",c.parent1_name||"",c.parent1_phone||""]);
    });
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join('\n');
    const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv); a.download="children_report.csv"; a.click();
  };

  const filtered = (data||[]).filter(c => filter==="all"||c.status===filter||(filter==="active"&&!c.status));
  const ageStr = dob => { if(!dob)return"—"; const m=(new Date()-new Date(dob))/(1000*60*60*24*30.5); return m<24?Math.round(m)+"m":Math.round(m/12)+"y"; };

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16,justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:6}}>
          {["all","active","inactive"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:filter===f?700:500,fontSize:12,background:filter===f?"#8B6DAF":"#EDE8F4",color:filter===f?"#fff":"#6B5F7A"}}>
              {f[0].toUpperCase()+f.slice(1)} ({(data||[]).filter(c=>f==="all"||(f==="active"&&(!c.status||c.status==="active"))||c.status===f).length})
            </button>
          ))}
        </div>
        <button onClick={exportCSV} style={{padding:"7px 16px",background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12}}>⬇ Export CSV</button>
      </div>
      {loading?<div style={{padding:40,textAlign:"center",color:"#A89DB5"}}>Loading…</div>:(
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:"#EDE8F4"}}>
                {["Name","Age","Room","Allergies","Emergency Contact","Status"].map(h=>(
                  <th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:700,color:"#5C4E6A"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>(
                <tr key={c.id} style={{background:i%2===0?"#FDFBF9":"#fff",borderBottom:"1px solid #F5F0FB"}}>
                  <td style={{padding:"8px 12px",fontWeight:600,color:"#3D3248"}}>{c.first_name} {c.last_name}</td>
                  <td style={{padding:"8px 12px",color:"#8A7F96"}}>{ageStr(c.dob)}</td>
                  <td style={{padding:"8px 12px"}}>{c.room_name||"—"}</td>
                  <td style={{padding:"8px 12px",color:c.allergies&&c.allergies!=="None"?"#C06B73":"#8A7F96",fontWeight:c.allergies&&c.allergies!=="None"?700:400,fontSize:11}}>{c.allergies||"None"}</td>
                  <td style={{padding:"8px 12px",fontSize:11,color:"#5C4E6A"}}>{c.parent1_name||"—"}{c.parent1_phone?` · ${c.parent1_phone}`:""}</td>
                  <td style={{padding:"8px 12px"}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:(!c.status||c.status==="active")?"#E8F5E9":"#F5F5F5",color:(!c.status||c.status==="active")?"#2E7D32":"#8A7F96"}}>
                      {c.status||"active"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function CertExpiryReportTab({ educators: propEdus }) {
  const [educators, setEducators] = useState(propEdus || []);
  useEffect(() => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    fetch("/api/educators", { headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setEducators(d); }).catch(() => {});
  }, []);
  const now = new Date();
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
  const in60 = new Date(now); in60.setDate(in60.getDate() + 60);
  const in90 = new Date(now); in90.setDate(in90.getDate() + 90);

  const certFields = [
    { key: "first_aid_expiry", label: "First Aid" },
    { key: "cpr_expiry", label: "CPR" },
    { key: "anaphylaxis_expiry", label: "Anaphylaxis" },
    { key: "asthma_expiry", label: "Asthma Management" },
    { key: "wwcc_expiry", label: "WWCC" },
  ];

  const rows = [];
  educators.filter(e => e.status !== "inactive").forEach(ed => {
    certFields.forEach(cf => {
      const d = ed[cf.key];
      if (!d) return;
      const expDate = new Date(d);
      const daysLeft = Math.ceil((expDate - now) / 86400000);
      let status = "ok";
      if (daysLeft < 0) status = "expired";
      else if (daysLeft <= 30) status = "critical";
      else if (daysLeft <= 60) status = "warning";
      else if (daysLeft <= 90) status = "notice";
      else return; // only show within 90 days or expired
      rows.push({ ed, cert: cf.label, expiry: d, daysLeft, status });
    });
  });
  rows.sort((a, b) => a.daysLeft - b.daysLeft);

  const statusStyles = {
    expired:  { color: "#B71C1C", bg: "#FFEBEE", label: "Expired" },
    critical: { color: "#E65100", bg: "#FFF3E0", label: "< 30 days" },
    warning:  { color: "#D4A26A", bg: "#FFF8E1", label: "< 60 days" },
    notice:   { color: "#6BA38B", bg: "#E8F5E9", label: "< 90 days" },
  };

  const cardStyle = { background: "#FFFFFF", borderRadius: 14, border: "1px solid #E8E0D8", padding: 20, marginBottom: 16, boxShadow: "0 2px 12px rgba(80,60,90,0.04)" };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          ["Expired", rows.filter(r => r.status === "expired").length, "#B71C1C"],
          ["< 30 Days", rows.filter(r => r.status === "critical").length, "#E65100"],
          ["< 60 Days", rows.filter(r => r.status === "warning").length, "#D4A26A"],
          ["< 90 Days", rows.filter(r => r.status === "notice").length, "#6BA38B"],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...cardStyle, padding: "14px 18px", marginBottom: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 12, color: "#8A7F96", marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Certifications Expiring Within 90 Days</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#8A7F96" }}>Active educators only. Sorted by most urgent first.</p>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#6BA38B", fontWeight: 600 }}>✓ All certifications are current and not expiring within 90 days</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E8E0D8" }}>
                {["Educator", "Certification", "Expiry Date", "Days Left", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8A7F96", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const s = statusStyles[row.status];
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #F0EBE6", background: row.status === "expired" ? "#FFF5F5" : "transparent" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{row.ed.first_name} {row.ed.last_name}</td>
                    <td style={{ padding: "10px 12px" }}>{row.cert}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "'DM Sans', sans-serif" }}>
                      {new Date(row.expiry + "T00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: s.color }}>
                      {row.daysLeft < 0 ? `${Math.abs(row.daysLeft)} days ago` : `${row.daysLeft} days`}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


function RosteringSettingsPanel() {
  const API_r = async (path, opts={}) => {
    const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");
    const res=await fetch(path,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{}),...(opts.headers||{})},method:opts.method||"GET",...(opts.body?{body:JSON.stringify(opts.body)}:{})});
    return res.json();
  };
  const [config, setConfig] = useState(null);
  const [loadingCfg, setLoadingCfg] = useState(true);

  useEffect(()=>{
    API_r("/api/rostering/ai-config").then(d=>{
      if(d.configs?.[0]) setConfig(d.configs[0]);
    }).catch(()=>{}).finally(()=>setLoadingCfg(false));
  },[]);

  const reload = () => {
    API_r("/api/rostering/ai-config").then(d=>{ if(d.configs?.[0]) setConfig(d.configs[0]); }).catch(()=>{});
  };

  if (loadingCfg) return <div style={{padding:32,textAlign:"center",color:"#A89DB5"}}>Loading rostering settings…</div>;

  return <InnerRosteringSettings config={config} reload={reload} API_r={API_r} />;
}

function InnerRosteringSettings({ config, reload, API_r }) {
  // Local style constants (mirrors RosteringModule style vars)
  const lbl={fontSize:11,color:"#7A6E8A",fontWeight:700,display:"block",marginBottom:4};
  const inp={padding:"7px 10px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:12,width:"100%",boxSizing:"border-box"};
  const sel={...inp};
  const btnP={padding:"8px 18px",background:"#8B6DAF",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12};
  const btnS={padding:"8px 18px",background:"transparent",color:"#8B6DAF",border:"1px solid #DDD6EE",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12};
  const card={background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:16,marginBottom:12};
  const [section,setSection]=useState("agent");
  const [f,setF]=useState({
    enabled:true,contact_strategy:"sequential",send_sms_first:true,sms_wait_mins:10,call_wait_mins:15,
    max_attempts_per_educator:2,simultaneous_contacts:3,priority_order:"reliability_desc",
    sms_template:"Hi {name}, we have an urgent shift at {centre} on {date} from {start} to {end} in {room}. Can you cover? Reply YES or NO.",
    call_script_guidance:"Greet by name. Explain a shift needs covering. Provide date, time, room. Ask availability. Confirm if yes. Friendly and professional.",
    voice_engine:"none",voice_engine_api_key:"",voice_engine_endpoint:"",voice_id:"",
    sms_provider:"none",sms_api_key:"",sms_from_number:"",webhook_url:"",middleware_endpoint:"",
    working_hours_start:"05:00",working_hours_end:"21:00",
    auto_approve_fill:false,notify_manager_on_fill:true,notify_manager_on_fail:true,
    manager_user_id:"",manager_phone:"",manager_email:"",...(config||{}),
  });
  const [saving,setSaving]=useState(false);
  const u=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);try{const r=await API_r("/api/rostering/ai-config",{method:"PUT",body:{...f,agent_type:"sick_cover"}});if(r.error){window.showToast(r.error, 'error');}}catch(e){alert("Save failed: "+e.message);}setSaving(false);reload();};
  const F=({label,k,type,ph,opts,span,info})=>(
    <div style={{gridColumn:span?"span "+span:undefined}}>
      <label style={lbl}>{label}</label>
      {opts?<select style={sel} value={f[k]||""} onChange={e=>u(k,e.target.value)}>{opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        :type==="check"?<label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,cursor:"pointer"}}><input type="checkbox" checked={!!f[k]} onChange={e=>u(k,e.target.checked)}/> {ph||"Enabled"}</label>
        :type==="area"?<textarea style={{...inp,height:70,resize:"vertical",fontSize:11}} value={f[k]||""} onChange={e=>u(k,e.target.value)} placeholder={ph}/>
        :type==="date"?<DatePicker value={f[k]||""} onChange={v=>u(k,v)} />
        :<input type={type==="number"?"text":type||"text"} inputMode={type==="number"?"decimal":undefined} style={inp} value={f[k]===undefined||f[k]===null?"":String(f[k])} onChange={e=>u(k,e.target.value)} onBlur={type==="number"?e=>{const n=parseFloat(e.target.value);u(k,isNaN(n)?0:n);}:undefined} placeholder={ph}/>}
      {info&&<div style={{fontSize:9,color:"#A89DB5",marginTop:1}}>{info}</div>}
    </div>
  );
  const secs=[["agent","🤖 AI Agent"],["messaging","💬 Messaging"],["integrations","🔌 Integrations"],["costs","💰 Costs"]];
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",gap:4}}>{secs.map(([id,l])=><button key={id} onClick={()=>setSection(id)} style={{...btnS,background:section===id?"rgba(139,109,175,0.1)":"#F8F5F1",color:section===id?"#7E5BA3":"#6B5F7A",fontWeight:section===id?700:500}}>{l}</button>)}</div>
        <button onClick={save} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?"Saving…":"💾 Save"}</button>
      </div>
      {section==="agent"&&<div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>🤖 AI Agent</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <F label="Agent Enabled" k="enabled" type="check"/>
        <F label="Contact Strategy" k="contact_strategy" opts={[["sequential","Sequential"],["simultaneous","Simultaneous"]]}/>
        <F label="Priority" k="priority_order" opts={[["reliability_desc","Highest Reliability"],["distance_asc","Nearest First"],["cost_asc","Lowest Cost"]]}/>
        <F label="Send SMS First?" k="send_sms_first" type="check"/>
        <F label="SMS Wait (mins)" k="sms_wait_mins" type="number"/>
        <F label="Call Wait (mins)" k="call_wait_mins" type="number"/>
        <F label="Max Attempts/Ed" k="max_attempts_per_educator" type="number"/>
        <F label="Simultaneous Contacts" k="simultaneous_contacts" type="number"/>
        <div/>
        <F label="Working Hours Start" k="working_hours_start" type="time"/>
        <F label="Working Hours End" k="working_hours_end" type="time"/>
        <div/>
        <F label="Auto-Approve Fill" k="auto_approve_fill" type="check"/>
        <F label="Notify on Fill" k="notify_manager_on_fill" type="check"/>
        <F label="Notify on Fail" k="notify_manager_on_fail" type="check"/>
        <F label="Manager Phone" k="manager_phone" ph="0400 000 000"/>
        <F label="Manager Email" k="manager_email" ph="manager@centre.com.au"/>
        <div/>
      </div></div>}
      {section==="messaging"&&<div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>💬 Templates</h4>
        <F label="SMS Template" k="sms_template" type="area" info="Variables: {name}, {centre}, {date}, {start}, {end}, {room}"/>
        <div style={{marginTop:10}}><F label="Call Script Guidance" k="call_script_guidance" type="area" info="General direction for AI voice agent"/></div>
      </div>}
      {section==="integrations"&&<div>
        <div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>📱 SMS</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}><F label="Provider" k="sms_provider" opts={[["none","None"],["twilio","Twilio"],["messagebird","MessageBird"],["vonage","Vonage"]]}/><F label="API Key" k="sms_api_key" type="password" ph="sk_live_…"/><F label="From Number" k="sms_from_number" ph="+614xxxxxxxx"/></div></div>
        <div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>🎙️ Voice Engine</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><F label="Engine" k="voice_engine" opts={[["none","None"],["elevenlabs","ElevenLabs"],["playht","Play.ht"],["openai_realtime","OpenAI Realtime"],["vapi","Vapi"],["bland","Bland.ai"],["retell","Retell"]]}/><F label="Voice ID" k="voice_id" ph="voice_abc123"/><F label="API Key" k="voice_engine_api_key" type="password" ph="sk_…"/><F label="Endpoint" k="voice_engine_endpoint" ph="https://api.provider.com/v1"/></div></div>
        <div style={card}><h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>🔗 Webhooks</h4><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><F label="Webhook URL" k="webhook_url" ph="https://n8n.example.com/webhook/…"/><F label="Middleware Endpoint" k="middleware_endpoint" ph="https://api.example.com/childcare360"/></div></div>
      </div>}
      {section==="costs"&&<div style={card}>
        <h4 style={{margin:"0 0 10px",fontSize:13,fontWeight:700}}>💰 Usage & Costs</h4>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          {[{t:"Phone Calls",n:12,cost:4.80,rate:"$0.40/call",icon:"📞"},{t:"SMS",n:28,cost:2.24,rate:"$0.08/SMS",icon:"💬"},{t:"AI Processing",n:"75 min",cost:1.50,rate:"$0.02/min",icon:"🤖"}].map(c=>(
            <div key={c.t} style={{padding:"10px 14px",borderRadius:10,background:"#F8F5F1",border:"1px solid #E8E0D8",textAlign:"center"}}><div style={{fontSize:16}}>{c.icon}</div><div style={{fontSize:9,fontWeight:700,color:"#8A7F96"}}>{c.t}</div><div style={{fontSize:18,fontWeight:800}}>{c.n}</div><div style={{fontSize:12,fontWeight:700,color:"#2E8B57"}}>${c.cost.toFixed(2)}</div><div style={{fontSize:9,color:"#A89DB5"}}>{c.rate}</div></div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",borderRadius:10,background:"rgba(139,109,175,0.06)",border:"1px solid rgba(139,109,175,0.15)"}}><span style={{fontSize:13,fontWeight:700}}>Total Monthly AI Spend</span><span style={{fontSize:18,fontWeight:800,color:"#7E5BA3"}}>$8.54</span></div>
      </div>}
    </div>
  );
}
// ─── SETTINGS VIEW ─────────────────────────────────────────────────────────────

// ─── CREDENTIALS HUB ─────────────────────────────────────────────────────────
// Single place to store ALL API keys, tokens, secrets for the tenant
function CredentialsTab({ tenantId, API2 }) {
  const [creds, setCreds]     = useState({});   // { "provider.key_name": value }
  const [saved, setSaved]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(null);
  const [results, setResults] = useState({});

  const PROVIDERS = [
    {
      id: "anthropic", name: "Anthropic Claude", icon: "🟣", url: "https://console.anthropic.com/",
      desc: "Used for AI writing assistant, observations, run sheets, and document analysis.",
      fields: [{ key: "api_key", label: "API Key", placeholder: "sk-ant-..." }],
    },
    {
      id: "openai", name: "OpenAI", icon: "🟢", url: "https://platform.openai.com/",
      desc: "Alternative AI provider for generation tasks.",
      fields: [{ key: "api_key", label: "API Key", placeholder: "sk-..." }],
    },
    {
      id: "retell", name: "Retell AI (Voice Agent)", icon: "📞", url: "https://app.retellai.com/",
      desc: "Powers the inbound sick-call voice agent for automatic shift cover.",
      fields: [
        { key: "api_key", label: "API Key", placeholder: "key_..." },
        { key: "agent_id", label: "Agent ID", placeholder: "agent_..." },
        { key: "phone_number", label: "Phone Number", placeholder: "+61..." },
      ],
    },
    {
      id: "twilio", name: "Twilio (SMS)", icon: "📱", url: "https://console.twilio.com/",
      desc: "Sends SMS notifications for shift fill requests and parent alerts.",
      fields: [
        { key: "account_sid", label: "Account SID", placeholder: "AC..." },
        { key: "auth_token", label: "Auth Token", placeholder: "" },
        { key: "from_number", label: "From Number", placeholder: "+61..." },
      ],
    },
    {
      id: "xero", name: "Xero (Accounting)", icon: "💼", url: "https://developer.xero.com/",
      desc: "Syncs invoices and payments with your Xero accounting system.",
      fields: [
        { key: "client_id", label: "Client ID", placeholder: "" },
        { key: "client_secret", label: "Client Secret", placeholder: "" },
      ],
    },
    {
      id: "stripe", name: "Stripe (Payments)", icon: "💳", url: "https://dashboard.stripe.com/",
      desc: "Processes online payments and direct debit for parent invoices.",
      fields: [
        { key: "secret_key", label: "Secret Key", placeholder: "sk_live_..." },
        { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
        { key: "webhook_secret", label: "Webhook Secret", placeholder: "whsec_..." },
      ],
    },
    {
      id: "smtp", name: "Email (SMTP)", icon: "📧", url: null,
      desc: "Sends emails for invoices, parent communications, and notifications.",
      fields: [
        { key: "host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
        { key: "port", label: "Port", placeholder: "587" },
        { key: "username", label: "Username / Email", placeholder: "" },
        { key: "password", label: "Password / App Password", placeholder: "" },
        { key: "from_name", label: "From Name", placeholder: "Childcare360" },
      ],
    },
    {
      id: "acecqa", name: "ACECQA / NER", icon: "🎓", url: "https://www.acecqa.gov.au/",
      desc: "National Educator Register verification for educator WWCC checks.",
      fields: [
        { key: "api_key", label: "API Key", placeholder: "" },
        { key: "provider_id", label: "Provider Approval Number", placeholder: "" },
      ],
    },
  ];

  useEffect(() => {
    API2("/api/ai/credentials").then(d => {
      const map = {};
      (d.credentials || []).forEach(c => { map[`${c.provider}.${c.key_name}`] = c.masked; });
      setCreds(map);
    }).catch(() => {});
  }, []);

  const set = (provider, key, value) => {
    setCreds(p => ({ ...p, [`${provider}.${key}`]: value }));
  };

  const get = (provider, key) => creds[`${provider}.${key}`] || "";

  const hasAny = (provider) => PROVIDERS.find(p => p.id === provider)?.fields
    .some(f => get(provider, f.key) && !get(provider, f.key).includes("••••"));

  const saveAll = async () => {
    setSaving(true);
    const credentials = [];
    PROVIDERS.forEach(p => {
      p.fields.forEach(f => {
        const val = get(p.id, f.key);
        if (val && !val.includes("••••")) {
          credentials.push({ provider: p.id, key_name: f.key, key_value: val });
        }
      });
    });
    await API2("/api/ai/credentials", { method: "PUT", body: { credentials } }).catch(() => {});
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    // Reload masked values
    API2("/api/ai/credentials").then(d => {
      const map = {};
      (d.credentials || []).forEach(c => { map[`${c.provider}.${c.key_name}`] = c.masked; });
      setCreds(map);
    }).catch(() => {});
  };

  const testConnection = async (providerId) => {
    setTesting(providerId);
    try {
      const r = await API2(`/api/ai/test/${providerId}`, { method: "POST" });
      setResults(p => ({ ...p, [providerId]: r }));
    } catch (e) {
      setResults(p => ({ ...p, [providerId]: { ok: false, message: e.message } }));
    }
    setTesting(null);
  };

  const P = "#7C3AED", DARK = "#3D3248", MU = "#8A7F96", OK = "#16A34A", DA = "#DC2626";
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "18px 22px", marginBottom: 14 };
  const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 13, width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
  const lbl = { fontSize: 11, color: MU, fontWeight: 700, display: "block", marginBottom: 4, textTransform: "uppercase" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: DARK }}>🔑 API Keys & Credentials</div>
          <div style={{ fontSize: 12, color: MU, marginTop: 3 }}>
            One place for all external service keys. Values are encrypted and stored securely per organisation.
          </div>
        </div>
        <button onClick={saveAll} disabled={saving}
          style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: P, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save All Changes"}
        </button>
      </div>

      {PROVIDERS.map(prov => {
        const configured = prov.fields.some(f => creds[`${prov.id}.${f.key}`]);
        const result = results[prov.id];
        return (
          <div key={prov.id} style={{ ...card, borderLeft: `3px solid ${configured ? P + "60" : "#EDE8F4"}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>{prov.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: DARK }}>{prov.name}</span>
                  {configured && <span style={{ fontSize: 10, background: "#F0FDF4", color: OK, padding: "1px 7px", borderRadius: 20, fontWeight: 700 }}>Configured</span>}
                </div>
                <div style={{ fontSize: 12, color: MU, marginTop: 2 }}>{prov.desc}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {configured && ["anthropic","openai"].includes(prov.id) && (
                  <button onClick={() => testConnection(prov.id)} disabled={testing === prov.id}
                    style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${P}40`, background: "#F8F5FC", color: P, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                    {testing === prov.id ? "Testing…" : "Test"}
                  </button>
                )}
                {prov.url && (
                  <a href={prov.url} target="_blank" rel="noopener"
                    style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #EDE8F4", background: "#F8F5FC", color: MU, cursor: "pointer", fontSize: 11, textDecoration: "none" }}>
                    Get Key ↗
                  </a>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {prov.fields.map(field => (
                <div key={field.key}>
                  <label style={lbl}>{field.label}</label>
                  <input
                    type={["api_key","secret_key","auth_token","client_secret","password","webhook_secret"].includes(field.key) ? "password" : "text"}
                    value={get(prov.id, field.key)}
                    onChange={e => set(prov.id, field.key, e.target.value)}
                    placeholder={get(prov.id, field.key)?.includes("••••") ? "••••••••••••••••" : (field.placeholder || "")}
                    style={inp}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>

            {result && (
              <div style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: result.ok ? "#F0FDF4" : "#FEF2F2", color: result.ok ? OK : DA }}>
                {result.ok ? `✓ ${result.model ? "Connected · " + result.model : "Connected"}` : `✗ ${result.message || "Failed"}`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DataManagementPanel() {
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState(null);
  const API3 = (path, opts = {}) => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    return fetch(path, {
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}), ...opts.headers },
      method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    }).then(r => r.json());
  };
  const handleReseed = async () => {
    if (!(await window.showConfirm("This will CLEAR all existing demo data and reseed with 9 rooms, 96 children, 15 educators, and full history. Continue?"))) return;
    setSeeding(true); setResult(null);
    try {
      const r = await API3("/api/settings/reseed", { method: "POST" });
      setResult(r);
      if (r.ok) window.showToast?.("Demo data reseeded successfully! Refresh the page to see changes.", "success");
      else window.showToast?.("Reseed failed: " + (r.error || "Unknown error"), "error");
    } catch (e) { setResult({ error: e.message }); window.showToast?.("Reseed failed", "error"); }
    setSeeding(false);
  };
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {[{n:"9",l:"Rooms",i:"🏠"},{n:"96",l:"Children",i:"👶"},{n:"15",l:"Educators",i:"👩‍🏫"}].map(s=>(
          <div key={s.l} style={{textAlign:"center",padding:"12px 16px",borderRadius:10,background:"#F8F5FC",border:"1px solid #EDE8F4"}}>
            <div style={{fontSize:24}}>{s.i}</div>
            <div style={{fontSize:20,fontWeight:800,color:"#7C3AED"}}>{s.n}</div>
            <div style={{fontSize:11,color:"#8A7F96"}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{background:"#FFF8E1",borderRadius:10,padding:"12px 16px",marginBottom:16,border:"1px solid #FFE082"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#E65100",marginBottom:4}}>⚠️ Warning</div>
        <div style={{fontSize:11,color:"#5C4E6A"}}>
          This will <strong>delete all existing data</strong> for this tenant and replace it with fresh demo data including:
          medical plans, immunisations (3 due soon), WWCC alerts (2 expiring), attendance (30 days), daily updates,
          observations, incidents, rosters, staff wellbeing, leave requests, and compliance alerts.
        </div>
      </div>
      <button onClick={handleReseed} disabled={seeding}
        style={{padding:"12px 24px",borderRadius:10,border:"none",background:seeding?"#CCC":"linear-gradient(135deg,#8B6DAF,#7E5BA3)",
          color:"#fff",fontSize:14,fontWeight:700,cursor:seeding?"wait":"pointer",width:"100%",fontFamily:"inherit"}}>
        {seeding ? "⏳ Reseeding... (this takes a few seconds)" : "🔄 Reset & Reseed Demo Data"}
      </button>
      {result && (
        <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:result.ok?"#E8F5E9":"#FEF2F2",border:"1px solid "+(result.ok?"#A5D6A7":"#FFCDD2"),fontSize:11}}>
          {result.ok ? (
            <div>
              <div style={{fontWeight:700,color:"#2E7D32",marginBottom:4}}>✅ Reseed Complete</div>
              <pre style={{margin:0,whiteSpace:"pre-wrap",color:"#5C4E6A",fontSize:10}}>{result.output}</pre>
              <div style={{marginTop:8,fontWeight:600,color:"#7C3AED"}}>Refresh the page (Ctrl+Shift+R) to see the new data.</div>
            </div>
          ) : (
            <div style={{color:"#C06B73"}}>❌ {result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsView() {
  const [stab, setStab] = useState("service");
  const [svc, setSvc]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [dataMsg, setDataMsg] = useState(null);
  const [dataWorking, setDataWorking] = useState(false);
  const [saved, setSaved]   = useState(false);

  // AI state
  const [catalogue, setCatalogue] = useState({});
  const [providers,  setProviders]  = useState([]);
  const [usage, setUsage]           = useState(null);
  const [editProv, setEditProv]     = useState(null); // provider being edited
  const [testing, setTesting]       = useState(null);  // provider key being tested
  const [testResult, setTestResult] = useState({});    // {provKey: {ok,msg}}

  const API2 = (path, opts={}) => {
    const t=localStorage.getItem("c360_token"), tid=localStorage.getItem("c360_tenant");
    return fetch(path,{ method:opts.method||"GET",
      headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{}),...opts.headers},
      ...(opts.body?{body:JSON.stringify(opts.body)}:{}) }).then(r=>r.json());
  };

  useEffect(()=>{
    API2("/api/settings").then(d=>{ if(d&&!d.error) setSvc(d); }).catch(()=>{});
    if (stab==="ai") {
      API2("/api/ai/catalogue").then(d=>{ if(d&&!d.error) setCatalogue(d); }).catch(()=>{});
      API2("/api/ai/providers").then(d=>{ if(Array.isArray(d)) setProviders(d); }).catch(()=>{});
      API2("/api/ai/usage").then(d=>{ if(d) setUsage(d); }).catch(()=>{});
    }
  },[stab]);

  const saveSvc = async () => {
    setSaving(true);
    await API2("/api/settings",{method:"PUT",body:svc}).catch(()=>{});
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000);
  };

  const saveProvider = async (data) => {
    try {
      await API2("/api/ai/providers",{method:"POST",body:data});
      const d = await API2("/api/ai/providers");
      if(Array.isArray(d)) setProviders(d);
      setEditProv(null);
    } catch(e) { toast('Failed to save provider: ' + e.message, 'error'); }
  };
  const deleteProvider = async (provider) => {
    if(!(await window.showConfirm(`Remove ${provider} provider?`))) return;
    try {
      await API2(`/api/ai/providers/${provider}`,{method:"DELETE"});
      setProviders(p=>p.filter(x=>x.provider!==provider));
    } catch(e) { toast('Failed to remove provider', 'error'); }
  };
  const testProvider = async (prov) => {
    setTesting(prov);
    setTestResult(r=>({...r,[prov]:null}));
    try {
      const r = await API2("/api/ai/complete",{method:"POST",body:{
        provider:prov, messages:[{role:"user",content:"Reply with exactly: OK"}],
        max_tokens:10, feature:"test",
      }});
      if(r.error==="no_provider") setTestResult(x=>({...x,[prov]:{ok:false,msg:"No provider configured"}}));
      else if(r.content) setTestResult(x=>({...x,[prov]:{ok:true,msg:`✓ Connected · model: ${r.model}`}}));
      else setTestResult(x=>({...x,[prov]:{ok:false,msg:r.message||"No response"}}));
    } catch(e) { setTestResult(x=>({...x,[prov]:{ok:false,msg:e.message}})); }
    setTesting(null);
  };

    const STABS = [{id:"service",l:"⚙️ Service"},{id:"regulatory",l:"📜 Regulatory"},{id:"credentials",l:"🔑 Credentials"},{id:"ai",l:"🤖 AI Providers"},{id:"mfa",l:"🔐 Security"},{id:"data",l:"🔧 Data Management"}];
  const purple2="#8B6DAF", lp2="#F0EBF8";
  const inp2={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:12,width:"100%",boxSizing:"border-box"};
  const lbl2={fontSize:11,color:"#7A6E8A",fontWeight:700,display:"block",marginBottom:4};

  // TIER colors
  const tierColors={flagship:"#7E5BA3",balanced:"#4A8A7B",fast:"#D4A26A",economy:"#888",reasoning:"#C9829E",powerful:"#5B8DB5",local:"#6BA38B"};

  return (
    <div>
      {/* Tab bar */}
      <div style={{display:"flex",gap:4,marginBottom:16,background:"#fff",borderRadius:12,border:"1px solid #EDE8F4",padding:8,flexWrap:"wrap"}}>
        {STABS.map(t=>(
          <button key={t.id} onClick={()=>setStab(t.id)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:stab===t.id?700:500,background:stab===t.id?purple2:lp2,color:stab===t.id?"#fff":"#6B5F7A"}}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── SERVICE CONFIG TAB ── */}
      {stab==="service" && (
        <div>
          <div style={cardStyle}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,fontSize:14,fontWeight:700}}>Service Configuration</h3>
              <button onClick={saveSvc} disabled={saving} style={{padding:"7px 18px",borderRadius:8,border:"none",background:saved?"#2E7D32":purple2,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                {saved?"✓ Saved":saving?"Saving…":"Save Changes"}
              </button>
            </div>
            {svc && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {[["Service Name","service_name"],["Approval Number","approval_number"],["ABN","abn"],["Director","director_name"],["Nominated Supervisor","nominated_supervisor"],["Phone","phone"],["Email","email"]].map(([l,k])=>(
                  <div key={k}>
                    <label style={lbl2}>{l}</label>
                    <input style={inp2} value={svc[k]||""} onChange={e=>setSvc(s=>({...s,[k]:e.target.value}))} placeholder={l}/>
                  </div>
                ))}
                <div style={{gridColumn:"span 2"}}>
                  <label style={lbl2}>Address</label>
                  <input style={inp2} value={svc.address||""} onChange={e=>setSvc(s=>({...s,address:e.target.value}))} placeholder="Full service address"/>
                </div>
                <div>
                  <label style={lbl2}>State / Territory</label>
                  <select style={inp2} value={svc.state||"NSW"} onChange={e=>setSvc(s=>({...s,state:e.target.value}))}>
                    {["NSW","VIC","QLD","WA","SA","TAS","NT","ACT"].map(st=><option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl2}>Service Type</label>
                  <select style={inp2} value={svc.service_type||"long_day_care"} onChange={e=>setSvc(s=>({...s,service_type:e.target.value}))}>
                    <option value="long_day_care">Long Day Care</option>
                    <option value="family_day_care">Family Day Care</option>
                    <option value="oshc">OSHC</option>
                    <option value="preschool">Preschool/Kindergarten</option>
                  </select>
                </div>
                <div>
                  <label style={lbl2}>Open Time</label>
                  <input type="time" style={inp2} value={svc.open_time||"06:30"} onChange={e=>setSvc(s=>({...s,open_time:e.target.value}))}/>
                </div>
                <div>
                  <label style={lbl2}>Close Time</label>
                  <input type="time" style={inp2} value={svc.close_time||"18:30"} onChange={e=>setSvc(s=>({...s,close_time:e.target.value}))}/>
                </div>
                <div>
                  <label style={lbl2}>NQS Rating</label>
                  <select style={inp2} value={svc.nqs_rating||""} onChange={e=>setSvc(s=>({...s,nqs_rating:e.target.value}))}>
                    <option value="">Not yet rated</option>
                    <option value="excellent">Excellent</option>
                    <option value="exceeding">Exceeding NQS</option>
                    <option value="meeting">Meeting NQS</option>
                    <option value="working_towards">Working Towards NQS</option>
                    <option value="significant_improvement">Significant Improvement Required</option>
                  </select>
                </div>
                <div>
                  <label style={lbl2}>Timezone</label>
                  <select style={inp2} value={svc.timezone||"Australia/Sydney"} onChange={e=>setSvc(s=>({...s,timezone:e.target.value}))}>
                    {["Australia/Sydney","Australia/Melbourne","Australia/Brisbane","Australia/Perth","Australia/Adelaide","Australia/Darwin","Australia/Hobart","Pacific/Auckland"].map(tz=><option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI PROVIDERS TAB ── */}
      {stab==="ai" && (
        <div>
          {/* Usage summary */}
          {usage?.totals && (
            <div style={{...cardStyle,background:`linear-gradient(135deg,${lp2},#EEF6F0)`,display:"flex",gap:20,flexWrap:"wrap"}}>
              <div><div style={{fontSize:11,color:"#8A7F96"}}>30-day spend</div><div style={{fontSize:20,fontWeight:800,color:purple2}}>${((usage.totals.cost||0)/100).toFixed(3)}</div></div>
              <div><div style={{fontSize:11,color:"#8A7F96"}}>Total tokens</div><div style={{fontSize:18,fontWeight:700}}>{((usage.totals.tokens||0)/1000).toFixed(1)}k</div></div>
              <div><div style={{fontSize:11,color:"#8A7F96"}}>Requests</div><div style={{fontSize:18,fontWeight:700}}>{usage.totals.requests||0}</div></div>
              {usage.by_feature?.slice(0,3).map((f,i)=>(
                <div key={i}><div style={{fontSize:11,color:"#8A7F96"}}>{f.feature}</div><div style={{fontSize:14,fontWeight:700}}>${((f.total_cost||0)/100).toFixed(3)}</div></div>
              ))}
            </div>
          )}

          {/* Provider cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14,marginBottom:14}}>
            {Object.entries(catalogue).map(([key,cat])=>{
              const configured = providers.find(p=>p.provider===key);
              const tr = testResult[key];
              const isTesting = testing===key;
              return (
                <div key={key} style={{...cardStyle,border:`2px solid ${configured?purple2+"40":"#EDE8F4"}`,background:configured?"#FDFBFF":"#FAFAFA"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:24}}>{cat.icon}</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:800,color:"#3D3248"}}>{cat.name}</div>
                        <div style={{fontSize:10,color:"#9A8FB0"}}>{configured?.default_model||cat.default_model}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:5,alignItems:"center"}}>
                      {configured?.is_default===1&&<span style={{fontSize:9,background:"#FFF3CD",color:"#856404",padding:"2px 6px",borderRadius:6,fontWeight:700}}>DEFAULT</span>}
                      {configured&&<span style={{fontSize:9,background:"#D4EDDA",color:"#155724",padding:"2px 6px",borderRadius:6,fontWeight:700}}>✓ CONFIGURED</span>}
                    </div>
                  </div>

                  {/* Models list with cost */}
                  <div style={{marginBottom:10}}>
                    {cat.models.map(m=>(
                      <div key={m.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",borderBottom:"1px solid #F5F0F8"}}>
                        <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:(tierColors[m.tier]||"#888")+"18",color:tierColors[m.tier]||"#888",fontWeight:700,flexShrink:0}}>{m.tier}</span>
                        <span style={{fontSize:10,flex:1,fontWeight:configured?.default_model===m.id?700:400}}>{m.label}</span>
                        {m.in===0?<span style={{fontSize:9,color:"#2E7D32",fontWeight:700}}>FREE</span>:(
                          <span style={{fontSize:9,color:"#6B5F7A",fontFamily:"monospace"}}>in ${m.in}/1k · out ${m.out}/1k</span>
                        )}
                        {configured?.default_model===m.id&&<span style={{fontSize:8,color:purple2,fontWeight:700}}>ACTIVE</span>}
                      </div>
                    ))}
                  </div>

                  {/* Test result */}
                  {tr&&(
                    <div style={{padding:"4px 8px",borderRadius:6,background:tr.ok?"#D4EDDA":"#F8D7DA",color:tr.ok?"#155724":"#721C24",fontSize:10,marginBottom:8,fontWeight:600}}>
                      {tr.msg}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button onClick={()=>setEditProv({...(configured||{}),provider:key,cat})}
                      style={{padding:"5px 12px",borderRadius:7,border:"none",background:purple2,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                      {configured?"Edit":"Configure"}
                    </button>
                    {configured&&(
                      <>
                        <button onClick={()=>testProvider(key)} disabled={isTesting}
                          style={{padding:"5px 12px",borderRadius:7,border:`1px solid ${purple2}40`,background:lp2,color:purple2,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                          {isTesting?"Testing…":"Test Connection"}
                        </button>
                        <button onClick={()=>deleteProvider(key)}
                          style={{padding:"5px 8px",borderRadius:7,border:"1px solid #F5C6CB",background:"#FFF5F5",color:"#C0392B",fontSize:10,cursor:"pointer"}}>
                          Remove
                        </button>
                      </>
                    )}
                    <a href={cat.website} target="_blank" rel="noopener" style={{padding:"5px 8px",borderRadius:7,fontSize:10,color:"#6B5F7A",textDecoration:"none",background:"#F5F0F8",fontWeight:600}}>
                      Get Key ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Usage by feature table */}
          {usage?.by_feature?.length>0&&(
            <div style={cardStyle}>
              <h4 style={{margin:"0 0 12px",fontSize:13,fontWeight:700}}>Usage by Feature (30 days)</h4>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{borderBottom:"2px solid #EDE8F4"}}>{["Feature","Model","Requests","Tokens In","Tokens Out","Cost","Avg ms"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 8px",color:"#8A7F96",fontWeight:700}}>{h}</th>)}</tr></thead>
                <tbody>
                  {usage.by_feature.map((f,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #F0EBF8"}}>
                      <td style={{padding:"6px 8px",fontWeight:600}}>{f.feature}</td>
                      <td style={{padding:"6px 8px",color:"#6B5F7A",fontFamily:"monospace",fontSize:10}}>{f.model}</td>
                      <td style={{padding:"6px 8px"}}>{f.requests}</td>
                      <td style={{padding:"6px 8px"}}>{f.total_in?.toLocaleString()}</td>
                      <td style={{padding:"6px 8px"}}>{f.total_out?.toLocaleString()}</td>
                      <td style={{padding:"6px 8px",fontWeight:700,color:f.total_cost>0?purple2:"#2E7D32"}}>${((f.total_cost||0)/100).toFixed(4)}</td>
                      <td style={{padding:"6px 8px",color:"#8A7F96"}}>{f.avg_latency?Math.round(f.avg_latency):"—"}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CREDENTIALS TAB ── */}
      {stab==="credentials" && (
        <CredentialsTab tenantId={auth?.currentTenant?.id} API2={API2} />
      )}

      {/* ── REGULATORY TAB ── */}
      {stab==="regulatory" && (
        <JurisdictionPanel API2={API2} />
      )}

      {/* ── MFA TAB ── */}
      {stab==="mfa" && (
        <div>
          <div style={cardStyle}>
            <MfaSettingsPanel />
          </div>
        </div>
      )}

      {stab==="data" && (
        <div>
          <div style={cardStyle}>
            <h3 style={{margin:"0 0 4px",fontSize:14,fontWeight:700}}>🔧 Demo Data Management</h3>
            <p style={{margin:"0 0 16px",fontSize:12,color:"#A89DB5"}}>Reset the database with comprehensive demo data: 9 rooms, 96 children, 15 educators, medical plans, rosters, attendance history, and more.</p>
            <DataManagementPanel />
          </div>
        </div>
      )}

      {/* ── INTEGRATIONS (legacy placeholder — replaced by Credentials) ── */}
      {stab==="integrations_DISABLED" && (
        <div>
          <div style={cardStyle}>
            <h3 style={{margin:"0 0 4px",fontSize:14,fontWeight:700}}>🤖 AI Document Analysis</h3>
            <p style={{margin:"0 0 16px",fontSize:12,color:"#A89DB5"}}>Used to automatically classify and extract data from uploaded educator documents (certifications, qualifications, etc.)</p>
            <div style={{marginBottom:14}}>
              <label style={{...lbl2,display:"block",marginBottom:6}}>Anthropic API Key</label>
              <div style={{display:"flex",gap:8}}>
                <input type="password" placeholder="sk-ant-..." defaultValue={localStorage.getItem("c360_anthropic_key")||""}
                  id="anthropic-key-input"
                  style={{...inp2,flex:1,fontFamily:"monospace"}} />
                <button onClick={()=>{
                  const val=document.getElementById("anthropic-key-input").value.trim();
                  if(val){localStorage.setItem("c360_anthropic_key",val);window.showToast&&window.showToast("Anthropic key saved");}
                  else{localStorage.removeItem("c360_anthropic_key");window.showToast&&window.showToast("Anthropic key cleared","warning");}
                }} style={{padding:"8px 18px",background:purple2,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>
                  Save Key
                </button>
              </div>
              {localStorage.getItem("c360_anthropic_key") && (
                <div style={{marginTop:6,fontSize:11,color:"#6BA38B"}}>✓ Key is set — AI document analysis is enabled</div>
              )}
              <div style={{marginTop:8,fontSize:11,color:"#A89DB5",lineHeight:1.5}}>
                The key is stored in your browser only and never sent to our servers. Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:purple2}}>console.anthropic.com</a>
              </div>
            </div>
          </div>
          <div style={{...cardStyle,border:"2px solid #B71C1C22",background:"#FFFBFB"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <div style={{width:40,height:40,borderRadius:10,background:"#002B7F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🇦🇺</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:14,color:"#1a1a1a"}}>ACECQA — National Early Childhood Worker Register</div>
                <div style={{fontSize:11,color:"#B71C1C",fontWeight:600,marginTop:2}}>⚠ Mandatory from 27 Feb 2026 · Deadline: Late March 2026</div>
              </div>
              <span style={{fontSize:11,fontWeight:700,color:"#2E7D32",background:"#E8F5E9",padding:"4px 12px",borderRadius:20,border:"1px solid #A5D6A7"}}>Active</span>
            </div>
            <p style={{margin:"0 0 14px",fontSize:12,color:"#555",lineHeight:1.6}}>
              Under the <strong>Early Childhood Legislation (Child Safety) Amendment Act 2025</strong>, all approved NQF providers must enter and maintain educator workforce information in the national register. The register records identity, qualifications, safety checks and teaching registration.
            </p>
            <div style={{background:"#FFF9E6",border:"1px solid #FFE082",borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#795548"}}>
              ℹ️ Go to <strong>Educators</strong> to manage NECWR registration status for each staff member.
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{window.dispatchEvent(new CustomEvent("c360-navigate",{detail:{tab:"educators",action:"necwr"}}));}}
                style={{padding:"9px 18px",background:"#002B7F",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
                Open NECWR Dashboard →
              </button>
              <a href="https://www.acecqa.gov.au" target="_blank" rel="noreferrer"
                style={{padding:"9px 18px",background:"#F8F5FC",color:"#5C4E6A",border:"1px solid #DDD6EE",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:13,textDecoration:"none",display:"inline-flex",alignItems:"center"}}>
                ACECQA Website ↗
              </a>
            </div>
          </div>
          <div style={cardStyle}>
            <h3 style={{margin:"0 0 10px",fontSize:14,fontWeight:700}}>🏛️ National Educator Register</h3>
            <div style={{background:"#F0FFF4",border:"1px solid #A7F3D0",borderRadius:10,padding:"12px 16px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#065F46",marginBottom:4}}>🆕 New Australian Government Initiative</div>
              <div style={{fontSize:12,color:"#047857",lineHeight:1.6}}>The National Educator Register enables real-time verification of educator qualifications, WWCC status, and compliance. Integration is in development — API access will be available once the register goes live.</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#8A7F96",display:"block",marginBottom:4,textTransform:"uppercase"}}>Register API Endpoint</label>
                <input type="text" placeholder="https://api.educatorregister.gov.au/v1" style={{padding:"8px 12px",borderRadius:8,border:"1px solid #D9D0C7",fontSize:12,width:"100%",boxSizing:"border-box"}} readOnly/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#8A7F96",display:"block",marginBottom:4,textTransform:"uppercase"}}>API Key</label>
                <input type="password" placeholder="Provided by ACECQA / DoE" style={{padding:"8px 12px",borderRadius:8,border:"1px solid #D9D0C7",fontSize:12,width:"100%",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:11,color:"#92400E"}}>
              ⚠️ The National Educator Register API is not yet publicly available. This field will be activated once ACECQA publishes the integration specification.
            </div>
            <h3 style={{margin:"0 0 16px",fontSize:14,fontWeight:700}}>🔌 External Integrations</h3>
            {[
              {name:"Xero", icon:"💚", desc:"Export payroll and invoices to Xero accounting", status:"Coming soon"},
              {name:"MYOB", icon:"🔵", desc:"Sync payroll data with MYOB AccountRight", status:"Coming soon"},
              {name:"Employment Hero", icon:"🦸", desc:"Sync employee records and payroll", status:"Coming soon"},
              {name:"myGovID / ATO", icon:"🇦🇺", desc:"SuperStream reporting and STP payroll", status:"Coming soon"},
              {name:"Xplor", icon:"📱", desc:"Parent booking and kiosk integration", status:"Coming soon"},
              {name:"National Educator Register", icon:"🏛️", desc:"Verify educator qualifications and compliance status against the Australian national register", status:"In Development"},
              {name:"ACECQA", icon:"🎓", desc:"Sync NQF ratings, service approvals and quality area assessments", status:"Planned"},
            ].map(item => (
              <div key={item.name} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:"1px solid #F0EBE6"}}>
                <div style={{width:36,height:36,borderRadius:10,background:"#F8F5FC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{item.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13}}>{item.name}</div>
                  <div style={{fontSize:11,color:"#A89DB5",marginTop:1}}>{item.desc}</div>
                </div>
                <span style={{fontSize:11,color:"#A89DB5",padding:"4px 10px",borderRadius:20,background:"#F5F5F5",fontWeight:600}}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stab==="rostering" && (
        <RosteringSettingsPanel />
      )}
      {stab==="rooms" && (
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700}}>Room Settings</h3>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{window.dispatchEvent(new CustomEvent("c360-navigate",{detail:{tab:"rooms"}}));}} style={{padding:"10px 18px",background:purple2,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>Add Room</button>
            <button onClick={()=>{window.dispatchEvent(new CustomEvent("c360-navigate",{detail:{tab:"rooms"}}));}} style={{padding:"10px 18px",background:lp2,color:purple2,border:"1px solid "+purple2+"30",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:13}}>Age Group Settings</button>
          </div>
        </div>
      )}
      {stab==="notifications" && (
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 16px",fontSize:14,fontWeight:700}}>Notification Preferences</h3>
          {[
            {l:"Ratio breach alerts",d:"Notify when educator-to-child ratios are not met",k:"notify_ratio_breach"},
            {l:"WWCC expiry warnings (30 days)",d:"Alert before Working With Children Checks expire",k:"notify_wwcc_expiry"},
            {l:"Shift reminders",d:"Send reminders to educators before rostered shift",k:"notify_shift_reminders"},
            {l:"Daily compliance report",d:"Auto-generate end-of-day compliance summary",k:"notify_daily_compliance"},
            {l:"Medication expiry alerts",d:"Warn when medications or medical equipment expire",k:"notify_medication_expiry"},
            {l:"Parent absence notifications",d:"Alert when parent submits absence request",k:"notify_parent_absence"},
          ].map(item=>{
            const on = svc?.[item.k]===1||svc?.[item.k]===true;
            return (
              <div key={item.k} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:"1px solid #F0EBE6"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{item.l}</div>
                  <div style={{fontSize:11,color:"#A89DB5"}}>{item.d}</div>
                </div>
                <div onClick={()=>setSvc(s=>({...s,[item.k]:on?0:1}))}
                  style={{width:44,height:24,borderRadius:12,cursor:"pointer",padding:2,background:on?purple2:"#D9D0C7",transition:"background 0.2s",display:"flex",alignItems:"center",justifyContent:on?"flex-end":"flex-start"}}>
                  <div style={{width:20,height:20,borderRadius:10,background:"#fff",transition:"all 0.2s"}}/>
                </div>
              </div>
            );
          })}
          <button onClick={saveSvc} style={{marginTop:14,padding:"8px 20px",borderRadius:8,border:"none",background:purple2,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
            Save Preferences
          </button>
        </div>
      )}

      {/* ── SMTP EMAIL CONFIG ── */}
      {stab==="notifications" && (
        <SmtpConfigPanel svc={svc} setSvc={setSvc} onSave={saveSvc} />
      )}

      {/* ── REGULATIONS TAB ── */}
      {stab==="regs" && (
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 4px",fontSize:14,fontWeight:700}}>NSW NQF Regulatory Reference</h3>
          <p style={{margin:"0 0 16px",fontSize:11,color:"#A89DB5"}}>Education and Care Services National Regulations</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[
              {reg:"Reg 123",title:"Educator-to-child ratios",desc:"0–24m: 1:4 · 24–36m: 1:5 · 36m+: 1:10 · OSHC: 1:15"},
              {reg:"Reg 126",title:"Qualification requirements",desc:"50% of ratio educators must hold Diploma+ qualification"},
              {reg:"Reg 130–135",title:"ECT attendance",desc:"25+ children: 1 ECT · 60+ children: ECT+SQP · 80+ children: 2 ECTs"},
              {reg:"Reg 136",title:"First aid qualifications",desc:"At least one educator with current first aid qualifications at all times"},
              {reg:"Reg 149",title:"Staff records",desc:"Full name, WWCC, qualifications and hours of work for each staff member"},
              {reg:"Reg 168",title:"Education program",desc:"Must implement program based on approved learning framework (EYLF)"},
              {reg:"Reg 183",title:"Incident, injury, trauma",desc:"Must have a policy and records for all incidents, injuries and trauma"},
              {reg:"Sec 165",title:"Adequate supervision",desc:"Children must be adequately supervised at all times"},
            ].map((item,i)=>(
              <div key={i} style={{padding:"14px 16px",borderRadius:10,background:"#F8F5FC",border:"1px solid #EDE8F4"}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,color:purple2,marginBottom:4,fontWeight:700}}>{item.reg}</div>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{item.title}</div>
                <div style={{fontSize:11,color:"#8A7F96",lineHeight:1.5}}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stab==="portals" && (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={cardStyle}>
            <h3 style={{margin:"0 0 8px",fontSize:14,fontWeight:700}}>🚪 Parent Portal</h3>
            <p style={{margin:"0 0 14px",fontSize:12,color:"#8A7F96"}}>
              Parents access their child's updates, invoices, and daily reports via the Parent Portal.
              In production, parents log in directly at your centre's URL — not through this admin view.
            </p>
            <button onClick={()=>window.dispatchEvent(new CustomEvent("c360-navigate",{detail:{tab:"parent"}}))} style={{padding:"10px 18px",background:purple2,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
              Preview Parent Portal
            </button>
          </div>
          <div style={cardStyle}>
            <h3 style={{margin:"0 0 8px",fontSize:14,fontWeight:700}}>👩‍🏫 Staff Portal</h3>
            <p style={{margin:"0 0 14px",fontSize:12,color:"#8A7F96"}}>
              Educators access their roster, shifts, availability, and leave requests via the Staff Portal.
              In production, staff log in directly — not through this admin view.
            </p>
            <button onClick={()=>window.dispatchEvent(new CustomEvent("c360-navigate",{detail:{tab:"staff"}}))} style={{padding:"10px 18px",background:purple2,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
              Preview Staff Portal
            </button>
          </div>
        </div>
      )}
      {stab==="soc2" && (
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 8px",fontSize:14,fontWeight:700}}>🔒 SOC2 Compliance</h3>
          <p style={{margin:"0 0 14px",fontSize:12,color:"#8A7F96"}}>Access the full SOC2 compliance dashboard and audit reports.</p>
          <button onClick={()=>setActiveTab("soc2")} style={{padding:"10px 18px",background:purple2,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13}}>
            Open SOC2 Dashboard
          </button>
        </div>
      )}
      {stab==="data" && (
        <div style={cardStyle}>
          <h3 style={{margin:"0 0 4px",fontSize:14,fontWeight:700}}>Data Management</h3>
          <p style={{margin:"0 0 20px",fontSize:11,color:"#A89DB5"}}>Manage centre data — import, clean up demo content, and reset data.</p>
          {dataMsg && (
            <div style={{padding:"10px 14px",borderRadius:8,marginBottom:16,background:dataMsg.ok?"#E8F5E9":"#FFEBEE",color:dataMsg.ok?"#2E7D32":"#C62828",fontSize:12,fontWeight:600}}>
              {dataMsg.ok ? "✓ " : "✗ "}{dataMsg.text}
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{padding:"16px",borderRadius:10,background:"#FFF8E1",border:"1px solid #FFE082"}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>🗑️ Remove Demo Children</div>
              <div style={{fontSize:11,color:"#8A7F96",marginBottom:12}}>Deletes the original sample children (not from CN rooms). Keeps all imported CN children intact.</div>
              <button disabled={dataWorking} onClick={async()=>{
                if(!(await window.showConfirm('Remove demo children? This keeps all CN-imported children and removes original sample data.'))) return;
                setDataWorking(true); setDataMsg(null);
                try {
                  const r = await API2('/api/children/delete-demo',{method:'DELETE'});
                  if(r.ok) setDataMsg({ok:true,text:r.removed+' demo children removed. '+r.remaining+' children remaining.'});
                  else setDataMsg({ok:false,text:r.error||'Failed'});
                } catch(e){setDataMsg({ok:false,text:e.message});}
                setDataWorking(false);
              }} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#E53935",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",opacity:dataWorking?0.6:1}}>
                {dataWorking?'Working...':'Remove Demo Children'}
              </button>
            </div>
            <div style={{padding:"16px",borderRadius:10,background:"#E8F5E9",border:"1px solid #A5D6A7"}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>👩‍🏫 Import Real Educators</div>
              <div style={{fontSize:11,color:"#8A7F96",marginBottom:12}}>Replaces all demo educators with the 22 real CN educators from the compliance spreadsheet. Includes qualifications, WWCC, first aid, and room assignments.</div>
              <button disabled={dataWorking} onClick={async()=>{
                if(!(await window.showConfirm('This will DELETE all current educators for this centre and replace with the 22 real CN educators from the compliance spreadsheet. Continue?'))) return;
                setDataWorking(true); setDataMsg(null);
                try {
                  const r = await fetch('/run-seed-educators?token=childcare360seed');
                  const d = await r.json();
                  if(d.ok) { setDataMsg({ok:true,text:`✓ ${d.educators_inserted} real educators imported successfully.`}); setLiveEducatorCount(d.educators_inserted); }
                  else setDataMsg({ok:false,text:d.error||'Failed'});
                } catch(e){setDataMsg({ok:false,text:e.message});}
                setDataWorking(false);
              }} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#2E7D32",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",opacity:dataWorking?0.6:1}}>
                {dataWorking?'Working...':'Import Real Educators'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT PROVIDER MODAL ── */}
      {editProv&&(
        <div style={{position:"fixed",inset:0,background:"rgba(60,45,70,0.45)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
          <div style={{background:"#fff",borderRadius:18,padding:28,width:520,maxHeight:"88vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(80,60,90,0.18)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div>
                <div style={{fontSize:16,fontWeight:800}}>{editProv.cat?.icon} Configure {editProv.cat?.name}</div>
                <a href={editProv.cat?.website} target="_blank" rel="noopener" style={{fontSize:11,color:purple2}}>Get API key at {editProv.cat?.website} ↗</a>
              </div>
              <button onClick={()=>setEditProv(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#888"}}>×</button>
            </div>

            <ProviderEditForm key={editProv.provider} prov={editProv} onSave={saveProvider} onCancel={()=>setEditProv(null)}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── JURISDICTION PANEL — regulatory settings (country/state/places) ─────────
function JurisdictionPanel({ API2 }) {
  const [j, setJ] = useState(null);
  const [rules, setRules] = useState([]);
  const [ectReq, setEctReq] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const purple2 = "#8B6DAF", lp2 = "#F0EBF8";
  const inp = { padding: "8px 12px", borderRadius: 8, border: "1px solid #DDD6EE", fontSize: 12, width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: "#7A6E8A", fontWeight: 700, display: "block", marginBottom: 4 };
  const card = { background: "#fff", borderRadius: 14, border: "1px solid #EDE8F4", padding: "18px 22px", marginBottom: 14 };

  const reload = async () => {
    try {
      const jdata = await API2("/api/compliance/jurisdiction");
      if (jdata && !jdata.error) setJ(jdata);
      const rdata = await API2("/api/compliance/rules");
      if (rdata?.rules) setRules(rdata.rules);
      const e = await API2("/api/compliance/ect-requirement");
      if (e && !e.error) setEctReq(e);
    } catch(err) {}
  };
  useEffect(() => { reload(); }, []);

  if (!j) return <div style={{ padding: 24, color: "#8A7F96" }}>Loading regulatory settings…</div>;

  const set = (k, v) => setJ(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await API2("/api/compliance/jurisdiction", { method: "PUT", body: {
        country: j.country, state: j.state || null,
        service_type: j.service_type, approved_places: parseInt(j.approved_places) || 0,
        operating_hours_per_week: parseInt(j.operating_hours_per_week) || 50,
        is_remote_area: !!j.is_remote_area,
      }});
      if (r?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        reload();
      } else if (window.showToast) window.showToast(r?.error || "Save failed", "error");
    } catch(e) {
      if (window.showToast) window.showToast("Save failed: " + e.message, "error");
    }
    setSaving(false);
  };

  const isAU = j.country === "AU";
  const AU_STATES = [["NSW","New South Wales"],["VIC","Victoria"],["QLD","Queensland"],["SA","South Australia"],["WA","Western Australia"],["TAS","Tasmania"],["ACT","Australian Capital Territory"],["NT","Northern Territory"]];

  // Group rules for display
  const ratioRules = rules.filter(r => r.rule_type === "ratio");
  const ectRules   = rules.filter(r => r.rule_type === "ect");
  const qualRules  = rules.filter(r => r.rule_type === "qualification_mix");
  const prRules    = rules.filter(r => r.rule_type === "person_responsible");
  const faRules    = rules.filter(r => r.rule_type === "first_aid");

  return (
    <div>
      {/* Form */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#3D3248" }}>📜 Regulatory Settings</h3>
          {saved && <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>✓ Saved</span>}
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#A89DB5" }}>
          These settings drive the NQF / NZ MoE compliance engine — ratios, ECT thresholds, and qualification mix.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Country</label>
            <select value={j.country || "AU"} onChange={e => set("country", e.target.value)} style={inp}>
              <option value="AU">🇦🇺 Australia</option>
              <option value="NZ">🇳🇿 New Zealand</option>
            </select>
          </div>
          {isAU && (
            <div>
              <label style={lbl}>State / Territory</label>
              <select value={j.state || ""} onChange={e => set("state", e.target.value || null)} style={inp}>
                <option value="">— National defaults —</option>
                {AU_STATES.map(([id, name]) => <option key={id} value={id}>{id} — {name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={lbl}>Service Type</label>
            <select value={j.service_type || "LDC"} onChange={e => set("service_type", e.target.value)} style={inp}>
              <option value="LDC">Long Day Care</option>
              <option value="PRESCHOOL">Preschool / Kindergarten</option>
              <option value="OSHC">Outside School Hours Care</option>
              <option value="FDC">Family Day Care</option>
              {!isAU && <option value="PLAYCENTRE">Playcentre (NZ)</option>}
              {!isAU && <option value="KOHANGA_REO">Kohanga Reo (NZ)</option>}
            </select>
          </div>
          <div>
            <label style={lbl}>Approved Places</label>
            <input type="number" value={j.approved_places || 0} onChange={e => set("approved_places", e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Operating Hours per Week</label>
            <input type="number" value={j.operating_hours_per_week || 50} onChange={e => set("operating_hours_per_week", e.target.value)} style={inp} />
          </div>
          {isAU && (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", margin: 0 }}>
                <input type="checkbox" checked={!!j.is_remote_area} onChange={e => set("is_remote_area", e.target.checked)} />
                Remote / very remote area
              </label>
            </div>
          )}
        </div>

        <button onClick={save} disabled={saving}
          style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: saving ? "#C4B5D9" : purple2,
                   color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontSize: 13 }}>
          {saving ? "Saving…" : "Save Regulatory Settings"}
        </button>
      </div>

      {/* Applicable rules summary */}
      <div style={card}>
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#3D3248" }}>
          📋 Rules currently in force for {j.country}{j.state ? ` · ${j.state}` : ""}
        </h4>

        {ratioRules.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: purple2, marginBottom: 6, textTransform: "uppercase" }}>Ratios (service-wide)</div>
            {ratioRules.map(r => (
              <div key={r.id} style={{ fontSize: 12, color: "#5C4E6A", padding: "4px 0", borderBottom: "1px solid #F8F5FC" }}>
                <strong>{r.age_group}:</strong> 1:{r.ratio_children}
                {r.state && <span style={{ color: purple2, marginLeft: 6 }}>({r.state} specific)</span>}
                <div style={{ fontSize: 10, color: "#A89DB5", marginTop: 1 }}>{r.notes}</div>
              </div>
            ))}
          </div>
        )}

        {ectRules.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: purple2, marginBottom: 6, textTransform: "uppercase" }}>ECT thresholds</div>
            {ectRules.map(r => (
              <div key={r.id} style={{ fontSize: 12, color: "#5C4E6A", padding: "4px 0", borderBottom: "1px solid #F8F5FC" }}>
                <strong>{r.children_min}–{r.children_max === 9999 ? "∞" : r.children_max} children:</strong> {r.ect_requirement?.replace(/_/g," ")}
                <div style={{ fontSize: 10, color: "#A89DB5", marginTop: 1 }}>{r.notes}</div>
              </div>
            ))}
          </div>
        )}

        {prRules.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: purple2, marginBottom: 6, textTransform: "uppercase" }}>Person Responsible (NZ)</div>
            {prRules.map(r => (
              <div key={r.id} style={{ fontSize: 12, color: "#5C4E6A" }}>{r.notes}</div>
            ))}
          </div>
        )}

        {faRules.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: purple2, marginBottom: 6, textTransform: "uppercase" }}>First aid (NZ)</div>
            {faRules.map(r => (
              <div key={r.id} style={{ fontSize: 12, color: "#5C4E6A" }}>{r.notes}</div>
            ))}
          </div>
        )}

        {qualRules.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: purple2, marginBottom: 6, textTransform: "uppercase" }}>Qualification mix</div>
            {qualRules.map(r => (
              <div key={r.id} style={{ fontSize: 12, color: "#5C4E6A" }}>{r.notes}</div>
            ))}
          </div>
        )}
      </div>

      {/* Live ECT requirement */}
      {ectReq && (
        <div style={{ ...card, background: "#F8F5FC", border: `1px solid ${purple2}40` }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: purple2 }}>
            🎓 Current ECT requirement for your enrolled population
          </h4>
          <div style={{ fontSize: 13, color: "#3D3248", marginBottom: 6 }}>
            <strong>{ectReq.children}</strong> active enrolled children →{" "}
            <strong>
              {ectReq.country === "NZ"
                ? `${ectReq.required_persons_responsible} Person(s) Responsible`
                : `${ectReq.required_ect_count} ECT(s) required`}
            </strong>
          </div>
          <div style={{ fontSize: 11, color: "#7A6E8A" }}>{ectReq.notes}</div>
        </div>
      )}
    </div>
  );
}

function ProviderEditForm({ prov, onSave, onCancel }) {
  const cat = prov.cat || {};
  const [form, setForm] = useState({
    provider: prov.provider, label: prov.label||cat.name||prov.provider,
    api_key: prov.has_key?"":prov.api_key||"",
    base_url: prov.base_url||"", default_model: prov.default_model||cat.default_model||"",
    enabled: prov.enabled!==0, is_default: prov.is_default===1,
    monthly_budget: prov.monthly_budget_cents ? (prov.monthly_budget_cents/100) : "",
  });
  const purple3="#8B6DAF",lp3="#F0EBF8";
  const inp3={padding:"8px 12px",borderRadius:8,border:"1px solid #DDD6EE",fontSize:12,width:"100%",boxSizing:"border-box"};
  const lbl3={fontSize:11,color:"#7A6E8A",fontWeight:700,display:"block",marginBottom:4};
  const tierColors2={flagship:"#7E5BA3",balanced:"#4A8A7B",fast:"#D4A26A",economy:"#888",reasoning:"#C9829E",powerful:"#5B8DB5",local:"#6BA38B"};

  return (
    <div>
      <div style={{marginBottom:12}}>
        <label style={lbl3}>{cat.key_label||"API Key"}</label>
        <input type="password" style={inp3} value={form.api_key} onChange={e=>setForm(f=>({...f,api_key:e.target.value}))}
          placeholder={prov.has_key?"Leave blank to keep existing key":cat.key_placeholder||"Enter API key"}/>
        {prov.has_key&&<div style={{fontSize:10,color:"#6BA38B",marginTop:3}}>✓ Key already set (ending ••••{prov.api_key?.slice(-4)||""})</div>}
      </div>

      {prov.provider==="ollama"&&(
        <div style={{marginBottom:12}}>
          <label style={lbl3}>Base URL</label>
          <input style={inp3} value={form.base_url} onChange={e=>setForm(f=>({...f,base_url:e.target.value}))} placeholder="http://localhost:11434"/>
        </div>
      )}

      <div style={{marginBottom:12}}>
        <label style={lbl3}>Default Model</label>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {(cat.models||[]).map(m=>(
            <label key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,border:`2px solid ${form.default_model===m.id?purple3:"#EDE8F4"}`,cursor:"pointer",background:form.default_model===m.id?lp3:"#fff"}}>
              <input type="radio" name="model" value={m.id} checked={form.default_model===m.id} onChange={()=>setForm(f=>({...f,default_model:m.id}))} style={{accentColor:purple3}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700}}>{m.label}</div>
                <div style={{fontSize:10,color:"#9A8FB0"}}>Context: {(m.ctx/1000).toFixed(0)}k tokens</div>
              </div>
              <span style={{fontSize:9,padding:"2px 6px",borderRadius:5,background:(tierColors2[m.tier]||"#888")+"14",color:tierColors2[m.tier]||"#888",fontWeight:700}}>{m.tier}</span>
              {m.in===0?<span style={{fontSize:10,color:"#2E7D32",fontWeight:700}}>FREE</span>:(
                <span style={{fontSize:9,color:"#888",fontFamily:"monospace"}}>${m.in}/1k in · ${m.out}/1k out</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div>
          <label style={lbl3}>Monthly Budget (AUD)</label>
          <input type="number" style={inp3} value={form.monthly_budget} onChange={e=>setForm(f=>({...f,monthly_budget:e.target.value}))} placeholder="e.g. 20 (no limit = leave blank)"/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,paddingTop:18}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}>
            <input type="checkbox" checked={form.enabled} onChange={e=>setForm(f=>({...f,enabled:e.target.checked}))} style={{accentColor:purple3}}/>
            <span style={{fontWeight:600}}>Enabled</span>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}>
            <input type="checkbox" checked={form.is_default} onChange={e=>setForm(f=>({...f,is_default:e.target.checked}))} style={{accentColor:purple3}}/>
            <span style={{fontWeight:600}}>Set as default provider</span>
          </label>
        </div>
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>onSave(form)} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:purple3,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Save Provider</button>
        <button onClick={onCancel} style={{padding:"10px 16px",borderRadius:8,border:`1px solid ${purple3}40`,background:lp3,color:purple3,fontWeight:600,fontSize:13,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );
}

// ─── EDUCATOR MODAL ────────────────────────────────────────────────────────────
function EducatorModal({ educator, onSave, onClose }) {
  const [form, setForm] = useState(educator || {
    name: "", qualification: "cert3", firstAid: false, phone: "", email: "",
    isUnder18: false, active: true, wwcc: "", wwccExpiry: "",
  });

  const update = (field, value) => setForm({ ...form, [field]: value });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(60,45,70,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)", animation: "fadeIn 0.2s ease-out" }}>
      <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E8E0D8", width: 520, maxHeight: "85vh", overflowY: "auto", padding: 28, boxShadow: "0 20px 60px rgba(80,60,90,0.12)", animation: "scaleIn 0.3s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{educator ? "Edit Educator" : "Add Educator"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><Icon name="close" size={20} color="#A89DB5" /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Full Name</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} style={inputStyle} placeholder="Enter full name" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={form.email} onChange={(e) => update("email", e.target.value)} style={inputStyle} placeholder="email@example.com" />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={form.phone} onChange={(e) => update("phone", e.target.value)} style={inputStyle} placeholder="0412 345 678" />
          </div>
          <div>
            <label style={labelStyle}>Qualification</label>
            <select value={form.qualification} onChange={(e) => update("qualification", e.target.value)} style={selectStyle}>
              {QUALIFICATION_LEVELS.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>WWCC Number</label>
            <input value={form.wwcc} onChange={(e) => update("wwcc", e.target.value)} style={inputStyle} placeholder="WWC0012345" />
          </div>
          <div>
            <label style={labelStyle}>WWCC Expiry</label>
            <input type="date" value={form.wwccExpiry} onChange={(e) => update("wwccExpiry", e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ ...labelStyle, margin: 0 }}>First Aid</label>
            <input type="checkbox" checked={form.firstAid} onChange={(e) => update("firstAid", e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ ...labelStyle, margin: 0 }}>Under 18</label>
            <input type="checkbox" checked={form.isUnder18} onChange={(e) => update("isUnder18", e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
          </div>
        </div>

        {form.isUnder18 && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(212,162,106,0.08)", border: "1px solid rgba(212,162,106,0.12)", fontSize: 11, color: "#D4A26A" }}>
            ⚠ Under-18 educators can be included in ratios but must be supervised by an educator over 18 at all times.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={() => onSave(form)} style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}>
            {educator ? "Save Changes" : "Add Educator"}
          </button>
          <button onClick={onClose} style={{ ...btnSecondary, flex: 0.5, textAlign: "center" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── ROOM MODAL ────────────────────────────────────────────────────────────────
function RoomModal({ room, onSave, onClose }) {
  const [form, setForm] = useState(room || { name: "", ageGroup: "preschool", capacity: 20, description: "" });
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setForm({ ...form, [field]: value });

  const handleSave = async () => {
    try {
    if (!form.name?.trim()) { window.showToast("Room name is required", 'error'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
    } catch(e) { console.error('API error:', e); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(60,45,70,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)", animation: "fadeIn 0.2s ease-out" }}>
      <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E8E0D8", width: 460, padding: 28, boxShadow: "0 20px 60px rgba(80,60,90,0.12)", animation: "scaleIn 0.3s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{room ? "Edit Room" : "Add Room"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><Icon name="close" size={20} color="#A89DB5" /></button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Room Name</label>
              <input value={form.name} onChange={(e) => update("name", e.target.value)} style={inputStyle} placeholder="e.g. Joeys Room" />
            </div>
            <div>
              <label style={labelStyle}>Age Group</label>
              <select value={form.ageGroup||form.age_group} onChange={(e) => update("ageGroup", e.target.value)} style={selectStyle}>
                {AGE_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label} — {g.sub} (1:{g.ratio})</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Capacity</label>
              <input type="number" min="1" max="200" value={form.capacity} onChange={(e) => update("capacity", parseInt(e.target.value) || 20)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Description (optional)</label>
              <input value={form.description||""} onChange={(e) => update("description", e.target.value)} style={inputStyle} placeholder="e.g. Main Babies Room — Building A" />
            </div>
          </div>
          {/* Age group info card */}
          {(() => { const g = AGE_GROUPS.find(x=>x.id===(form.ageGroup||form.age_group)); if(!g) return null; return (
            <div style={{ background: g.color+"10", border: `1px solid ${g.color}30`, borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: g.color }}>{g.label} — {g.sub}</div>
              <div style={{ color: "#5C4E6A", marginTop: 4 }}>NSW NQF ratio: 1 educator to {g.ratio} children · For {form.capacity||20} children: <strong>{Math.ceil((form.capacity||20)/g.ratio)} educators required</strong></div>
            </div>
          ); })()}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}>{saving ? "Saving…" : room ? "Save Changes" : "Add Room"}</button>
          <button onClick={onClose} style={{ ...btnSecondary, flex: 0.5, textAlign: "center" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
