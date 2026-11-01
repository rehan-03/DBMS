# CamPulse — Complete Project Documentation

> **Version:** v2026  
> **Platform:** Web Application (Responsive — Desktop & Mobile)  
> **Institution:** KKW College of Engineering  
> **Last Updated:** April 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure & File Map](#3-project-structure--file-map)
4. [Design System](#4-design-system)
5. [Authentication & Security](#5-authentication--security)
6. [Core Modules](#6-core-modules)
   - 6.1 [Landing Page & Unified Login](#61-landing-page--unified-login)
   - 6.2 [Student Portal](#62-student-portal)
   - 6.3 [Staff Portal](#63-staff-portal)
   - 6.4 [HOD Ecosystem](#64-hod-ecosystem)
   - 6.5 [Admin Portal](#65-admin-portal)
7. [Database Architecture (Supabase)](#7-database-architecture-supabase)
8. [Reusable Components](#8-reusable-components)
9. [Data Export & Reporting](#9-data-export--reporting)
10. [Rate Limiting](#10-rate-limiting)
11. [Environment Variables & Configuration](#11-environment-variables--configuration)
12. [Development Setup](#12-development-setup)
13. [Deployment](#13-deployment)
14. [Developer Notes & Conventions](#14-developer-notes--conventions)
15. [Roadmap & Pending Work](#15-roadmap--pending-work)

---

## 1. Project Overview

**CamPulse** is a comprehensive, role-based web platform designed for educational institutions to manage, track, and approve extracurricular activities and campus events. It connects three key stakeholders — **Students**, **Faculty Staff**, and **Heads of Department (HODs)** — through a seamless digital workflow:

- Students log extracurricular activities and submit event proposals.
- Faculty mentors review, approve, or reject student activities and maintain their own professional diaries.
- HODs oversee the entire department — managing event approvals, broadcasting notices, and viewing detailed student & staff dossiers.

The platform replaces paper-based approval workflows with a modern, real-time web application featuring a distinctive **Neumorphic (Soft UI)** design language.

---

## 2. Technology Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** (App Router) | v16.2.2 | Full-stack React framework, file-system routing, server components |
| **React** | v19.2.4 | UI component library |
| **TypeScript** | ^5 | Static type safety |
| **Tailwind CSS** | ^3.4.0 | Utility-first CSS framework (with custom Neumorphic design tokens) |
| **Framer Motion** | ^12.38.0 | Declarative animations, page transitions, micro-interactions |
| **Lucide React** | ^1.7.0 | Modern, consistent SVG icon library |

### Backend & Database

| Technology | Purpose |
|---|---|
| **Supabase** (`@supabase/supabase-js` ^2.102.1) | Hosted PostgreSQL database, real-time subscriptions, Row Level Security |

### Data Export

| Library | Purpose |
|---|---|
| **jsPDF** (^4.2.1) + **jspdf-autotable** (^5.0.7) | Client-side PDF generation with styled tables |
| **SheetJS / xlsx** (^0.18.5) | Excel/CSV file parsing (bulk `.xlsx` student imports) |

### Analytics & Deployment

| Technology | Purpose |
|---|---|
| **Vercel Analytics** (`@vercel/analytics` ^2.0.1) | Lightweight client-side analytics |
| **Vercel** | Target deployment platform |

### Tooling & Dev Dependencies

| Tool | Purpose |
|---|---|
| **ESLint** (^9) + `eslint-config-next` | Linting with Next.js Core Web Vitals and TypeScript rules |
| **PostCSS** + **Autoprefixer** | CSS post-processing for Tailwind |
| **Turbopack** | Development bundler (configured in `next.config.ts`) |

---

## 3. Project Structure & File Map

The project contains **27 TypeScript/TSX source files** totaling approximately **6,450 lines of code**.

```
CamPulse/
├── app/
│   ├── layout.tsx                  # Root HTML layout, Vercel Analytics, global CSS import
│   ├── page.tsx                    # Landing page with unified login (Student/Staff/HOD)
│   ├── globals.css                 # Tailwind directives, CSS custom properties, dark mode support
│   │
│   ├── student/                    # ── STUDENT PORTAL ──
│   │   ├── supabase.ts            # Singleton Supabase client (shared across all portals)
│   │   ├── layout.tsx             # Collapsible sidebar + mobile bottom bar, auth guard
│   │   ├── page.tsx               # Dashboard — stats bento grid, engagement pulse bar, noticeboard
│   │   ├── log/page.tsx           # Dual-tab activity logger (Log New + My History timeline)
│   │   ├── events/page.tsx        # Event proposal form & proposal history tracker
│   │   ├── mentorship/page.tsx    # Mentor profile card & legacy validation history
│   │   ├── profile/page.tsx       # Read-only academic profile & password reset
│   │   └── components/
│   │       ├── MultiTagInput.tsx   # Reusable searchable multi-select tag component
│   │       └── Noticeboard.tsx     # HOD broadcast reader widget (student variant)
│   │
│   ├── staff/                      # ── STAFF PORTAL ──
│   │   ├── layout.tsx             # Staff sidebar + mobile nav, auth guard, notification badges
│   │   ├── page.tsx               # Command Center — metrics, mentees overview, noticeboard
│   │   ├── approvals/page.tsx     # Priority Queue — approve/reject student activities with feedback
│   │   ├── mentees/page.tsx       # Mentee Management — CRUD, bulk .xlsx import, drilldown timelines
│   │   ├── log/page.tsx           # Professional Diary — slide-over form, timeline, PDF export
│   │   ├── events/page.tsx        # Faculty event proposal form & history
│   │   ├── reports/page.tsx       # Data & Reports — date filtering, PDF/CSV export
│   │   ├── profile/page.tsx       # Faculty profile & password management
│   │   └── components/
│   │       └── Noticeboard.tsx     # HOD broadcast reader widget (staff variant)
│   │
│   ├── hod/                        # ── HOD ECOSYSTEM ──
│   │   ├── layout.tsx             # HOD sidebar + mobile nav, auth guard
│   │   ├── page.tsx               # Dashboard — pending approvals, student/event counts, action center
│   │   ├── approvals/page.tsx     # Event Approvals hub — tabs (pending/approved/rejected), PDF/CSV export
│   │   ├── broadcasts/page.tsx    # Broadcast Composer — send notices to students/staff/all
│   │   ├── students/page.tsx      # Student Directory — search, drilldown dossier with activity timeline
│   │   └── staff/page.tsx         # Staff Directory — search, drilldown dossier (diary + mentees tabs)
│   │
│   └── admin/                      # ── ADMIN PORTAL ──
│       └── page.tsx               # Standalone admin login (hardcoded credentials, placeholder)
│
├── lib/
│   └── rate-limit.ts              # In-memory sliding-window rate limiter
│
├── supabase-actions.ts            # Server action for rate-limited student activity updates
│
├── public/
│   ├── kkw.png                    # College logo (displayed on login page)
│   ├── favicon.ico                # Browser favicon
│   └── *.svg                      # Default Next.js SVG assets
│
├── tailwind.config.ts             # Custom colors (softPurple, softOrange), Neumorphic box-shadow tokens
├── next.config.ts                 # Next.js config (Turbopack root)
├── tsconfig.json                  # TypeScript compiler options, path aliases (@/*)
├── eslint.config.mjs              # ESLint flat config with Core Web Vitals + TypeScript
├── postcss.config.mjs             # PostCSS plugins (Tailwind + Autoprefixer)
├── package.json                   # Project metadata, scripts, dependencies
└── Context.md                     # Internal development context & sprint notes
```

---

## 4. Design System

### Philosophy: Neumorphism (Soft UI)

The entire application uses a **Neumorphic** design language — soft, embossed surfaces achieved through carefully layered outer and inset box shadows against a warm cream background (`#F5F5F0`).

### Design Tokens (Tailwind)

```
Background:     #F5F5F0 (Warm Cream)
Outer Shadow:   8px 8px 16px rgba(0,0,0,0.05), -8px -8px 16px rgba(255,255,255,0.8)
Inset Shadow:   inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)
```

### Role-Based Accent Colors

| Role | Color | Hex | Usage |
|---|---|---|---|
| **Student** | Purple | `#A78BFA` | Buttons, active nav, accent badges |
| **Staff** | Blue | `#60A5FA` | Buttons, active nav, accent badges |
| **HOD** | Emerald Green | `#10B981` | Buttons, active nav, accent badges |
| **Accent/Warning** | Orange | `#FDBA74` | Notification pings, secondary actions |

### UI Patterns

- **Cards:** Large border-radius (`rounded-[2rem]` to `rounded-[3rem]`) with outer soft shadows
- **Inputs:** Inset-shadow "sunken" fields with no visible borders
- **Buttons:** Pill-shaped (`rounded-full`) with colored drop shadows matching the accent
- **Navigation:** Collapsible sidebar on desktop, fixed bottom bar on mobile
- **Animations:** Framer Motion staggered reveals, spring physics, hover/tap scale, AnimatePresence for route transitions
- **Toast Notifications:** Animated bottom-right slide-in toasts for success confirmations

---

## 5. Authentication & Security

### Login Flow (`app/page.tsx`)

CamPulse uses a **unified login page** that routes users to the correct portal based on which database table their ID is found in:

1. Normalize the entered ID to uppercase
2. Query `students` table by `uid` → route to `/student`
3. If not found, query `staff` table by `suid` → route to `/staff`
4. If not found, query `hods` table by `huid` → route to `/hod`
5. If not found in any table, display "User not found" error

### Session Management

- **Storage:** `localStorage` key `campuspulse_uid` stores the authenticated user's ID
- **Auth Guards:** Every portal layout (`student/layout.tsx`, `staff/layout.tsx`, `hod/layout.tsx`) runs a `useEffect` on mount that:
  1. Checks `localStorage` for the UID
  2. Queries the corresponding table to confirm the user exists
  3. Redirects to `/` (login) if the check fails
- **Logout:** Clears `localStorage` and redirects to the login page

### Route Protection

- Each layout verifies the user belongs to its specific role (e.g., `staff/layout.tsx` queries the `staff` table)
- The student mentorship page additionally verifies the user is in the `students` table to prevent cross-role access

---

## 6. Core Modules

### 6.1 Landing Page & Unified Login

**Route:** `/` → `app/page.tsx`

- Split-screen layout: hero text (left) + sign-in card (right)
- College logo (`kkw.png`) displayed in the top-left corner
- Neumorphic sign-in form with UID and password fields
- Cascading role detection across three database tables
- Framer Motion entrance animations

---

### 6.2 Student Portal

**Base Route:** `/student`  
**Accent Color:** Purple (`#A78BFA`)  
**Navigation Items:** Pulse (Dashboard), The Log, Events, Mentorship, Profile

#### 6.2.1 Dashboard (`/student` → `app/student/page.tsx`)

- **Welcome Header** with personalized student name
- **Bento Grid** with 4 metric cards:
  - Total Activities (count of all group + legacy activities)
  - Approved / Pending Leaves
  - Faculty Mentor (resolved from `class_coordinators` → `staff` tables)
  - Engagement Pulse (animated progress bar, capped at 100%)
- **Noticeboard Widget** — reads department-scoped HOD broadcasts
- **Quick Action** — "Log New Activity" button linking to `/student/log`

#### 6.2.2 Activity Log (`/student/log` → `app/student/log/page.tsx`)

- **Dual-Tab Architecture:**
  - **"Log New"** — Form with fields: Title, Category (Technical/Cultural/Sports/Workshop), Description, Date Range (±15 days), Time Range, Leave Required checkbox
  - **"My History"** — Vertical timeline of all submitted activities with status badges (Pending/Approved/Rejected)
- **Multi-Tagging:** Uses `MultiTagInput` to tag Faculty Mentors and Peer Participants
- **Group Activity Architecture:** Inserts into `group_activities` (parent), `activity_participants` (students), and `activity_mentors` (staff) in a single transaction
- **Deletion:** Only "Pending" activities can be deleted
- **Success Toast:** Animated bottom-right notification on successful submission

#### 6.2.3 Event Proposals (`/student/events` → `app/student/events/page.tsx`)

- **"New Proposal"** tab — Comprehensive form: Event Title, Type (Seminar/Workshop/Hackathon/Cultural/Sports/Guest Lecture/Other), Club Name, Description, Start/End Date (±30 days, `datetime-local`), Venue, Expected Footfall, Estimated Budget (₹), Teacher Coordinator
- **"My Proposals"** tab — List of submitted proposals with status badges and budget display
- Proposals are stored in `event_proposals` table with `department_id` for HOD routing
- Pending proposals can be deleted; approved/rejected cannot

#### 6.2.4 Mentorship (`/student/mentorship` → `app/student/mentorship/page.tsx`)

- **Mentor Profile Card:** Shows assigned class coordinator (resolved via `class_coordinators` → `staff` tables), with department name resolved from `departments` table
- **Validation History:** Lists all legacy `student_activities` with status badges and mentor feedback/comments

#### 6.2.5 Profile (`/student/profile` → `app/student/profile/page.tsx`)

- **Academic Profile (Read-Only):** Full Name, UID, Year (resolved from `academic_years` table), Division, Department (resolved from `departments` table)
- **Account Security:** Password update form with minimum 6-character validation

---

### 6.3 Staff Portal

**Base Route:** `/staff`  
**Accent Color:** Blue (`#60A5FA`)  
**Navigation Items:** Command Center, Priority Queue, Mentees, Events, My Log, Reports, Profile

#### 6.3.1 Command Center (`/staff` → `app/staff/page.tsx`)

- **Personalized Welcome** with staff name
- **3-Column Metrics:** Total Mentees, Pending Actions, Recent Pulse (logs in last 24h)
- **Noticeboard Widget** — reads department-scoped HOD broadcasts
- **Mentees Overview Grid** — top 6 students with pending action indicators, click-through to mentee detail

#### 6.3.2 Priority Queue (`/staff/approvals` → `app/staff/approvals/page.tsx`)

- **Dual-Schema Fetching:** Merges requests from both legacy `student_activities` and new `activity_mentors` → `group_activities` → `activity_participants` schemas
- **Compound React Keys:** Uses `${activityId}-${studentUid}` for group activities to handle multiple pending students per event
- **Request Cards:** Show student info, activity details, date, leave status, description
- **One-Click Actions:** Approve (green) or Reject (red) buttons with optional feedback textarea
- **Real-Time UI:** Cards animate out of the queue upon action

#### 6.3.3 Mentee Management (`/staff/mentees` → `app/staff/mentees/page.tsx`)

- **Roster View:** Grid of all department students, with division highlighting for directly-mentored students
- **Search Bar:** Real-time filtering by name or UID
- **CRUD Operations:**
  - **Add Mentee:** Modal form with fields: UID, Full Name, DOB, Gender, Division, Semester, Year ID, Batch, Password
  - **Edit Mentee:** Pre-populated modal (password field optional to preserve existing)
  - **Delete Mentee:** Confirmation modal with destructive action warning
- **Bulk Import (.xlsx):**
  1. Download Template — generates an Excel file with correct column headers
  2. Import .xlsx — parses uploaded file, shows preview table in confirmation modal
  3. Confirm Import — uses Supabase `upsert` with `onConflict: 'uid'`
- **Drill-Down Dossier:** Click "View Logs" on any student → timeline view of their group activities with status indicators

#### 6.3.4 Professional Diary (`/staff/log` → `app/staff/log/page.tsx`)

- **Slide-Over Form:** Full-width right panel with spring animation, featuring:
  - Activity Title, Category (Expert Session/Publication/Workshop-FDP/Industrial Visit/Other)
  - Academic Year, Division(s), Target Batch(es)
  - Multi-Tag Inputs: Co-Faculty peers and Students Involved
  - Date & Time Range (±15 days), Location, Proof/Link (URL), Description
- **Vertical Timeline Feed:** Expandable cards showing all diary entries with delete capability
- **PDF Export Modal:** Filter by academic year, generates formatted PDF report using jsPDF + autoTable
- **Staff Activity Tables:** `staff_activities`, `staff_activity_comentors`, `staff_activity_participants`

#### 6.3.5 Faculty Event Proposals (`/staff/events` → `app/staff/events/page.tsx`)

- Identical in structure to the Student Event Proposals page
- Uses staff accent color (Blue) instead of Purple
- Proposals tagged with staff's `department_id` for HOD routing

#### 6.3.6 Data & Reports (`/staff/reports` → `app/staff/reports/page.tsx`)

- **Scope Toggle:** "My Mentees" vs "Entire Department" filter
- **Date Range Pickers:** From/To date inputs for temporal filtering
- **Export Actions:**
  - PDF Report — formatted activity audit with CampusPulse branding
  - CSV/Excel Export — raw data download for spreadsheet analysis
- **Data Preview:** Scrollable list of all matching activity records with status badges
- **Dual-Schema Support:** Merges data from both `student_activities` and `activity_participants` → `group_activities`

#### 6.3.7 Staff Profile (`/staff/profile` → `app/staff/profile/page.tsx`)

- **Faculty Profile (Read-Only):** Full Name, Staff ID, Designation, Department (resolved from `departments` table)
- **Account Security:** Password update form

---

### 6.4 HOD Ecosystem

**Base Route:** `/hod`  
**Accent Color:** Emerald Green (`#10B981`)  
**Navigation Items:** Dashboard, Students, Staff, Approvals, Broadcasts

#### 6.4.1 HOD Dashboard (`/hod` → `app/hod/page.tsx`)

- **Welcome Header** with HOD name and department name (resolved via foreign key join with `departments`)
- **3-Column Metrics:** Pending Approvals, Total Students, Approved Events
- **Action Center:** List of pending event proposals with one-click Approve/Reject buttons, showing event type, budget, venue, and organizer

#### 6.4.2 Event Approvals (`/hod/approvals` → `app/hod/approvals/page.tsx`)

- **3-Tab Interface:** Pending / Approved / Rejected (with counts)
- **Rich Proposal Cards:** Full event details including type, club name, description, organizer, venue, budget, audience, expected footfall, guest speaker, teacher coordinator
- **Bulk Export:**
  - PDF (Landscape) — themed with Emerald green headers
  - CSV/Excel — downloadable spreadsheet
- **Approve/Reject:** Updates `event_proposals.status` in real-time

#### 6.4.3 Department Broadcasts (`/hod/broadcasts` → `app/hod/broadcasts/page.tsx`)

- **Composer (Left Column):** Target audience selector (Everyone/Students Only/Staff Only), Title, Message textarea
- **Transmission History (Right Column):** Scrollable list of past broadcasts with audience badge, timestamp, and sender ID
- Broadcasts are scoped to the HOD's `department_id` and stored in the `broadcasts` table

#### 6.4.4 Student Directory (`/hod/students` → `app/hod/students/page.tsx`)

- **Directory Grid:** All students in the HOD's department with avatar icons, UID, and year badge
- **Real-Time Search:** Filter by name or UID
- **Drill-Down Dossier:** Click any student → full profile header (name, UID, division, email, phone) + activity timeline merging both legacy and group activity schemas

#### 6.4.5 Staff Directory (`/hod/staff` → `app/hod/staff/page.tsx`)

- **Directory Grid:** All faculty in the HOD's department
- **Drill-Down Dossier:** Two-tab view:
  - **Professional Diary** — Full timeline of the faculty member's logged activities (including co-mentored ones)
  - **Assigned Mentees** — Grid of students assigned via `class_coordinators` table

---

### 6.5 Admin Portal

**Route:** `/admin` → `app/admin/page.tsx`

- Standalone Neumorphic login page with orange accent (`#FDBA74`)
- Currently uses **hardcoded credentials** (admin/admin123) — placeholder for future implementation
- No admin dashboard implemented yet

---

## 7. Database Architecture (Supabase)

### Core Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `students` | `uid` (VARCHAR) | Student records (name, division, department_id, year_id, batch, password, etc.) |
| `staff` | `suid` (VARCHAR) | Faculty records (name, designation, department_id, password, etc.) |
| `hods` | `huid` (VARCHAR) | HOD records (name, department_id, password) |
| `departments` | `department_id` | Department lookup (department_name) |
| `academic_years` | `year_id` | Academic year lookup (year_name) |
| `class_coordinators` | `suid` + `division` | Maps staff members to their coordinated student divisions |

### Activity Tracking (Group Architecture)

| Table | Purpose |
|---|---|
| `group_activities` | Parent activity record (title, category, dates, leave_required, created_by) |
| `activity_participants` | Many-to-many: links students to group activities (student_uid, activity_id, status) |
| `activity_mentors` | Many-to-many: links staff mentors to group activities (staff_suid, activity_id) |

### Legacy Activity Tracking

| Table | Purpose |
|---|---|
| `student_activities` | Original single-student activity records (uid, suid, activity_name, status, feedback) |

### Staff Activity Tracking

| Table | Purpose |
|---|---|
| `staff_activities` | Faculty professional diary entries (suid, activity_name, type, dates, location, etc.) |
| `staff_activity_comentors` | Links co-faculty to staff activities |
| `staff_activity_participants` | Links students to staff activities |

### Event Management

| Table | Purpose |
|---|---|
| `event_proposals` | Event proposals from students/staff (title, type, venue, budget, status, department_id) |
| `broadcasts` | HOD notices (title, message, target_audience, department_id, created_by) |

### Key Data Conventions

- **`department_id`** is standardized as `VARCHAR` across all tables to prevent PostgreSQL type mismatch errors
- All frontend code casts `department_id` and `year_id` to `String()` before queries
- Group activities use a normalized architecture (1 activity row + N participant rows + M mentor rows) instead of duplicating N×M rows

---

## 8. Reusable Components

### `MultiTagInput` (`app/student/components/MultiTagInput.tsx`)

A highly reusable, animated searchable multi-select component used across both Student and Staff portals for tagging peers and mentors.

**Features:**
- Fuzzy search by name or ID
- Animated tag pills with remove buttons
- Dropdown auto-closes on outside click
- Configurable `accentColor` prop
- Used in: Student Activity Log, Staff Professional Diary

### `Noticeboard` (Student & Staff variants)

Widget components that fetch and display HOD broadcasts filtered by the user's `department_id` and `target_audience`.

**Features:**
- Fetches latest 10 broadcasts
- Shows title, message, timestamp, and sender
- Scrollable container with max height
- Skeleton loading state

---

## 9. Data Export & Reporting

| Feature | Format | Location | Library |
|---|---|---|---|
| Staff Professional Diary Report | PDF | `/staff/log` | jsPDF + autoTable |
| Staff Activity Audit Report | PDF | `/staff/reports` | jsPDF + autoTable |
| Staff Activity Audit Data | CSV | `/staff/reports` | Native Blob API |
| HOD Event Proposals Report | PDF (Landscape) | `/hod/approvals` | jsPDF + autoTable |
| HOD Event Proposals Data | CSV | `/hod/approvals` | Native Blob API |
| Student Import Template | XLSX | `/staff/mentees` | SheetJS (xlsx) |

---

## 10. Rate Limiting

**File:** `lib/rate-limit.ts`

An in-memory sliding-window rate limiter implemented as a `Map<string, { count, lastReset }>`.

- **Usage:** Applied in `supabase-actions.ts` (server action) to throttle student activity updates
- **Default Config:** 5 requests per 60 seconds per UID
- **Scope Note:** In-memory only — scoped to the specific serverless function instance. For strict global rate-limiting, an external store (e.g., Redis/Upstash) would be needed.

---

## 11. Environment Variables & Configuration

### Required `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Configuration Files

| File | Purpose |
|---|---|
| `next.config.ts` | Turbopack configuration |
| `tailwind.config.ts` | Custom colors (`background`, `softPurple`, `softOrange`), Neumorphic box-shadows (`soft-ui`, `soft-ui-inner`) |
| `tsconfig.json` | Target ES2017, bundler module resolution, `@/*` path alias, React JSX transform |
| `eslint.config.mjs` | Flat config with Next.js Core Web Vitals + TypeScript presets |
| `postcss.config.mjs` | Tailwind CSS + Autoprefixer plugins |

---

## 12. Development Setup

### Prerequisites

- **Node.js** v18 or higher
- **npm** (or yarn/pnpm/bun)
- **Supabase** project with required tables and RLS policies

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd CamPulse

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Start development server
npm run dev
```

### Available Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Start development server with Turbopack |
| `build` | `next build` | Create production build |
| `start` | `next start` | Run production server |
| `lint` | `eslint` | Run ESLint checks |

### Access

Open `http://localhost:3000` in your browser.

---

## 13. Deployment

### Vercel (Recommended)

1. Push the repository to GitHub
2. Import the project on [vercel.com](https://vercel.com)
3. Set environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy

### Notes

- Vercel Analytics is pre-integrated via `@vercel/analytics/next` in the root layout
- The app is optimized for serverless deployment on Vercel's infrastructure
- Ensure Supabase RLS (Row Level Security) policies are correctly configured for production

---

## 14. Developer Notes & Conventions

1. **Type Casting:** Always cast `department_id` and `year_id` to `String()` on the frontend when dealing with mixed inputs, as PostgreSQL strictly evaluates `VARCHAR` columns.

2. **Group Activities Pattern:** Never create N × M rows for team events. Use a single `group_activities` record and link participants/mentors via junction tables to keep the database normalized.

3. **Pending-Only Deletion:** Only records with `status = "Pending"` may be deleted by the user. Approved/Rejected records are immutable.

4. **Date Constraints:**
   - Activity logs: ±15 days from today
   - Event proposals: ±30 days from today

5. **Shared Supabase Client:** All portals import the Supabase client from `app/student/supabase.ts` — this is a single shared instance.

6. **Layout Auth Guards:** Each portal's `layout.tsx` performs a database query to confirm the user belongs to the correct role on every route change.

7. **Dynamic Tab Titles:** Each layout sets `document.title` based on the current pathname for browser tab identification.

8. **Framer Motion Route Animations:** The `<main key={pathname}>` pattern forces Framer Motion to replay entrance animations on route changes.

---

## 15. Roadmap & Pending Work

- [x] Student Activity Log with Group Activity Architecture
- [x] Staff Priority Queue (dual-schema support)
- [x] Staff Mentee Management with bulk import
- [x] HOD Event Approvals with PDF/CSV export
- [x] HOD Broadcast System
- [x] HOD Student & Staff Directories with Drill-Down Dossiers
- [ ] **Final QA Testing** — End-to-end flow verification (Student → Faculty → HOD)
- [ ] **Admin Dashboard** — Replace placeholder login with full admin panel
- [ ] **Production Deployment** — Configure environment variables and deploy to Vercel
- [ ] **Redis Rate Limiting** — Replace in-memory rate limiter with distributed store for production

---

*This document was generated by exhaustively reading all 27 source files across the CamPulse project.*
