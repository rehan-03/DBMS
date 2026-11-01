# CampusPulse

[![Build and typecheck](https://github.com/rehan-03/DBMS/actions/workflows/ci.yml/badge.svg)](https://github.com/rehan-03/DBMS/actions/workflows/ci.yml)

A college activity and event management application for **students, faculty, and heads of department**, built with Next.js, TypeScript, and MongoDB.

Students record participation and propose events, faculty review activities and maintain professional diaries, and HODs approve proposals and publish department notices. The interface includes responsive workspaces and optional one-click demo logins.

![CampusPulse sign-in page](docs/screenshots/sign-in.png)

## Features

| Workspace | Main tasks |
| --- | --- |
| Student | Activity logging, participant and mentor tagging, proof submission, event proposals, mentorship, profile management |
| Faculty | Activity review, student directory and imports, professional diary, event proposals, PDF/CSV reports |
| HOD | Department overview, event approval/rejection, student and faculty directories, notices and polls |

Shared features include session-aware navigation, mobile menus, proposal history, status updates across accounts, and a faculty/HOD database explorer.

## Technology

- **Application:** Next.js 16 App Router, React 19, TypeScript
- **Interface:** Tailwind CSS 3, Lucide icons, Framer Motion in supporting screens
- **Database:** MongoDB 7 Node.js driver; MongoDB Atlas or a local MongoDB server
- **Authentication:** NextAuth credentials provider, JWT sessions, bcrypt password verification
- **Reports/imports:** jsPDF, jsPDF AutoTable, SheetJS
- **Optional assistant:** Gemini-powered natural-language database filters

This version uses **MongoDB**, not Supabase. Files such as `app/student/supabase.ts` and `lib/supabase-server.ts` retain their old names as compatibility exports for the MongoDB adapters.

## Requirements

- Node.js **22 or newer** and npm. `.nvmrc` selects Node 22.
- A MongoDB deployment and a database user with access to the application database.
- For Atlas, network access must permit the computer or server running the application.

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/rehan-03/DBMS.git
cd DBMS
npm ci
```

### 2. Configure the environment

On Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

On macOS/Linux:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your own values:

```dotenv
MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=campulse
NEXTAUTH_SECRET=replace-with-a-random-secret
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_MODE=false
```

Generate a random authentication secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the result into `NEXTAUTH_SECRET`. If your database password contains special characters, use the correctly URL-encoded password in the connection string. For a local server, `MONGODB_URI=mongodb://127.0.0.1:27017` is sufficient; the application selects `MONGODB_DB` separately.

Actual credentials belong in `.env.local`, which is ignored by Git. The committed example contains placeholders only.

### 3. Add demo data to an empty database

```bash
npm run seed
```

This creates sample departments, academic years, users, coordinator mappings, activities, event proposals, and notices. **It refuses to run if the database already contains documents**, preserving existing data. It is not a reset or data-import command.

Skip this step if you are connecting to an existing CampusPulse database.

### 4. Run the application

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**.

For the compiled application, which avoids development compilation overhead:

```bash
npm run build
npm start
```

Both development and build scripts explicitly use Webpack. `npm start` serves the existing production build.

## Demo accounts

| Role | College ID | Password |
| --- | --- | --- |
| Student | `2023CS001` | `student123` |
| Student | `2023CS002` | `student123` |
| Student | `2023CS003` | `student123` |
| Faculty | `STAFF101` | `staff123` |
| Faculty | `STAFF102` | `staff123` |
| HOD | `HOD101` | `hod123` |

The development sign-in page shows Student, Faculty, and HOD demo buttons. To show them in a production **demo** build, set `NEXT_PUBLIC_DEMO_MODE=true` **before** running `npm run build`. The buttons use the sample accounts above; they do not create accounts or bypass authentication.

Use separate browser profiles, another browser, or a private window to test different accounts at the same time. Normal tabs in the same browser profile share the session.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Create the production application |
| `npm start` | Serve the production build |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm run lint` | Review ESLint findings |
| `npm run seed` | Initialize an empty database with sample data |
| `npm run view-db` | List collections and document counts |
| `npm run view-db -- group_activities` | Print up to ten recent student activity records |
| `npm run hash-passwords` | Convert existing plaintext account passwords to bcrypt hashes |

Database utility scripts read `.env.local`; the viewer omits password fields and does not print the connection string.

## Where the data lives

Use Atlas Data Explorer, MongoDB Compass, or `npm run view-db` to inspect the database named by `MONGODB_DB` (default: `campulse`). A collection appears after its first insert.

| Collections | Stored data |
| --- | --- |
| `students`, `staff`, `hods` | Profiles, role identifiers and account passwords/hashes |
| `departments`, `academic_years`, `class_coordinators` | Academic reference data and mentor mappings |
| `group_activities` | Shared student activity information |
| `activity_participants` | Participants and their individual approval/proof statuses |
| `activity_mentors` | Faculty assigned to student activities |
| `student_activities` | Older student activity records |
| `staff_activities` | Faculty professional diary entries |
| `staff_activity_comentors`, `staff_activity_participants` | Diary collaborators and student participants |
| `event_proposals` | Event details, owner, department and decision |
| `broadcasts`, `broadcast_rsvps` | Department notices and poll responses |

Student activity approval follows `Pending → Pending Proof → Proof Submitted → Approved`, with rejection available during review. Event proposals use `pending`, `approved`, and `rejected`.

Authenticated activity views poll every 15 seconds and refresh when you return to a tab; hidden tabs skip polling reads. These are request-based updates, not database change streams.

## Project structure

```text
app/
  actions/            Server-side mutations and profile reads
  api/
    auth/             NextAuth routes
    dashboard/        Combined role-scoped dashboard response
    events/           Combined event profile/history response
    mongo/            Authenticated compatibility reads
    pulse-ai/         Optional natural-language filter assistant
  components/         Shared portal shell and overview
  student/            Student activity, event and profile screens
  staff/              Review queue, students, diary and reports
  hod/                Department directories, approvals and notices
lib/                  Authentication, MongoDB adapters and shared helpers
scripts/              Demo setup, database inspection and password migration
public/               College mark and static assets
docs/
  ARCHITECTURE.md     Current MongoDB design and application boundaries
  screenshots/       Screenshots of the demo workspaces
  archive/           Historical Supabase-era notes
instrumentation.ts    Database warm-up at server startup
.env.local.example    Safe environment template
```

## Screenshots

### Student overview

![Student overview](docs/screenshots/student-overview.png)

### Faculty overview

![Faculty overview](docs/screenshots/faculty-overview.png)

### HOD overview

![HOD overview](docs/screenshots/hod-overview.png)

Screenshots use the seeded demonstration records, not a live institution's student dataset.

## Environment reference

| Variable | Required | Meaning |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Server-side MongoDB connection string |
| `MONGODB_DB` | Recommended | Application database; defaults to `campulse` |
| `NEXTAUTH_SECRET` | Yes | Random secret used for authentication sessions |
| `NEXTAUTH_URL` | Yes | Application origin, such as `http://localhost:3000` |
| `NEXT_PUBLIC_DEMO_MODE` | No | Show sample-account buttons in a production demo build |
| `MONGODB_DNS_SERVERS` | No | Comma-separated DNS resolver override for Atlas SRV lookup problems |
| `GEMINI_API_KEY` | No | Enables the database explorer's natural-language filter assistant |

`NEXT_PUBLIC_DEMO_MODE` is compiled into the browser bundle, so rebuild after changing it. Never put a database URI, authentication secret, or API key in a variable prefixed with `NEXT_PUBLIC_`.

## Verification and CI

```bash
npm run typecheck
npm run build
```

GitHub Actions runs a locked dependency installation, TypeScript checking, and the production build on pushes and pull requests. It builds without Atlas credentials; it does not seed a database or run live database tests.

The inherited application still has legacy ESLint findings. `npm run lint` is provided for reviewing them and is not currently a required CI check.

During local verification of the MongoDB version, all three demo roles were checked in the browser at desktop, tablet, and phone widths. Event submission, HOD approval, pending deletion, activity creation, proof submission, and faculty approval were also exercised with temporary Atlas records that were removed afterward. Those local verification scripts are not a committed automated integration-test suite.

## Deployment notes

Deploy with a host that supports a Next.js Node.js application; GitHub Pages alone cannot run its authentication, API routes, or server actions.

1. Configure the server environment variables above.
2. Configure Atlas network access for the application server.
3. Set `NEXTAUTH_URL` to the deployed origin.
4. Set `NEXT_PUBLIC_DEMO_MODE=false` for a real-account installation.
5. Update the public site URLs in `app/layout.tsx`, `app/robots.ts`, and `app/sitemap.ts` for your deployment.
6. Install with `npm ci`, build with `npm run build`, and run with `npm start` (or the hosting provider's Next.js runtime).

The repository is a college project/demo. [Current architecture](docs/ARCHITECTURE.md#application-boundaries) describes existing authorization, legacy-password, admin-placeholder, and file-storage limitations; it is not presented as a production-ready institutional system.

## Troubleshooting

- **Atlas SRV DNS errors:** verify the cluster hostname and network connection. If your Node process cannot use the default resolver, optionally set `MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` and restart.
- **Authentication fails on a new database:** the credentials provider needs account documents. Seed an empty demo database, or import your existing application records.
- **A form reports that the login changed:** reopen it from the current role's workspace. Use separate browser profiles for simultaneous role testing.
- **The first development visit is slow:** Next.js compiles routes on demand in development. Use `npm run build` followed by `npm start` when demonstrating the app.
- **The seed command refuses to run:** existing records were detected. Choose a new empty development database instead of deleting your data.
- **Attachment upload fails:** binary file storage is not implemented in MongoDB mode. Attachment URLs are supported; add a real file-storage integration for uploads.

## Documentation and history

- [Current architecture](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Historical documentation](docs/archive/README.md)
- [Agent instructions](AGENTS.md)

The Git history preserves the earlier CamPulse implementation. This repository's previous LedgerLite application is also retained in its earlier commits; CampusPulse is the current project on `main`.
