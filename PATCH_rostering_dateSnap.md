# Patch: server/rostering.js — Snap weekend start dates to Monday

## Bug
When generating a "weekly" period with a start date that falls on a weekend
(Saturday or Sunday), the roster period is stored with the weekend date but
all shifts are generated from Monday onward. This leaves the period showing
a wider range than the shifts, e.g. "22→26 Mar" with shifts only on 23→26.

## Fix — add this function near the top of rostering.js:

```js
// Snap a start date to the nearest Monday if it falls on a weekend.
// For Sunday → next day (Monday). For Saturday → next Monday (+2).
function snapToMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (dow === 0) d.setDate(d.getDate() + 1);       // Sun → Mon
  else if (dow === 6) d.setDate(d.getDate() + 2);  // Sat → Mon
  return d.toISOString().slice(0, 10);
}

// Similarly snap end date to Friday if it falls on a weekend.
function snapToFriday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() - 2);       // Sun → Fri
  else if (dow === 6) d.setDate(d.getDate() - 1);  // Sat → Fri
  return d.toISOString().slice(0, 10);
}
```

## Then in the POST /generate (or equivalent) handler, before creating the period:

```js
// BEFORE creating roster_period, snap dates to weekdays:
let { start_date, end_date, period_type } = req.body;
if (period_type === 'weekly') {
  start_date = snapToMonday(start_date);
  end_date   = snapToFriday(end_date);
}
// Now use the snapped dates for both the roster_period INSERT and shift generation
```

## Frontend — also add a visual warning in RosteringModule.jsx:

```jsx
// Show a warning if user enters a weekend start date
const startDow = new Date(startDate + 'T12:00:00').getDay();
const isWeekendStart = startDow === 0 || startDow === 6;
{isWeekendStart && (
  <div style={{ color: '#B45309', fontSize: 12, marginTop: 4 }}>
    ⚠ Start date is a weekend — will snap to Monday when generating
  </div>
)}
```
