# AgencyWatch

AgencyWatch is a global website monitoring platform for freelancers and small web agencies that manage multiple client websites. This Phase 1 build provides the application foundation and a working website management dashboard. The monitoring engine is intentionally not implemented yet.

## Technology stack

- Next.js (App Router)
- TypeScript (strict mode)
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Authentication
- @supabase/ssr
- Zod

## Installation

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```bash
cp .env.example .env.local
```

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon/public key
- `NEXT_PUBLIC_SITE_URL` — site URL (used for auth redirects)

Never commit real secrets.

## Supabase project setup

1. Create a Supabase project.
2. In the Supabase dashboard, enable Email authentication (and configure email templates/redirects as needed).
3. Set the Site URL / redirect URLs to include `http://localhost:3000/auth/callback`.

## Database migration instructions

Run the SQL in `supabase/migrations/0001_init.sql` against your Supabase database. You can do this via the Supabase SQL editor or the Supabase CLI:

```bash
supabase db push
```

The migration creates the `organizations`, `organization_members`, and `monitors` tables, indexes, constraints, Row Level Security policies, and a trigger that provisions a default organization and owner membership for each newly registered user.

## Local development

```bash
npm run dev
```

Open http://localhost:3000.

## Build and test commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
```

## Notes

- Without Supabase credentials, the UI renders but authentication and data access will not work. Configure the environment variables above.
- Monitoring checks are not implemented in this phase.
