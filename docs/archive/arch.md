# CamPulse — Architecture Design Document

> **Version:** v2026 · **Platform:** Next.js 16 (App Router) · **31 source files · 8,347 LOC**  
> **Institution:** KKW College of Engineering · **Last Updated:** April 2026

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Client["Client Browser"]
        LP["Landing Page - Unified Login"]
        SP["Student Portal"]
        STP["Staff Portal"]
        HP["HOD Portal"]
        AP["Admin Portal"]
    end

    subgraph AppRouter["App Router"]
        RC["Root Layout - layout.tsx"]
        Pages["Page Components - Client Side"]
        Layouts["Portal Layouts - Auth Guards"]
    end

    subgraph ServerLayer["Server Layer"]
        SA["Server Actions"]
        API["API Routes - pulse-ai"]
        RL["Rate Limiter"]
    end

    subgraph External["External Services"]
        SB[("Supabase PostgreSQL")]
        GM["Google Gemini API"]
        VA["Vercel Analytics"]
    end

    Client --> AppRouter
    Client --> ServerLayer
    AppRouter --> ServerLayer
    SA --> SB
    Pages --> SB
    API --> GM
    API --> RL
    SA --> RL
    RC --> VA

    style Client fill:#f5f5f0,stroke:#A78BFA,stroke-width:2px
    style AppRouter fill:#f0f9ff,stroke:#60A5FA,stroke-width:2px
    style ServerLayer fill:#e0f2fe,stroke:#60A5FA,stroke-width:2px
    style External fill:#ecfdf5,stroke:#10B981,stroke-width:2px
```

---

## 2. Application Layer Architecture

```mermaid
graph LR
    subgraph RootApp["/ (Root)"]
        RootLayout["layout.tsx<br/>HTML Shell + Analytics"]
        GlobalCSS["globals.css<br/>Tailwind + CSS Vars"]
        LandingPage["page.tsx<br/>Unified Login"]
    end

    subgraph StudentPortal["/student"]
        SLayout["layout.tsx<br/>Purple Sidebar + Auth Guard"]
        SDash["page.tsx — Dashboard"]
        SLog["log/page.tsx — Activity Log"]
        SEvents["events/page.tsx — Event Proposals"]
        SMentor["mentorship/page.tsx — Mentorship"]
        SProfile["profile/page.tsx — Profile"]
        SComp1["components/MultiTagInput.tsx"]
        SComp2["components/Noticeboard.tsx"]
    end

    subgraph StaffPortal["/staff"]
        STLayout["layout.tsx<br/>Blue Sidebar + Auth Guard"]
        STDash["page.tsx — Command Center"]
        STApproval["approvals/page.tsx — Priority Queue"]
        STMentees["mentees/page.tsx — Mentee CRUD"]
        STEvents["events/page.tsx — Event Proposals"]
        STLog["log/page.tsx — Professional Diary"]
        STReports["reports/page.tsx — Data & Reports"]
        STDB["db-explorer/page.tsx — DB Explorer + PulseAI"]
        STProfile["profile/page.tsx — Profile"]
        STComp["components/Noticeboard.tsx"]
    end

    subgraph HODPortal["/hod"]
        HLayout["layout.tsx<br/>Emerald Sidebar + Auth Guard"]
        HDash["page.tsx — Dashboard"]
        HStudents["students/page.tsx — Student Directory"]
        HStaff["staff/page.tsx — Staff Directory"]
        HApprovals["approvals/page.tsx — Event Approvals"]
        HBroadcasts["broadcasts/page.tsx — Broadcast Composer"]
        HDB["db-explorer/page.tsx — DB Explorer + PulseAI"]
    end

    subgraph AdminPortal["/admin"]
        ALogin["page.tsx — Admin Login (Placeholder)"]
    end

    subgraph APIRoutes["/api"]
        PulseAI["pulse-ai/route.ts — NLP Query Endpoint"]
    end

    subgraph SharedLib["lib/"]
        RateLimit["rate-limit.ts — Sliding Window Limiter"]
    end

    subgraph SharedUtils["Root Utils"]
        SupaClient["student/supabase.ts — Singleton Client"]
        ServerActs["supabase-actions.ts — Server Action"]
    end

    RootLayout --> LandingPage
    LandingPage -->|Role Detection| StudentPortal
    LandingPage -->|Role Detection| StaffPortal
    LandingPage -->|Role Detection| HODPortal

    STDB -->|POST /api/pulse-ai| PulseAI
    HDB -->|POST /api/pulse-ai| PulseAI
    PulseAI -->|Import| RateLimit
    ServerActs -->|Import| RateLimit

    style StudentPortal fill:#f5f3ff,stroke:#A78BFA,stroke-width:2px
    style StaffPortal fill:#eff6ff,stroke:#60A5FA,stroke-width:2px
    style HODPortal fill:#ecfdf5,stroke:#10B981,stroke-width:2px
    style AdminPortal fill:#fff7ed,stroke:#FDBA74,stroke-width:2px
