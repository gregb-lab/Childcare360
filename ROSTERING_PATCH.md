# RosteringModule.jsx — Grid date bug patch
# Apply these two search/replace fixes to src/RosteringModule.jsx

## Bug A — Period date snapping (root cause of missing Monday + wrong end date)

When the user picks a start date for a "Weekly" period, the code should snap to
that week's Monday and set end = Monday + 4 (Friday). Currently it uses the raw
picked date, so picking Sunday 22 Mar produces period 22→26 (Sun→Thu) instead
of 23→27 (Mon→Fri).

### Search for this pattern (the Generate / date change handler):
```
setStartDate(val)
```
or wherever startDate/endDate are set together when period_type is 'weekly'.

### Replace the date-setting logic with:
```js
// When period_type is 'weekly', always snap to Mon→Fri of the selected week
const snapWeeklyDates = (rawDate) => {
  const d = new Date(rawDate + 'T12:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  // Move to Monday of this week (Sunday counts as previous week's end → go to next Mon)
  const daysToMon = day === 0 ? 1 : day === 6 ? 2 : -(day - 1);
  const mon = new Date(d);
  mon.setDate(d.getDate() + daysToMon);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return {
    start: mon.toISOString().split('T')[0],
    end:   fri.toISOString().split('T')[0],
  };
};
```

Then call `snapWeeklyDates` whenever startDate changes and period_type === 'weekly':
```js
const handleStartDateChange = (val) => {
  if (periodType === 'weekly') {
    const { start, end } = snapWeeklyDates(val);
    setStartDate(start);
    setEndDate(end);
  } else {
    setStartDate(val);
  }
};
```

---

## Bug B — Grid day tab generation (skips weekend days in range)

The grid generates tabs by iterating start→end and filtering `day !== 0 && day !== 6`.
This is correct for Mon–Fri weeks, but if the stored period has a weekend boundary day
it silently disappears from the tab bar.

### Search for something like:
```js
const days = [];
let cur = new Date(period.start_date + 'T12:00:00');
const endD = new Date(period.end_date + 'T12:00:00');
while (cur <= endD) {
  if (cur.getDay() !== 0 && cur.getDay() !== 6) days.push(...)
  cur.setDate(cur.getDate() + 1);
}
```

### Replace with (show all days that are within the period, don't filter weekends):
```js
const days = [];
let cur = new Date(period.start_date + 'T12:00:00');
const endD = new Date(period.end_date + 'T12:00:00');
while (cur <= endD) {
  days.push(cur.toISOString().split('T')[0]);
  cur.setDate(cur.getDate() + 1);
}
```

Style weekend tabs differently if desired:
```js
// In the tab render:
const isWeekend = new Date(day + 'T12:00:00').getDay() % 6 === 0;
style={{ ...(isWeekend ? { opacity: 0.6, fontStyle: 'italic' } : {}) }}
```

---

## Summary of impact
- With Bug A fixed: picking any date for a Weekly period auto-snaps to Mon→Fri
  of that week. Picking Sun 22 Mar → period becomes Mon 23 → Fri 27. ✓
- With Bug B fixed: any days in the stored period range appear as tabs,
  even if they're weekends (for custom non-standard periods). ✓
- Both fixes together: the user will always see a clean Mon→Fri 5-day grid. ✓
