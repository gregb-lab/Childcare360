# v2.4.1 Bug Fix Notes

## Files Changed
- `server/db.js`
- `server/retell.js`
- `scripts/release-agent.js`

## Fixes Applied

### server/db.js

**[CRITICAL] Broken childrenAlterCols for-loop brace (line 31)**
The loop over `childrenAlterCols` was never closed. The missing `}` caused the
entire block of subsequent migration code (`rosterAlterCols`, `educatorFlexCols`,
`roster_periods` ALTER, `CREATE TABLE roster_templates`) to execute ONCE PER
child column — 16 times per server start. Fixed by adding the closing brace.

**[CRITICAL] `roster_entries` missing `updated_at` column**
The CREATE TABLE schema had no `updated_at` column. `retell.js` issues:
  `UPDATE roster_entries SET status='unfilled', notes='...', updated_at=datetime('now')`
on every sick call, causing a SQLite error and silently aborting the sick-cover
workflow. Fixed in both CREATE TABLE (fresh installs) and `rosterAlterCols`
migration list (existing DBs).

**[COSMETIC] Stray orphan `;` after db.exec block**
Removed bare `;` on its own line.

### server/retell.js

**[CRITICAL] `getBase()` returns empty string for local dev**
When neither RAILWAY_PUBLIC_DOMAIN nor PUBLIC_URL is set, `getBase()` returned ''.
Agent creation then produces `ws:///api/retell/ws/tenant-id` — an invalid URL
that Retell rejects. Fixed with `http://localhost:${PORT}` fallback.

**[CRITICAL] `/llm-url` endpoint returns nonexistent path**
Returned `/api/retell/webhook/llm/:tenantId` which is not a real route.
Fixed to return the actual WebSocket path `/api/retell/ws/:tenantId`.

**[CRITICAL] `fmtTime(t)` crashes on null/undefined**
`start_time`/`end_time` from DB can be null. Unguarded `.split(':')` throws
TypeError. Added null/type guard returning `'?'` instead.

**[MEDIUM] Qualification filter passes educators with unrecognised quals**
`qualOrder.indexOf(c.qualification)` returns -1 for unknown values, and
`-1 <= reqQualIdx` is always true — unqualified educators passed the filter.
Fixed by requiring `idx >= 0 && idx <= reqQualIdx`.

**[MEDIUM] `meta.sickDetected` dead-code flow**
When an unidentified caller reported sick and was asked for their name, the
`meta.sickDetected = true` flag was set but never read. On the next turn,
the call fell through to the generic `askClaude` path with no context.
Resurrected by adding a `meta.sickDetected && !meta.educatorId` branch that
searches educators by name and continues the sick-call flow.

**[MEDIUM] `meta.educatorName` renders as literal "null" in voice**
Template literals with `meta.educatorName` (which can be null) produce the
spoken word "null". Fixed with `meta.educatorName || 'there'` guards.

### scripts/release-agent.js

**[MEDIUM] tar missing ./dist, ./.git, ./*.tar.gz exclusions**
Every release packaged the built frontend (dist/), git history (.git/), and
any previously generated tarballs in the project root — causing ever-growing
archives. Added the three missing `--exclude` flags.

**[LOW] App.jsx version replace could hit comments/imports first**
`app.replace(/v\d+\.\d+\.\d+/, ...)` replaces the first version match in the
file. If a comment or import appears before the sidebar version label, the wrong
string gets updated. Fixed with targeted sidebar pattern matching with plain
regex fallback.

## Deploy
DB reset required (roster_entries schema change).
```bash
kill -9 $(lsof -t -i:3003) 2>/dev/null
cd ~/childcare360-app
tar xf /media/sf_VM_Shared_Folder/childcare360-v2.4.1-202603211200.tar.gz --strip-components=1
rm -f data/childcare360.db
npm install
npx vite build
nohup node server/index.js > childcare360.log 2>&1 &
sleep 3 && curl -s http://localhost:3003/health
```
