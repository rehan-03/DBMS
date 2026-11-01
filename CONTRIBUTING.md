# Contributing to CampusPulse

1. Use Node.js 22 or newer and run `npm ci`.
2. Copy `.env.local.example` to `.env.local` and configure a development MongoDB database.
3. Create a branch for the change, for example `codex/fix-event-history`.
4. Run `npm run dev` and check the relevant student, faculty, and HOD workflows.
5. Before submitting a change, run `npm run typecheck` and `npm run build`.

`npm run lint` is available for reviewing ESLint findings. The inherited codebase still contains legacy lint findings; the CI workflow currently checks TypeScript and the production build.

## Working with Next.js

Read [AGENTS.md](AGENTS.md). This project requires consulting the installed Next.js guides in `node_modules/next/dist/docs/` before changing framework APIs or conventions.

## Working with data

- Use a separate development database. `npm run seed` only accepts an empty database and never resets existing records.
- Never commit `.env.local`, actual database credentials, exports of real student records, or temporary verification files.
- Keep mutation authorization on the server. A browser navigation guard is not a substitute for checking permissions in an action or API route.
- Check the activity and event workflows across separate browser profiles when testing multiple roles.

## Pull requests

Describe the problem, the changed behavior, and the checks performed. Include desktop and mobile screenshots for interface changes. Call out any schema or environment-variable changes so another developer can reproduce the setup.
