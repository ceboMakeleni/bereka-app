# Contributing to Bereka

Thank you for your interest in contributing. This guide will help you get started.

## Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (latest)
- An LNbits instance for testing Lightning payments
- Git

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd bereka-app
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install --prefix apps/web
   ```

3. **Configure environment variables:**
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

4. **Start local Supabase:**
   ```bash
   supabase start
   supabase db reset
   ```

5. **Set Edge Function secrets (for LNbits integration):**
   ```bash
   supabase secrets set LNBITS_URL=https://your-lnbits.com
   supabase secrets set LNBITS_ADMIN_KEY=your-key
   ```

6. **Run the app:**
   ```bash
   # Terminal 1: Edge Functions
   supabase functions serve

   # Terminal 2: Next.js dev server
   npm run dev
   ```

## Project Layout

| Directory | Contents |
|-----------|----------|
| `apps/web/` | Next.js frontend (App Router) |
| `apps/web/app/` | Route pages |
| `apps/web/components/ui/` | Shadcn-style UI components |
| `apps/web/lib/` | Supabase clients, TypeScript types, utilities |
| `supabase/migrations/` | SQL migration files |
| `supabase/functions/` | Deno Edge Functions |
| `supabase/functions/_shared/` | Shared modules (auth, CORS, payment processing) |
| `.github/workflows/` | CI/CD pipelines |

## Branch and PR Conventions

- Branch from `main`
- Use descriptive branch names: `feat/job-search-filters`, `fix/escrow-balance-check`, `docs/api-examples`
- Keep PRs focused on a single concern
- Write clear PR descriptions explaining what changed and why

## Code Style

### Frontend (Next.js / React)

- Use TypeScript for all new files
- Follow existing Tailwind + Shadcn patterns in `components/ui/`
- Client components use `"use client"` directive
- Use `sonner` for toast notifications
- Use the Supabase client from `lib/supabase.ts` (browser) or `lib/supabase-server.ts` (server)

### Accessibility (Mandatory)

All UI changes must meet **WCAG 2.2 Level AA**. Before submitting work:

- Set `document.title` on every new client page (`"Page Name — Bereka"`)
- Add `aria-hidden="true"` to decorative icons
- Use `role="alert" aria-live="assertive"` on error containers
- Use `aria-live="polite"` for dynamically updated content (search results, status changes)
- Never nest interactive elements (`<button>` inside `<Link>`, etc.)
- Ensure keyboard navigation works (Tab, Shift+Tab, Enter, Escape)
- Add visible labels or `aria-label` to icon-only buttons
- Test with "Reduce Motion" OS setting enabled — new animations must be disabled by the `prefers-reduced-motion` media query in `globals.css`
- Use the `<VisuallyHidden>` component from `components/ui/visually-hidden.tsx` for screen-reader-only text

See [AGENTS.md §13](AGENTS.md#13-accessibility-a11y-conventions) for the full accessibility checklist and [ACCESSIBILITY.md](ACCESSIBILITY.md) for the complete reference.

### Edge Functions (Deno)

- Use `Deno.serve()` (not the deprecated `serve` from std)
- Import Supabase client from `@supabase/supabase-js` (mapped in `deno.json`)
- Use `getAuthenticatedUser(req)` from `_shared/auth.ts` for JWT auth
- Use `createAdminClient()` from `_shared/supabase.ts` for service-role operations
- Handle CORS with `corsHeaders` from `_shared/cors.ts`
- Handle errors with try/catch and return JSON error responses

### SQL Migrations

- Create new migration files with descriptive names: `NNNN_description.sql`
- Always use `IF NOT EXISTS` / `IF EXISTS` for idempotent DDL
- Enable RLS on new tables and add appropriate policies
- Add indexes for columns used in WHERE clauses and JOINs

## Adding a New Edge Function

1. Create a directory: `supabase/functions/my-function/`
2. Add `index.ts` with the `Deno.serve()` pattern:
   ```typescript
   import { corsHeaders } from "../_shared/cors.ts";
   import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";

   Deno.serve(async (req) => {
     if (req.method === "OPTIONS") {
       return new Response("ok", { headers: corsHeaders });
     }

     try {
       const user = await getAuthenticatedUser(req);
       const supabase = createAdminClient();

       // Your logic here

       return new Response(JSON.stringify({ success: true }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     } catch (error) {
       return new Response(JSON.stringify({ error: (error as Error).message }), {
         status: 400,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }
   });
   ```
3. Test locally: `supabase functions serve my-function`
4. Document the endpoint in `API.md`

## Adding a New Migration

1. Create a new SQL file in `supabase/migrations/` with the next sequence number
2. Test locally with `supabase db reset`
3. Ensure the migration is backward-compatible (additive changes preferred)
4. Update `apps/web/lib/database.types.ts` by regenerating types:
   ```bash
   supabase gen types typescript --project-id <ref> > apps/web/lib/database.types.ts
   ```

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `supabase start` | Start local Supabase |
| `supabase stop` | Stop local Supabase |
| `supabase db reset` | Reset DB and apply migrations |
| `supabase functions serve` | Serve Edge Functions locally |
| `supabase functions deploy` | Deploy Edge Functions to hosted project |
| `supabase db push` | Push migrations to hosted project |
| `supabase secrets set KEY=VALUE` | Set Edge Function secrets |
