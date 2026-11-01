# CamPulse - Professional Documentation

## Overview

**CamPulse** is a comprehensive, seamless platform designed for educational institutions to coordinate extracurricular activities, manage campus events, and synchronize college life across students, staff, and higher administration (HODs). Built with a modern, high-performance tech stack and featuring a distinctive Neumorphic design system, CamPulse bridges the gap between campus communication, activity tracking, and formal approvals.

---

## Architecture & Tech Stack

The project utilizes a modern web stack, heavily leaning on the React/Next.js ecosystem for the frontend and serverless database integrations for the backend.

### Frontend
- **Framework:** Next.js (App Router) v16
- **UI Library:** React v19
- **Language:** TypeScript
- **Styling:** Tailwind CSS (with a custom Neumorphic/Soft-UI design system)
- **Icons:** Lucide React
- **Animations:** Framer Motion (Micro-animations, smooth transitions, and hover effects)
- **Data Export:** jsPDF (with jspdf-autotable) & SheetJS (`xlsx`) for CSV/Excel data generation

### Backend & Infrastructure
- **Backend/Database:** Supabase (PostgreSQL Database, Authentication, and Edge Functions)
- **State Management:** React Hooks, local state, Next.js App Router context
- **Rate Limiting:** Custom rate-limiting module (`/lib/rate-limit.ts`) to prevent abuse of API routes and server actions.
- **Deployment:** Optimized for Vercel

---

## Core Ecosystems

The platform is strictly categorized into role-based ecosystems to ensure data integrity and seamless workflows.

### 1. Student Portal (`/student`)
- **Authentication:** Secure login using `uid` validated against the `students` database.
- **Event Proposals:** Dedicated forms with 30-day forward/backward constraints for requesting event approvals.
- **Activity Log (Diary):** Dual-tab architecture (Log New & My History) allowing students to submit and track their extracurricular activities.
- **Group Activities:** Students can tag peers and mentors in single submissions for team events, reducing database redundancies.
- **Noticeboard Widget:** Real-time visibility of HOD broadcasts and official notices.

### 2. Staff Portal (`/staff`)
- **Authentication:** Secure login using Staff ID (`suid`).
- **Mentee Management:** Dedicated hub to oversee mentees (`/staff/mentees`), complete with drill-down timelines and bulk `.xlsx` mentee imports.
- **Event Proposals:** Capability to submit departmental event proposals directly to the HOD.
- **Approval Queue:** A priority queue to approve or reject student activity logs, handling both legacy and multi-tagged group activities.
- **Noticeboard:** Real-time integration of HOD broadcasts.

### 3. HOD Ecosystem (`/hod`)
- **Authentication:** Top-level access via HOD ID (`huid`).
- **Dashboard Metrics:** Real-time statistics including Total Students, Approved Events, and a pending action center.
- **Dossier & Directories:** Comprehensive staff and student directories with real-time search, department filtering, and drill-down activity dossier UI.
- **Event Approvals:** Central hub for approving/rejecting departmental extracurricular events.
- **Reporting & Auditing:** PDF and Excel (CSV) export functionality for formal auditing of approved events.
- **Broadcast System:** Functionality to broadcast official notices specifically to either students or staff.

---

## Design System & UX

CamPulse takes pride in its fluid and modern aesthetic to ensure high user engagement.
- **Theme:** Neumorphism (Soft UI) featuring inset and drop shadows to create a tactile, "embossed" digital feel.
- **Color Coding:** 
  - 🟣 **Purple** (`#A78BFA`): Student Ecosystem
  - 🔵 **Blue** (`#60A5FA`): Staff Ecosystem
  - 🟢 **Emerald Green** (`#10B981`): HOD Ecosystem
- **UX Features:** Wide, breathable slide-over UI forms, responsive interactive charts, and multi-tag input components for intuitive use.

---

## Database Architecture (Supabase)

Data is strictly normalized and managed using PostgreSQL.
- **Key Tables:** `students`, `staff`, `hods`, `event_proposals`, `broadcasts`, `student_activities`.
- **Relational Integrity:** Implementations of linking tables (`group_activities`, `activity_participants`, `activity_mentors`) for many-to-many relationships, avoiding N x M data duplication.
- **Data Standardization:** Universal casting of `department_id` to `VARCHAR` to ensure cross-table compatibility and prevent SQL type mismatch errors.
- **Security:** "Pending-Only" deletion rules enforced for data accuracy, preventing modification of already-approved events.

---

## Getting Started (Development)

### Prerequisites
- Node.js (v18 or higher recommended)
- npm, yarn, pnpm, or bun

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Setup Environment Variables:
   Create a `.env.local` file with the required Supabase URL and Anon Key.
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Access the application locally at `http://localhost:3000`.

---

## Future Roadmap / Pending Tasks
- **QA Testing:** End-to-end verification of user flows (Student -> Faculty Mentor -> HOD).
- **Environment Parity:** Ensuring environment variables are perfectly configured for staging and production.
- **Deployment:** Pushing the final builds via Vercel.

---
*Generated internally for professional documentation of the CamPulse App.*