```

---

## 3. Complete File Tree (31 Files)

```
CamPulse/
├── app/
│   ├── layout.tsx ·················· Root HTML layout, Vercel Analytics, global CSS
│   ├── page.tsx ···················· Landing page — unified login (cascading role detection)
│   ├── globals.css ················· Tailwind directives, CSS custom properties
│   │
│   ├── student/ ···················· 🟣 STUDENT PORTAL (Accent: #A78BFA)
│   │   ├── supabase.ts ············ Singleton Supabase client (shared across ALL portals)
│   │   ├── layout.tsx ············· Collapsible sidebar, mobile bottom bar, auth guard
│   │   ├── page.tsx ··············· Dashboard — bento grid, engagement pulse, noticeboard
│   │   ├── log/page.tsx ··········· Dual-tab activity logger (Log New + My History)
│   │   ├── events/page.tsx ········ Event proposal form & history tracker
│   │   ├── mentorship/page.tsx ···· Mentor profile card & validation history
│   │   ├── profile/page.tsx ······· Read-only academic profile & password reset
│   │   └── components/
│   │       ├── MultiTagInput.tsx ·· Reusable animated multi-select tag component
│   │       └── Noticeboard.tsx ···· HOD broadcast reader widget (student variant)
│   │
│   ├── staff/ ····················· 🔵 STAFF PORTAL (Accent: #60A5FA)
│   │   ├── layout.tsx ············· Staff sidebar, mobile nav, auth guard, notification badges
│   │   ├── page.tsx ··············· Command Center — metrics, mentees grid, noticeboard
│   │   ├── approvals/page.tsx ····· Priority Queue — approve/reject student activities
│   │   ├── mentees/page.tsx ······· Mentee CRUD, bulk .xlsx import, drilldown timelines
│   │   ├── events/page.tsx ········ Faculty event proposal form & history
│   │   ├── log/page.tsx ··········· Professional Diary — slide-over form, timeline, PDF
│   │   ├── reports/page.tsx ······· Data & Reports — date filtering, PDF/CSV export
│   │   ├── db-explorer/page.tsx ··· DB Explorer — table browser + PulseAI NLP (812 LOC)
│   │   ├── profile/page.tsx ······· Faculty profile & password management
│   │   └── components/
│   │       └── Noticeboard.tsx ···· HOD broadcast reader widget (staff variant)
│   │
│   ├── hod/ ······················· 🟢 HOD ECOSYSTEM (Accent: #10B981)
│   │   ├── layout.tsx ············· HOD sidebar, mobile nav, auth guard
│   │   ├── page.tsx ··············· Dashboard — pending approvals, counts, action center
│   │   ├── approvals/page.tsx ····· Event Approvals — 3-tab (pending/approved/rejected)
│   │   ├── broadcasts/page.tsx ···· Broadcast Composer — send notices to dept
│   │   ├── students/page.tsx ······ Student Directory — search, drilldown dossier
│   │   ├── staff/page.tsx ········· Staff Directory — diary + mentees tabs
│   │   └── db-explorer/page.tsx ··· DB Explorer — table browser + PulseAI NLP
│   │
│   ├── admin/ ····················· 🟠 ADMIN PORTAL (Accent: #FDBA74)
│   │   └── page.tsx ··············· Standalone admin login (hardcoded, placeholder)
│   │
│   └── api/ ······················· SERVER-SIDE API ROUTES
│       └── pulse-ai/route.ts ····· PulseAI NLP endpoint (Gemini model fallback chain)
│
├── lib/
│   └── rate-limit.ts ·············· In-memory sliding-window rate limiter
│
├── supabase-actions.ts ············ Server action for rate-limited student activity updates
├── tailwind.config.ts ············· Custom Neumorphic design tokens
├── next.config.ts ················· Turbopack configuration
├── tsconfig.json ·················· TypeScript compiler options, @/* path alias
├── postcss.config.mjs ············· PostCSS + Autoprefixer
├── eslint.config.mjs ·············· ESLint flat config (Next.js + TS)
└── package.json ··················· Dependencies & scripts
```

---

## 4. Authentication & Session Flow

```mermaid
sequenceDiagram
    actor User
    participant LP as Landing Page<br/>(app/page.tsx)
    participant SB as Supabase
    participant LS as localStorage
    participant Layout as Portal Layout<br/>(Auth Guard)

    User->>LP: Enter UID + Password
    LP->>LP: Normalize ID → UPPERCASE

    LP->>SB: Query students.uid (ilike)
    alt Found in students
        SB-->>LP: student record
        LP->>LP: Validate password
        LP->>LS: Set campuspulse_uid = student.uid
        LP->>User: Redirect → /student
    else Not found
        LP->>SB: Query staff.suid (ilike)
        alt Found in staff
            SB-->>LP: staff record
            LP->>LP: Validate password
            LP->>LS: Set campuspulse_uid = staff.suid
            LP->>User: Redirect → /staff
        else Not found
            LP->>SB: Query hods.huid (ilike)
            alt Found in hods
                SB-->>LP: hod record
                LP->>LP: Validate password
                LP->>LS: Set campuspulse_uid = hod.huid
                LP->>User: Redirect → /hod
            else Not found
                LP->>User: Error "User not found"
            end
        end
    end

    User->>Layout: Navigate to portal route
    Layout->>LS: Read campuspulse_uid
    alt UID missing
        Layout->>User: Redirect → / (login)
    else UID found
        Layout->>SB: Query role-specific table
        alt User exists in table
            Layout->>User: Render portal content
        else User not in table
            Layout->>User: Redirect → / (login)
        end
    end
```

---

## 5. Database Schema (Entity-Relationship Diagram)

```mermaid
erDiagram
    departments {
        VARCHAR department_id PK
        VARCHAR department_name
    }

    academic_years {
        VARCHAR year_id PK
        VARCHAR year_name
    }

    students {
        VARCHAR uid PK
        VARCHAR name
        VARCHAR division
        VARCHAR department_id FK
        VARCHAR year_id FK
        VARCHAR batch
        VARCHAR gender
        DATE dob
        VARCHAR password
        VARCHAR email
        VARCHAR phone
    }

    staff {
        VARCHAR suid PK
        VARCHAR name
        VARCHAR designation
        VARCHAR department_id FK
        VARCHAR password
    }

    hods {
        VARCHAR huid PK
        VARCHAR name
        VARCHAR department_id FK
        VARCHAR password
    }

    class_coordinators {
        VARCHAR suid FK
        VARCHAR division
    }

    group_activities {
        UUID id PK
        VARCHAR title
        VARCHAR category
        DATE start_date
        DATE end_date
        TIME start_time
        TIME end_time
        TEXT description
        BOOLEAN leave_required
        VARCHAR created_by
        TIMESTAMP created_at
    }

    activity_participants {
        UUID activity_id FK
        VARCHAR student_uid FK
        VARCHAR status
    }

    activity_mentors {
        UUID activity_id FK
        VARCHAR staff_suid FK
    }

    student_activities {
        UUID activity_id PK
        VARCHAR uid FK
        VARCHAR suid FK
        VARCHAR activity_name
        VARCHAR status
        TEXT feedback
        BOOLEAN leave_required
        TIMESTAMP created_at
    }

    staff_activities {
        UUID id PK
        VARCHAR suid FK
        VARCHAR activity_name
        VARCHAR type
        DATE date
        VARCHAR location
        TEXT description
        VARCHAR proof_link
        TIMESTAMP created_at
    }

    staff_activity_comentors {
        UUID activity_id FK
        VARCHAR staff_suid FK
    }

    staff_activity_participants {
        UUID activity_id FK
        VARCHAR student_uid FK
    }

    event_proposals {
        UUID id PK
        VARCHAR title
        VARCHAR type
        VARCHAR club_name
        TEXT description
        TIMESTAMP start_date
        TIMESTAMP end_date
        VARCHAR venue
        INT expected_footfall
        DECIMAL budget
        VARCHAR status
        VARCHAR department_id FK
        VARCHAR submitted_by
        TIMESTAMP created_at
    }

    broadcasts {
        UUID id PK
        VARCHAR title
        TEXT message
        VARCHAR target_audience
        VARCHAR department_id FK
        VARCHAR created_by
        TIMESTAMP created_at
    }

    departments ||--o{ students : "has"
    departments ||--o{ staff : "has"
    departments ||--o{ hods : "has"
    departments ||--o{ event_proposals : "scoped to"
    departments ||--o{ broadcasts : "scoped to"
    academic_years ||--o{ students : "enrolled in"
    staff ||--o{ class_coordinators : "coordinates"
    staff ||--o{ student_activities : "mentors"
    students ||--o{ student_activities : "logs"
    group_activities ||--o{ activity_participants : "includes"
    group_activities ||--o{ activity_mentors : "supervised by"
    students ||--o{ activity_participants : "participates"
    staff ||--o{ activity_mentors : "mentors"
    staff ||--o{ staff_activities : "logs"
    staff_activities ||--o{ staff_activity_comentors : "co-mentored"
    staff_activities ||--o{ staff_activity_participants : "involves"
```

---

## 6. Technology Stack Diagram

```mermaid
graph TB
    subgraph Frontend["Frontend Layer"]
        NextJS["Next.js 16<br/>(App Router)"]
        React["React 19.2.4"]
        TS["TypeScript 5"]
        TW["Tailwind CSS 3.4<br/>(Neumorphic Tokens)"]
        FM["Framer Motion 12<br/>(Animations)"]
        LR["Lucide React<br/>(Icons)"]
    end

    subgraph Backend["Backend / Server Layer"]
        AppRouter["Next.js App Router<br/>(File-System Routes)"]
        ServerActions["Server Actions<br/>('use server')"]
        APIRoutes["API Routes<br/>(route.ts handlers)"]
    end

    subgraph DataLayer["Data & AI Layer"]
        Supabase["Supabase<br/>PostgreSQL + RLS"]
        Gemini["Google Gemini API<br/>(2.0-flash → lite fallback)"]
    end

    subgraph ExportLayer["Data Export"]
        JSPDF["jsPDF + autoTable<br/>(PDF Generation)"]
        SheetJS["SheetJS / xlsx<br/>(Excel Import/Export)"]
        BlobAPI["Native Blob API<br/>(CSV Export)"]
    end

    subgraph DevOps["DevOps & Tooling"]
        Vercel["Vercel<br/>(Deployment)"]
        VAnalytics["Vercel Analytics"]
        Turbopack["Turbopack<br/>(Dev Bundler)"]
        ESLint["ESLint 9<br/>(Flat Config)"]
        PostCSS["PostCSS +<br/>Autoprefixer"]
    end

    Frontend --> Backend
    Backend --> DataLayer
    Frontend --> ExportLayer

    style Frontend fill:#f5f3ff,stroke:#A78BFA,stroke-width:2px
    style Backend fill:#eff6ff,stroke:#60A5FA,stroke-width:2px
    style DataLayer fill:#ecfdf5,stroke:#10B981,stroke-width:2px
    style ExportLayer fill:#fff7ed,stroke:#FDBA74,stroke-width:2px
    style DevOps fill:#f1f5f9,stroke:#94a3b8,stroke-width:2px
```

---

## 7. PulseAI — NLP Query Pipeline

```mermaid
sequenceDiagram
    actor Staff
    participant UI as DB Explorer<br/>(Client)
    participant API as /api/pulse-ai<br/>(Server)
    participant RL as Rate Limiter
    participant GM as Gemini API

    Staff->>UI: Type "show female students from AIDS"
    UI->>UI: Fetch column schemas for all tables
    UI->>API: POST { prompt, tables[] }

    API->>RL: checkRateLimit(IP, 10, 60s)
    alt Rate Limited
        RL-->>API: false
        API-->>UI: 429 Too Many Requests
    else Allowed
        RL-->>API: true
        API->>API: Build system prompt with schema
        
        loop Model Fallback Chain
            API->>GM: gemini-2.0-flash
            alt Success
                GM-->>API: JSON response
            else 429 Rate Limited
                API->>GM: gemini-2.0-flash-lite
                alt Success
                    GM-->>API: JSON response
                else 429 Rate Limited
                    API->>GM: gemini-2.5-flash-lite
                end
            end
        end

        API->>API: Parse & validate JSON
        API->>API: Validate table ID & column names
        API-->>UI: { table, filters[] }
    end

    UI->>UI: Switch active table
    UI->>UI: Apply filter rules
    UI->>UI: Re-fetch filtered data from Supabase
    UI-->>Staff: Render filtered results
```

---

## 8. Data Flow — Activity Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: Student opens Log form

    Draft --> Submitted: Submit Activity
    note right of Submitted
        Inserts into:
        • group_activities (parent)
        • activity_participants (students)
        • activity_mentors (staff)
    end note

    Submitted --> Pending: Status = "Pending"

    Pending --> Approved: Staff clicks Approve
    Pending --> Rejected: Staff clicks Reject
    Pending --> Deleted: Student deletes (Pending only)

    Approved --> [*]: Immutable record
    Rejected --> [*]: Immutable record
    Deleted --> [*]: Removed from DB

    note right of Approved
        Staff can provide
        feedback comments
    end note
```

---

## 9. Event Proposal Workflow

```mermaid
flowchart LR
    subgraph Submitters["Submitters"]
        S["🟣 Student"]
        F["🔵 Faculty"]
    end

    subgraph Pipeline["Approval Pipeline"]
        EP[("event_proposals<br/>table")]
        HOD{"🟢 HOD Review"}
    end

    subgraph Outcomes["Outcomes"]
        A["✅ Approved"]
        R["❌ Rejected"]
        EX["📄 PDF/CSV Export"]
    end

    S -->|Submit Proposal| EP
    F -->|Submit Proposal| EP
    EP -->|department_id scoping| HOD
    HOD -->|Approve| A
    HOD -->|Reject| R
    A --> EX
    R --> EX
```

---

## 10. Broadcast System

```mermaid
flowchart TD
    HOD["🟢 HOD<br/>/hod/broadcasts"]
    
    HOD -->|Compose & Send| DB[("broadcasts table<br/>department_id scoped")]
    
    DB --> Filter{"target_audience?"}
    
    Filter -->|"everyone"| Both
    Filter -->|"students"| StudentsOnly
    Filter -->|"staff"| StaffOnly

    subgraph Both["All Users"]
        SN["🟣 Student Noticeboard<br/>components/Noticeboard.tsx"]
        STN["🔵 Staff Noticeboard<br/>components/Noticeboard.tsx"]
    end

    subgraph StudentsOnly["Students Only"]
        SN2["🟣 Student Noticeboard"]
    end

    subgraph StaffOnly["Staff Only"]
        STN2["🔵 Staff Noticeboard"]
    end
```

---

## 11. Portal Feature Matrix

| Feature | 🟣 Student | 🔵 Staff | 🟢 HOD | 🟠 Admin |
|---|:---:|:---:|:---:|:---:|
| Dashboard with Metrics | ✅ | ✅ | ✅ | ❌ |
| Activity Logging | ✅ | ✅ (Diary) | ❌ | ❌ |
| Activity Approvals | ❌ | ✅ | ❌ | ❌ |
| Event Proposals | ✅ | ✅ | ❌ | ❌ |
| Event Approvals | ❌ | ❌ | ✅ | ❌ |
| Mentee Management | ❌ | ✅ (CRUD + .xlsx) | ❌ | ❌ |
| Student Directory | ❌ | ❌ | ✅ | ❌ |
| Staff Directory | ❌ | ❌ | ✅ | ❌ |
| Broadcasts (Send) | ❌ | ❌ | ✅ | ❌ |
| Noticeboard (Read) | ✅ | ✅ | ❌ | ❌ |
| PDF/CSV Export | ❌ | ✅ | ✅ | ❌ |
| Bulk Import (.xlsx) | ❌ | ✅ | ❌ | ❌ |
| DB Explorer + PulseAI | ❌ | ✅ | ✅ | ❌ |
| Mentorship View | ✅ | ❌ | ❌ | ❌ |
| Profile & Password | ✅ | ✅ | ❌ | ❌ |

---

## 12. Design System Architecture

```mermaid
graph TD
    subgraph DesignTokens["Tailwind Design Tokens (tailwind.config.ts)"]
        BG["Background: #F5F5F0<br/>(Warm Cream)"]
        SP["softPurple: #A78BFA"]
        SO["softOrange: #FDBA74"]
        SUI["shadow soft-ui:<br/>8px 8px 16px rgba(0,0,0,0.05),<br/>-8px -8px 16px rgba(255,255,255,0.8)"]
        SUII["shadow soft-ui-inner:<br/>inset 4px 4px 8px rgba(0,0,0,0.05),<br/>inset -4px -4px 8px rgba(255,255,255,0.8)"]
    end

    subgraph UIPatterns["UI Patterns"]
        Cards["Cards<br/>rounded-2rem to 3rem<br/>+ outer soft shadows"]
        Inputs["Inputs<br/>Inset-shadow 'sunken' fields<br/>No visible borders"]
        Buttons["Buttons<br/>Pill-shaped rounded-full<br/>Colored drop shadows"]
        Nav["Navigation<br/>Collapsible sidebar (desktop)<br/>Fixed bottom bar (mobile)"]
    end

    subgraph RoleAccents["Role-Based Accent Colors"]
        Student["🟣 Student: #A78BFA"]
        StaffC["🔵 Staff: #60A5FA"]
        HODC["🟢 HOD: #10B981"]
        AdminC["🟠 Admin: #FDBA74"]
    end

    subgraph Animation["Animation Layer (Framer Motion)"]
        Stagger["Staggered reveals<br/>(containerVars + itemVars)"]
        Spring["Spring physics<br/>(stiffness: 300, damping: 24)"]
        HoverTap["Hover/Tap scale<br/>(whileHover, whileTap)"]
        Presence["AnimatePresence<br/>(route transitions)"]
        Toast["Toast Notifications<br/>(slide-in bottom-right)"]
    end

    DesignTokens --> UIPatterns
    RoleAccents --> UIPatterns
    Animation --> UIPatterns
```

---

## 13. Deployment Architecture

```mermaid
graph LR
    subgraph Dev["Development"]
        Local["localhost:3000<br/>npm run dev"]
        TB["Turbopack<br/>(HMR)"]
    end

    subgraph Build["Build Pipeline"]
        NB["next build<br/>(Production)"]
        ESL["ESLint Check"]
        TSC["TypeScript<br/>Compilation"]
    end

    subgraph Prod["Production (Vercel)"]
        Edge["Vercel Edge<br/>Network"]
        Serverless["Serverless<br/>Functions"]
        Static["Static Assets<br/>CDN"]
    end

    subgraph Services["External Services"]
        SB[(Supabase Cloud)]
        GeminiCloud["Gemini API"]
        Analytics["Vercel Analytics"]
    end

    Dev --> Build
    Build --> Prod
    Prod --> Services

    style Dev fill:#fff7ed,stroke:#FDBA74
    style Prod fill:#ecfdf5,stroke:#10B981
```

---

## 14. Environment Configuration

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase anonymous key (RLS enforced) |
| `GEMINI_API_KEY` | Server only | Google Gemini API key for PulseAI |

---

## 15. Rate Limiting Architecture

```mermaid
flowchart TD
    subgraph Limiter["In-Memory Rate Limiter (lib/rate-limit.ts)"]
        Map["Map<string, {count, lastReset}>"]
        Check{"count >= limit<br/>within windowMs?"}
    end

    subgraph Consumers["Consumers"]
        SA["supabase-actions.ts<br/>5 req / 60s per UID"]
        AI["pulse-ai/route.ts<br/>10 req / 60s per IP"]
    end

    SA -->|checkRateLimit| Check
    AI -->|checkRateLimit| Check
    Check -->|Allowed| Pass["✅ Proceed"]
    Check -->|Blocked| Reject["❌ 429 / Error thrown"]

    note["⚠️ In-memory only<br/>Scoped to serverless instance<br/>Not globally distributed"]
```

---

## 16. Key Architectural Decisions

| Decision | Rationale |
|---|---|
| **Unified login page** (cascading table queries) | Simplifies UX — single entry point for all roles |
| **localStorage session** (not JWT/cookies) | Lightweight client-only auth; acceptable for internal college tool |
| **Singleton Supabase client** (`student/supabase.ts`) | Shared across all portals to avoid multiple instances |
| **Dual activity schemas** (legacy + group) | Backward compatibility with original `student_activities` table |
| **Normalized group activities** (1:N:M) | Avoids N×M row duplication for multi-participant events |
| **Client-side PDF/CSV generation** | No server load; jsPDF + autoTable runs entirely in browser |
| **Gemini model fallback chain** | Resilience against 429 rate limits from individual models |
| **`department_id` as VARCHAR** | Prevents PostgreSQL type mismatch across tables |
| **`"use client"` on all pages** | Full Framer Motion animation support; no SSR constraints |
| **In-memory rate limiter** | Good enough for single-instance; Redis upgrade planned |

---

*Generated from exhaustive analysis of all 31 source files (8,347 LOC) across the CamPulse project.*
