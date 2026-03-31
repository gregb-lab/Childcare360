# LittleSteps — NSW Childcare Rostering & Compliance Platform
## With NQF Learning & Development Module

### Overview
LittleSteps is a comprehensive childcare management platform built for NSW ECEC services.
It combines staff rostering, NQF compliance monitoring, and an AI-guided learning & development
system aligned with EYLF V2.0 and MTOP V2.0.

---

## 🆕 NQF Learning & Development Module

### Children Profiles
- Full developmental profiles for each child
- 8 developmental domains tracked: Language & Literacy, Fine Motor, Gross Motor, Social & Emotional, Cognitive, Creative Expression, Identity & Belonging, Health & Wellbeing
- 5-level skill tracking: Emerging → Developing → Consolidating → Proficient → Extending
- EYLF V2.0 outcome progress mapped per child (all 5 outcomes, 20 sub-outcomes)
- Radar chart visualisation of each child's developmental profile
- Individual learning goals management
- Linked observation history per child

### AI-Guided Daily Planning Wizard (5 Steps)
The planning wizard uses a **Socratic approach** — guiding educators to professional conclusions rather than prescribing what to do.

**Step 1 — Classroom Insights**
- Analyses all children's profiles in the selected room
- Generates domain averages and identifies priority areas
- Shows percentage of children needing support per domain
- Highlights individual children to watch
- Presents reflective prompts for the educator

**Step 2 — Choose Focus Areas**
- Pre-suggests 2 top-priority domains based on data
- Educator confirms or adjusts (can select 1–3 domains)
- Explains *why* each domain was suggested (% needing support)
- Guided reflection: "Why did you choose these areas?"

**Step 3 — Plan Activities**
- Age-appropriate activity suggestions from built-in activity bank
- Grouped by domain and age group (babies/toddlers/preschool)
- Educator can select, skip, or add custom activities
- Each activity linked to EYLF sub-outcomes
- Reflective prompts for each domain

**Step 4 — Differentiation**
- Groups children by skill level for each focus domain:
  - 🔴 Needs Support (Emerging/Developing)
  - 🟡 Consolidating
  - 🟢 Ready to Extend (Proficient/Extending)
- Educator writes differentiation strategies per group
- Guided prompts about peer learning and adaptations

**Step 5 — Review & Save**
- Complete plan summary with all activities and outcomes
- NQS Quality Area 1 alignment confirmation
- Saved plan history for audit trail

### Observations & Progress Tracking
- Record observations throughout the day
- 5 observation types: Learning Story, Jotting, Photo Documentation, Work Sample, Checklist
- Link each observation to EYLF V2.0 outcomes and developmental domains
- Attach media (photos, videos, audio notes, work samples)
- Optional inline skill level updates when progress is observed
- Follow-up / next steps field
- Timeline view filtered by date, room, or individual child
- Daily documentation statistics

---

## Existing Features

### Rostering & Staff Management
- Educator profiles with qualifications, WWCC, first aid
- Room management with age groups and ratios
- Weekly/fortnightly/4-weekly roster builder
- Clock in/out with break tracking

### NQF Compliance Engine
- Reg 123 educator-to-child ratio monitoring
- Reg 126 qualification requirements (50% Diploma+)
- Division 5 ECT requirements
- WWCC expiry tracking (30-day warnings)
- First aid coverage monitoring
- Real-time compliance dashboard

### Reports & Analytics
- Hours distribution charts
- Compliance trend tracking
- Room utilisation analysis

---

## Deployment

### Requirements
- Ubuntu 22.04+ (or any Linux with Node.js)
- Node.js 20+
- Port 3003 available

### Quick Deploy
```bash
tar xzf childcare-roster-app.tar.gz
cd childcare-roster-app
npm install
npx vite build
npx vite preview --port 3003 --host 0.0.0.0
```

### Production (systemd)
```bash
sudo cp littlesteps.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable littlesteps
sudo systemctl start littlesteps
```

### Access
- Local: http://localhost:3003
- Network: http://YOUR_VM_IP:3003
- Firewall: `sudo ufw allow 3003/tcp`

---

## Regulatory References
- **EYLF V2.0 (2022)**: Belonging, Being & Becoming — 5 Learning Outcomes
- **MTOP V2.0 (2022)**: My Time, Our Place — School Age Care
- **NQS**: 7 Quality Areas (QA1 Educational Program focus)
- **Regulation 123**: Educator-to-child ratios (NSW)
- **Regulation 126**: Qualification requirements
- **Regulations 130-135**: ECT requirements

## File Structure
```
src/
  App.jsx           — Main app (1664 lines): Dashboard, Roster, Compliance
  LearningModule.jsx — NQF module (1487 lines): Children, Planning, Observations
  nqf-data.js       — EYLF/MTOP/NQS reference data (349 lines)
  main.jsx          — React entry point
```

## Tech Stack
React 18.2 | Recharts | Vite 5.4 | Dark Theme UI
