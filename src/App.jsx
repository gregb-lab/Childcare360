import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import _ from "lodash";
import { ChildrenView, PlanningWizardView, ObservationsView } from "./LearningModule.jsx";
import LearningJourneyModule from "./LearningJourneyModule.jsx";
import EnrolmentModule from "./EnrolmentModule.jsx";
import StaffWellbeingModule from "./StaffWellbeingModule.jsx";
import WaitlistModule from "./WaitlistModule.jsx";
import ParentPortalModule from "./ParentPortalModule.jsx";
import { UserMenu, useAuth } from "./AuthModule.jsx";
import { ComplianceDashboard } from "./ComplianceModule.jsx";
import { InvoicingDashboard } from "./InvoicingModule.jsx";
import { OwnerPortal } from "./OwnerPortalModule.jsx";
import { RosteringModule } from "./RosteringModule.jsx";
import EducatorsModule from "./EducatorsModule.jsx";
import ChildrenModule from "./ChildrenModule.jsx";
import DailyUpdatesModule from "./DailyUpdatesModule.jsx";
import ExcursionsModule from "./ExcursionsModule.jsx";
import DocumentsModule from "./DocumentsModule.jsx";
import RoomsModule from "./RoomsModule.jsx";
import MessagingModule from "./MessagingModule.jsx";
import MedicationRegisterModule from "./MedicationRegisterModule.jsx";
import SOC2Module from "./SOC2Module.jsx";
import VoiceAgentModule from "./VoiceAgentModule.jsx";
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
  return new Date(date).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
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
export default function ChildcareRosterApp() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState(auth.isPlatformAdmin && !auth.currentTenant ? "owner_portal" : "dashboard");
  const [educators, setEducators] = useState(INITIAL_EDUCATORS.map((e) => ({ ...e, status: "clocked_out", clockInTime: null, onBreak: false, breakStart: null, totalBreak: 0, todayHours: 0 })));
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
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
  const [liveEducatorCount, setLiveEducatorCount] = useState(null);

  // Fetch live child count for sidebar
  useEffect(() => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    if (!t || !tid) return;
    fetch("/api/children/debug-count", {
      headers: { Authorization: "Bearer " + t, "x-tenant-id": tid, "Content-Type": "application/json" }
    }).then(r => r.json()).then(d => { if (d.childCount != null) setLiveChildCount(d.childCount); }).catch(() => {});
    // Educator count
    fetch("/api/educators", {
      headers: { Authorization: "Bearer " + t, "x-tenant-id": tid }
    }).then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : (d.educators || []);
      setLiveEducatorCount(arr.filter(e => e.status === 'active').length);
    }).catch(() => {});
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
    educators.forEach((e) => {
      if (e.wwccExpiry) {
        const expiry = new Date(e.wwccExpiry);
        const daysUntil = Math.ceil((expiry - now) / 86400000);
        if (daysUntil < 0) newAlerts.push({ type: "critical", message: `${e.name}: WWCC EXPIRED` });
        else if (daysUntil < 30) newAlerts.push({ type: "warning", message: `${e.name}: WWCC expires in ${daysUntil} days` });
      }
    });
    setAlerts(newAlerts);
  }, [complianceStatus, educators, now]);

  // ── Clock actions ──
  const clockIn = (educatorId) => {
    const time = new Date();
    setEducators((prev) =>
      prev.map((e) => e.id === educatorId ? { ...e, status: "clocked_in", clockInTime: time.toISOString(), onBreak: false, totalBreak: 0 } : e)
    );
    setClockRecords((prev) => [...prev, { id: generateId(), educatorId, type: "clock_in", time: time.toISOString(), date: time.toISOString().split("T")[0] }]);
  };

  const clockOut = (educatorId) => {
    const time = new Date();
    const educator = educators.find((e) => e.id === educatorId);
    if (!educator) return;
    const clockInTime = new Date(educator.clockInTime);
    const totalMs = time - clockInTime - (educator.totalBreak || 0);
    setEducators((prev) =>
      prev.map((e) => e.id === educatorId ? { ...e, status: "clocked_out", clockInTime: null, onBreak: false, breakStart: null, todayHours: e.todayHours + totalMs } : e)
    );
    setClockRecords((prev) => [...prev, { id: generateId(), educatorId, type: "clock_out", time: time.toISOString(), date: time.toISOString().split("T")[0], duration: totalMs }]);
  };

  const startBreak = (educatorId) => {
    const time = new Date();
    setEducators((prev) =>
      prev.map((e) => e.id === educatorId ? { ...e, onBreak: true, breakStart: time.toISOString() } : e)
    );
    setClockRecords((prev) => [...prev, { id: generateId(), educatorId, type: "break_start", time: time.toISOString(), date: time.toISOString().split("T")[0] }]);
  };

  const endBreak = (educatorId) => {
    const time = new Date();
    const educator = educators.find((e) => e.id === educatorId);
    if (!educator) return;
    const breakMs = time - new Date(educator.breakStart);
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
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "educators", label: "Educators", icon: "people" },
    { id: "rooms", label: "Rooms", icon: "room" },
    { id: "roster", label: "Rostering", icon: "smart_toy" },
    { id: "clockinout", label: "Clock In/Out", icon: "clock" },
    { id: "compliance", label: "Ratios & Quals", icon: "shield" },
    { id: "divider1", label: "", icon: "" },
    { id: "children", label: "Children", icon: "children_icon" },
    { id: "enrolment", label: "Enrolment", icon: "documents" },
    { id: "waitlist", label: "Waitlist", icon: "documents" },
    { id: "daily_updates", label: "Live Updates", icon: "observation" },
    { id: "learning_journey", label: "Learning Journey", icon: "learning" },
    { id: "excursions", label: "Excursions", icon: "learning" },
    { id: "documents", label: "Documents", icon: "documents" },
    { id: "medication_register", label: "Med. Register", icon: "shield" },
    { id: "learning", label: "Learning Plans", icon: "learning" },
    { id: "observations", label: "Observations", icon: "observation" },
    { id: "divider2", label: "", icon: "" },
    { id: "invoicing", label: "Invoicing", icon: "invoicing" },
    { id: "wellbeing", label: "Staff Wellbeing", icon: "dashboard" },
    { id: "messaging", label: "Messaging", icon: "observation" },
    { id: "parent_portal", label: "Parent Portal", icon: "observation" },
    { id: "reports", label: "Reports", icon: "chart" },
    { id: "voice", label: "AI Voice Agent", icon: "observation" },
    { id: "soc2", label: "SOC2 Compliance", icon: "shield" },
    { id: "settings", label: "Settings", icon: "settings" },
    ...(auth.isPlatformAdmin ? [
      { id: "divider3", label: "", icon: "" },
      { id: "owner_portal", label: "Owner Portal", icon: "platform" },
    ] : []),
  ];

  const criticalAlertCount = alerts.filter((a) => a.type === "critical").length;

  // Platform admin with no tenant — show owner portal only
  if (auth.isPlatformAdmin && !auth.currentTenant) {
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
            <OwnerPortal />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Nunito', 'DM Sans', -apple-system, sans-serif", background: "#FAF7F4", color: "#3D3248", overflow: "hidden" }}>

      {/* ── SIDEBAR ── */}
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
              <div style={{ fontSize: 11, color: "#A89DB5" }}>v2.2.12</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          {navItems.map((item) => {
            if (item.id.startsWith("divider")) {
              return <div key={item.id} style={{ height: 1, background: "#E8E0D8", margin: "8px 12px" }} />;
            }
            return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              onMouseEnter={e => { if (activeTab !== item.id) { e.currentTarget.style.background = "rgba(139,109,175,0.06)"; e.currentTarget.style.color = "#5C4E6A"; }}}
              onMouseLeave={e => { if (activeTab !== item.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B5F7A"; }}}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px",
                border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: activeTab === item.id ? 700 : 500,
                fontFamily: "inherit", marginBottom: 2, transition: "all 0.2s ease",
                background: activeTab === item.id ? "rgba(139,109,175,0.10)" : "transparent",
                color: activeTab === item.id ? "#7E5BA3" : "#6B5F7A",
              }}
            >
              <Icon name={item.icon} size={18} color={activeTab === item.id ? "#7E5BA3" : "#A89DB5"} />
              {item.label}
              {item.id === "compliance" && criticalAlertCount > 0 && (
                <span style={{ marginLeft: "auto", background: "#C06B73", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "2px 7px", fontFamily: "'DM Sans', sans-serif" }}>
                  {criticalAlertCount}
                </span>
              )}
              {item.id === "children" && (
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>{liveChildCount ?? nqfChildren.length}</span>
              )}
              {item.id === "educators" && liveEducatorCount != null && (
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#A89DB5", fontFamily: "'DM Sans', sans-serif" }}>{liveEducatorCount}</span>
              )}
              {item.id === "observations" && observations.filter(o => o.timestamp?.startsWith(new Date().toISOString().split("T")[0])).length > 0 && (
                <span style={{ marginLeft: "auto", background: "#8B6DAF", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "2px 7px", fontFamily: "'DM Sans', sans-serif" }}>
                  {observations.filter(o => o.timestamp?.startsWith(new Date().toISOString().split("T")[0])).length}
                </span>
              )}
            </button>
            );
          })}
        </div>

        {/* User account menu */}
        <div style={{ padding: "8px 10px", borderTop: "1px solid #E8E0D8" }}>
          <UserMenu onSettings={() => setActiveTab("settings")} />
        </div>

        <div style={{ padding: "8px 14px 16px", borderTop: "1px solid #E8E0D8" }}>
          <div style={{
            padding: "10px 14px", borderRadius: 10, fontSize: 11, fontWeight: 700,
            background: complianceStatus.allCompliant ? "rgba(107,163,139,0.08)" : "rgba(201,130,138,0.08)",
            border: `1px solid ${complianceStatus.allCompliant ? "rgba(107,163,139,0.15)" : "rgba(201,130,138,0.15)"}`,
            color: complianceStatus.allCompliant ? "#6BA38B" : "#C06B73",
            textAlign: "center", letterSpacing: "0.04em",
          }}>
            {complianceStatus.allCompliant ? "✓ All Compliant" : "⚠ Non-Compliant"}
          </div>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, overflowY: "auto", padding: 0, background: "#FAF7F4" }}>
        <div key={activeTab} style={{ animation: "fadeInUp 0.35s ease-out", padding: 0 }}>
        <header style={{ padding: "20px 32px", borderBottom: "1px solid #E8E0D8", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FDFBF9" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#A89DB5" }}>
              {["children","learning","observations"].includes(activeTab)
                ? `EYLF V2.0 / MTOP V2.0 · ${now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`
                : activeTab === "documents"
                ? "Pending Review · Children's Docs · Educator Docs"
                : activeTab === "invoicing"
                ? "Fee Schedules · CCS Subsidies · Invoices · Payments"
                : `${now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · ${now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`
              }
            </p>
          </div>
          {alerts.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, background: "rgba(201,130,138,0.12)", border: "1px solid rgba(201,130,138,0.2)" }}>
              <Icon name="alert" size={16} color="#C9828A" />
              <span style={{ fontSize: 12, color: "#C9828A", fontWeight: 600 }}>{alerts.length} Active Alert{alerts.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </header>

        <div style={{ padding: "24px 32px" }}>
          {activeTab === "dashboard" && <DashboardView complianceStatus={complianceStatus} educators={educators} rooms={rooms} alerts={alerts} clockRecords={clockRecords} now={now} />}
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
          {activeTab === "wellbeing" && <StaffWellbeingModule />}
          {activeTab === "parent_portal" && <ParentPortalModule />}
          {activeTab === "excursions" && <ExcursionsModule />}
          {activeTab === "documents" && <DocumentsModule />}
          {activeTab === "medication_register" && <MedicationRegisterModule />}
          {activeTab === "learning" && <PlanningWizardView children={nqfChildren} rooms={rooms} dailyPlans={dailyPlans} setDailyPlans={setDailyPlans} />}
          {activeTab === "observations" && <ObservationsView children={nqfChildren} rooms={rooms} observations={observations} setObservations={setObservations} />}
          {activeTab === "invoicing" && <InvoicingDashboard children={nqfChildren} />}
          {activeTab === "messaging" && <MessagingModule />}
          {activeTab === "reports" && <ReportsView educators={educators} rooms={rooms} clockRecords={clockRecords} complianceStatus={complianceStatus} rosterEntries={rosterEntries} />}
          {activeTab === "settings" && <SettingsView />}
          {activeTab === "soc2" && <SOC2Module tenantId={auth.currentTenant?.id} />}
          {activeTab === "voice" && <VoiceAgentModule />}
          {activeTab === "owner_portal" && auth.isPlatformAdmin && <OwnerPortal />}
        </div>
        </div>
      </main>

      {/* ── MODALS ── */}
      {showModal === "educator" && <EducatorModal educator={editItem} onSave={saveEducator} onClose={() => { setShowModal(null); setEditItem(null); }} />}
      {showModal === "room" && <RoomModal room={editItem} onSave={saveRoom} onClose={() => { setShowModal(null); setEditItem(null); }} />}
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
function StatCard({ label, value, sub, color = "#8B6DAF", icon }) {
  return (
    <div style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 14, padding: 18, flex: "1 1 0", borderRadius: 16, cursor: "default", boxShadow: "0 2px 12px rgba(80,60,90,0.04)" }}
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

// ─── DASHBOARD VIEW ────────────────────────────────────────────────────────────
function DashboardView({ complianceStatus, educators, rooms, alerts, clockRecords, now }) {
  const cs = complianceStatus;
  const [peakData, setPeakData] = useState([]);

  useEffect(() => {
    const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
    fetch("/api/attendance-peak", {
      headers: { "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...(tid ? { "x-tenant-id": tid } : {}),
      },
    }).then(r => r.json()).then(d => { if (Array.isArray(d)) setPeakData(d); }).catch(() => {});
  }, []);

  const qualData = QUALIFICATION_LEVELS.map((q) => ({
    name: q.label.split(" ")[0],
    count: educators.filter((e) => e.qualification === q.id).length,
    fill: q.color,
  })).filter((d) => d.count > 0);

  const roomData = rooms.map((r) => {
    const group = AGE_GROUPS.find((g) => g.id === r.ageGroup);
    return { name: r.name, children: r.currentChildren, capacity: r.capacity, fill: group?.color || "#8B6DAF" };
  });

  return (
    <div>
      {/* Alert Banner */}
      {alerts.filter((a) => a.type === "critical").length > 0 && (
        <div style={{ background: "rgba(201,130,138,0.08)", border: "1px solid rgba(201,130,138,0.18)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <Icon name="warning" size={20} color="#C06B73" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#C9828A", marginBottom: 4 }}>Critical Compliance Issues</div>
            {alerts.filter((a) => a.type === "critical").map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: "#D4A4AB", marginBottom: 2 }}>• {a.message}</div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Children Present" value={cs.totalChildren} sub={`across ${rooms.length} rooms`} color="#C9929E" icon="child" />
        <StatCard label="Educators Active" value={cs.activeEducators} sub={`${cs.onBreak} on break`} color="#9B7DC0" icon="people" />
        <StatCard label="Required" value={cs.totalRequired} sub="minimum educators" color={cs.ratioMet ? "#6BA38B" : "#C06B73"} icon="shield" />
        <StatCard label="ECTs on Floor" value={cs.activeECTs} sub={`${cs.ectReq.ectRequired} required`} color={cs.ectMet ? "#6BA38B" : "#C06B73"} icon="shield" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Ratio Overview */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", color: "#A89DB5", fontSize: 10, display: "block", marginBottom: 4 }}>REG 123</span>
            Room Ratio Status
          </h3>
          {rooms.map((room) => {
            const group = AGE_GROUPS.find((g) => g.id === room.ageGroup);
            const required = Math.ceil(room.currentChildren / (group?.ratio || 10));
            return (
              <div key={room.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #E8E0D8" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: group?.color || "#8B6DAF" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{room.name}</div>
                  <div style={{ fontSize: 11, color: "#A89DB5" }}>{room.currentChildren} children · 1:{group?.ratio} ratio</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color: "#A88BC7" }}>
                  Need {required}
                </div>
              </div>
            );
          })}
        </div>

        {/* Room Occupancy Chart */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Room Occupancy</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={roomData} barSize={24}>
              <XAxis dataKey="name" tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#A89DB5", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#E8E0D8", border: "1px solid #D9D0C7", borderRadius: 8, fontSize: 12, color: "#3D3248" }} />
              <Bar dataKey="children" radius={[6, 6, 0, 0]}>
                {roomData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
              </Bar>
              <Bar dataKey="capacity" radius={[6, 6, 0, 0]} fillOpacity={0.15}>
                {roomData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Qualification Breakdown */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Staff Qualifications</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={qualData} dataKey="count" innerRadius={40} outerRadius={60} paddingAngle={4} strokeWidth={0}>
                  {qualData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {qualData.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: d.fill }} />
                  <span style={{ fontSize: 12, color: "#8A7F96" }}>{d.name}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: cs.qualComp.compliant ? "rgba(107,163,139,0.08)" : "rgba(201,130,138,0.08)", fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: cs.qualComp.compliant ? "#83B99E" : "#C9828A" }}>
            {cs.qualComp.compliant ? "✓ 50% Diploma+ requirement met" : `⚠ ${cs.qualComp.diplomaPercent.toFixed(0)}% diploma+ (50% required)`}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Recent Activity</h3>
          {clockRecords.length === 0 ? (
            <div style={{ color: "#A89DB5", fontSize: 13, textAlign: "center", padding: 30 }}>No clock records today</div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {[...clockRecords].reverse().slice(0, 10).map((r) => {
                const ed = educators.find((e) => e.id === r.educatorId);
                const typeColors = { clock_in: "#6BA38B", clock_out: "#C9828A", break_start: "#D4A26A", break_end: "#9B7DC0" };
                const typeLabels = { clock_in: "Clocked In", clock_out: "Clocked Out", break_start: "Break Start", break_end: "Break End" };
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F0EBE6" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: typeColors[r.type] }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{ed?.name || "Unknown"}</div>
                      <div style={{ fontSize: 10, color: "#A89DB5" }}>{typeLabels[r.type]}</div>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: "#A89DB5" }}>{formatTime(r.time)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* ── Peak Attendance Times ── */}
        <div style={{ ...cardStyle, gridColumn: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700 }}>Peak Attendance Times</h3>
              <div style={{ fontSize: 11, color: "#A89DB5" }}>Average children present across the day — based on attendance records (last 30 days)</div>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 10, alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 3, borderRadius: 2, background: "#8B6DAF" }}/> Present
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 3, borderRadius: 2, background: "#6BA38B" }}/> Arrivals
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 3, borderRadius: 2, background: "#C9829E" }}/> Departures
              </span>
            </div>
          </div>
          {peakData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={peakData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B6DAF" stopOpacity={0.18}/>
                    <stop offset="95%" stopColor="#8B6DAF" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="gradArrivals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6BA38B" stopOpacity={0.12}/>
                    <stop offset="95%" stopColor="#6BA38B" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE6" vertical={false}/>
                <XAxis dataKey="label" tick={{ fill: "#A89DB5", fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: "#A89DB5", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #EDE8F4", borderRadius: 10, fontSize: 11, color: "#3D3248", boxShadow: "0 4px 16px rgba(139,109,175,0.12)" }}
                  formatter={(val, name) => [val, name.charAt(0).toUpperCase()+name.slice(1)]}
                  labelStyle={{ fontWeight: 700, marginBottom: 4 }}
                />
                <Area type="monotone" dataKey="present" stroke="#8B6DAF" strokeWidth={2.5} fill="url(#gradPresent)" dot={false} name="present"/>
                <Area type="monotone" dataKey="arrivals" stroke="#6BA38B" strokeWidth={1.5} fill="url(#gradArrivals)" dot={false} strokeDasharray="4 2" name="arrivals"/>
                <Line type="monotone" dataKey="departures" stroke="#C9829E" strokeWidth={1.5} dot={false} strokeDasharray="3 3" name="departures"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "#B0AAB9" }}>
              <div style={{ fontSize: 28 }}>📊</div>
              <div style={{ fontSize: 12 }}>Attendance data will appear once children start signing in</div>
            </div>
          )}
          {peakData.length > 0 && (() => {
            const peak = peakData.reduce((max, d) => d.present > (max?.present || 0) ? d : max, null);
            const busiest = peakData.filter(d => d.arrivals === Math.max(...peakData.map(d2 => d2.arrivals)))[0];
            return (
              <div style={{ display: "flex", gap: 16, marginTop: 12, padding: "8px 12px", background: "#F8F5FC", borderRadius: 8 }}>
                {peak && <div style={{ fontSize: 11 }}><span style={{ color: "#A89DB5" }}>Peak attendance:</span> <strong style={{ color: "#8B6DAF" }}>{peak.present} children</strong> at <strong>{peak.label}</strong></div>}
                {busiest && <div style={{ fontSize: 11 }}><span style={{ color: "#A89DB5" }}>Busiest arrival:</span> <strong style={{ color: "#6BA38B" }}>{busiest.label}</strong></div>}
                <div style={{ fontSize: 11 }}><span style={{ color: "#A89DB5" }}>Data:</span> last 30 days avg</div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── EDUCATORS VIEW ────────────────────────────────────────────────────────────
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
            {new Date(currentDate + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
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

  const clockedIn = educators.filter((e) => e.status === "clocked_in");
  const clockedOut = educators.filter((e) => e.status === "clocked_out" && e.active);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
      </div>

      {/* Today's Log */}
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

// ─── REPORTS VIEW ──────────────────────────────────────────────────────────────
function ReportsView({ educators, rooms, clockRecords, complianceStatus, rosterEntries }) {
  const [reportType, setReportType] = useState("hours");

  // Generate weekly hours data
  const hoursData = useMemo(() => {
    return DAYS_OF_WEEK.map((day, i) => {
      const totalHours = educators.length * (6 + Math.random() * 3);
      const breakHours = totalHours * (0.08 + Math.random() * 0.04);
      return { day: day.slice(0, 3), working: Math.round(totalHours - breakHours), breaks: Math.round(breakHours), total: Math.round(totalHours) };
    });
  }, [educators]);

  // Compliance trend (simulated last 4 weeks)
  const complianceTrend = useMemo(() => {
    return ["Wk 1", "Wk 2", "Wk 3", "Wk 4"].map((week) => ({
      week,
      ratioCompliance: 85 + Math.random() * 15,
      qualCompliance: 90 + Math.random() * 10,
      overall: 80 + Math.random() * 20,
    }));
  }, []);

  // Educator hours breakdown
  const educatorHours = educators.map((e) => {
    const records = clockRecords.filter((r) => r.educatorId === e.id && r.type === "clock_out");
    const totalMs = records.reduce((sum, r) => sum + (r.duration || 0), 0);
    const scheduled = rosterEntries.filter((r) => r.educatorId === e.id).length * 8;
    return { name: e.name.split(" ")[0], actual: Math.round(totalMs / 3600000 * 10) / 10, scheduled, today: Math.round(e.todayHours / 3600000 * 10) / 10 };
  });

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
          { id: "compliance", label: "Compliance Trends" },
          { id: "utilisation", label: "Room Utilisation" },
          { id: "qualifications", label: "Qualification Analysis" },
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
    </div>
  );
}

// ─── SETTINGS VIEW ─────────────────────────────────────────────────────────────
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
    await API2("/api/ai/providers",{method:"POST",body:data});
    const d = await API2("/api/ai/providers");
    if(Array.isArray(d)) setProviders(d);
    setEditProv(null);
  };
  const deleteProvider = async (provider) => {
    if(!confirm(`Remove ${provider} provider?`)) return;
    await API2(`/api/ai/providers/${provider}`,{method:"DELETE"});
    setProviders(p=>p.filter(x=>x.provider!==provider));
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

  const STABS = [{id:"service",l:"⚙️ Service"},{id:"ai",l:"🤖 AI Providers"},{id:"notifications",l:"🔔 Notifications"},{id:"regs",l:"📋 Regulations"},{id:"data",l:"🗄️ Data Management"}];
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

      {/* ── NOTIFICATIONS TAB ── */}
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
                if(!confirm('Remove demo children? This keeps all CN-imported children and removes original sample data.')) return;
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
                if(!confirm('This will DELETE all current educators for this centre and replace with the 22 real CN educators from the compliance spreadsheet. Continue?')) return;
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
    if (!form.name?.trim()) { alert("Room name is required"); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
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
