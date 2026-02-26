# AGENTS.md -- Bereka Codebase Guide for AI Agents

This document is the authoritative reference for AI agents working on the Bereka codebase. Follow these conventions exactly. Do not deviate from the patterns described here without explicit instruction from the user.

---

## 1. Project Overview

Bereka is a Lightning-only custodial micro-task marketplace MVP. Workers earn sats for completing tasks. Creators post jobs, fund escrow, and pay workers on approval. The platform takes a 5% fee.

**Hard constraints:**
- Custodial demo only -- in-app balance, no withdrawals, no on-chain Bitcoin.
- Creators must fund escrow upfront from their in-app balance.
- Disputes are admin-only decisions.
- LNbits is the Lightning backend (one wallet per user).
- No nodemailer -- email uses fetch-based SMTP API (Deno compatible).

---

## 2. Repository Structure

```
bereka-app/
├── apps/web/                      # Next.js 16 frontend (App Router)
│   ├── app/                       # Route pages
│   │   ├── layout.tsx             # Root layout (fonts, Toaster)
│   │   ├── page.tsx               # Landing page (public)
│   │   ├── login/page.tsx         # Email/password login
│   │   ├── signup/page.tsx        # Signup + profile + wallet creation
│   │   ├── privacy/page.tsx       # Privacy policy (static)
│   │   ├── terms/page.tsx         # Terms of service (static)
│   │   └── dashboard/             # Auth-protected (via middleware)
│   │       ├── layout.tsx         # Sidebar nav, profile loading
│   │       ├── page.tsx           # Dashboard home (server component)
│   │       ├── wallet/page.tsx    # Balance + Lightning top-up
│   │       ├── jobs/page.tsx      # Job marketplace with filters
│   │       ├── jobs/create/page.tsx  # Create job + fund escrow
│   │       ├── jobs/[id]/page.tsx    # Job detail (apply/accept/submit/approve/dispute)
│   │       ├── admin/page.tsx     # Admin: disputes + ledger (role-gated)
│   │       └── settings/page.tsx  # Profile + wallet management
│   ├── components/ui/             # Shadcn-style UI primitives
│   ├── lib/
│   │   ├── supabase.ts            # Browser Supabase client factory
│   │   ├── supabase-server.ts     # Server Supabase client factory
│   │   ├── database.types.ts      # Auto-generated Supabase types
│   │   ├── types.ts               # App-level TypeScript types
│   │   └── utils.ts               # cn() class merge utility
│   ├── middleware.ts              # Auth route protection
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   ├── tsconfig.json
│   └── package.json
├── supabase/
│   ├── config.toml                # Local Supabase config
│   ├── migrations/
│   │   └── 0001_initial_schema.sql  # Single consolidated migration
│   └── functions/                 # Deno Edge Functions
│       ├── deno.json              # Deno compiler options + import map
│       ├── _shared/               # Shared modules (NEVER duplicate logic)
│       │   ├── auth.ts            # getAuthenticatedUser, verifyWebhookSecret
│       │   ├── cors.ts            # CORS headers
│       │   ├── supabase.ts        # createAdminClient, createUserClient
│       │   └── processIncomingPayment.ts  # Centralized payment processing
│       ├── create-wallet/index.ts
│       ├── create-invoice/index.ts
│       ├── check-payment/index.ts
│       ├── lnbits-webhook/index.ts
│       ├── fund-escrow/index.ts
│       ├── approve-payout/index.ts
│       ├── resolve-dispute/index.ts
│       └── send-notification/index.ts
├── .github/workflows/
│   └── deploy.yml                 # CI/CD: migrations + edge functions
├── .gitignore
├── .env.example                   # Env var reference
├── package.json                   # Root scripts (dev, build, supabase)
├── README.md
├── API.md
├── CONTRIBUTING.md
├── TROUBLESHOOTING.md
└── AGENTS.md                      # This file
```

**Rules:**
- Do NOT create new top-level directories.
- Do NOT move files between directories without explicit instruction.
- Frontend code lives in `apps/web/`. Backend logic lives in `supabase/functions/`.
- Shared Edge Function logic lives in `supabase/functions/_shared/`. Never duplicate shared code into individual function directories.

---

## 3. Tech Stack (locked)

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js (App Router) | 16.x |
| UI library | React | 19.x |
| Styling | Tailwind CSS | v4 (via `@tailwindcss/postcss`) |
| UI components | Shadcn UI pattern (CVA + Radix) | -- |
| Toasts | Sonner | latest |
| Icons | Lucide React | latest |
| QR codes | react-qr-code | latest |
| Auth + DB + Storage | Supabase (SSR) | latest |
| Edge Functions | Deno (Supabase Edge) | -- |
| Lightning | LNbits API | -- |
| Deploy | Vercel (frontend), Supabase (backend) | -- |

**Do NOT add new major dependencies** without explicit instruction. Prefer existing patterns over introducing new libraries.

---

## 4. Design System

### 4.1 Tailwind v4 Configuration

There is **no** `tailwind.config.js/ts`. Configuration uses the Tailwind v4 CSS-native approach:

- Theme tokens defined in `apps/web/app/globals.css` using `@theme { ... }`
- Plugin loaded via `@plugin "tailwindcss-animate"`
- Dark mode via `@custom-variant dark (&:is(.dark *))`
- PostCSS configured in `postcss.config.mjs` with `@tailwindcss/postcss`

### 4.2 Color Tokens

All colors use HSL CSS custom properties. The `hsl()` wrapper is in the `@theme` block; the variables store raw HSL values.

**Semantic tokens (use these, not raw colors):**

| Token | Usage |
|-------|-------|
| `background` / `foreground` | Page background and primary text |
| `primary` / `primary-foreground` | Buttons, links, active states |
| `secondary` / `secondary-foreground` | Secondary actions |
| `muted` / `muted-foreground` | Subdued backgrounds and helper text |
| `accent` / `accent-foreground` | Hover states, highlights |
| `destructive` / `destructive-foreground` | Error states, delete actions |
| `card` / `card-foreground` | Card surfaces |
| `border` | Borders and dividers |
| `input` | Input field borders |
| `ring` | Focus rings |

### 4.3 Typography

- **Fonts:** Geist Sans (`--font-geist-sans`) and Geist Mono (`--font-geist-mono`), loaded via `next/font/google`
- **Base:** `antialiased` on `<body>`

### 4.4 Radius

- `--radius: 0.5rem` (base)
- `--radius-md: calc(var(--radius) - 2px)`
- `--radius-sm: calc(var(--radius) - 4px)`

### 4.5 Component Conventions

All UI components in `components/ui/` follow the Shadcn pattern:

1. Use `class-variance-authority` (CVA) for variants
2. Use `@radix-ui` primitives for accessibility
3. Accept `className` prop and merge with `cn()` from `lib/utils.ts`
4. Use `React.forwardRef` and set `displayName`
5. Support `asChild` via Radix `Slot` where appropriate

**Available components:** `Button`, `Card` (CardHeader, CardTitle, CardDescription, CardContent), `Input`, `Label`, `Textarea`, `Badge`, `Toaster`, `Skeleton`, `Dialog` (DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogContent), `Tabs` (TabsList, TabsTrigger, TabsContent), `Select` (SelectTrigger, SelectContent, SelectItem, SelectValue), `Separator`

**Reusable components:** `PageHeader` (title, description, icon, action slot), `EmptyState` (icon, title, description, action button)

> ⚠️ **CORS**: Edge functions must use `getCorsHeaders(req)` from `_shared/cors.ts`. The wildcard `corsHeaders` export has been removed. Never import `corsHeaders` — it no longer exists.

**Button variants:** `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`
**Button sizes:** `default`, `sm`, `lg`, `icon`

When adding new UI components, follow the exact same pattern as `components/ui/button.tsx`.

---

## 5. Frontend Patterns

### 5.1 Supabase Client Usage

| Context | Factory | Import |
|---------|---------|--------|
| Client components | `createClient()` | `@/lib/supabase` |
| Server components / actions | `createServerSupabaseClient()` | `@/lib/supabase-server` |
| Middleware | Inline `createServerClient()` | `@supabase/ssr` |

**Rules:**
- Call `createClient()` inside component functions (useEffect, handlers), never at module scope.
- The browser client automatically sends the user's JWT with `functions.invoke()` calls.
- Never pass `userId` in the body of edge function calls. The edge function extracts the user from the JWT.

### 5.2 Page Patterns

- **Client pages** (`"use client"`): Login, Signup, Wallet, Jobs, Job Detail, Admin, Settings
- **Server pages**: Dashboard home (`app/dashboard/page.tsx`)
- **Static pages**: Landing, Privacy, Terms

Client pages follow this pattern:
```typescript
"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
// ... component imports

export default function PageName() {
  const [loading, setLoading] = useState(true)
  // ... state

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // ... fetch data
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <div className="p-8">Loading...</div>
  // ... render
}
```

### 5.3 Auth Flow

1. Middleware (`middleware.ts`) intercepts all requests
2. Refreshes Supabase session cookies
3. Redirects unauthenticated users from `/dashboard/*` to `/login`
4. Redirects authenticated users from `/login`, `/signup` to `/dashboard`

### 5.4 Toast Notifications

Use `sonner` for all user-facing notifications:
```typescript
import { toast } from "sonner"
toast.success("Action completed")
toast.error("Something went wrong")
```

The `<Toaster />` is mounted in the root layout. Do not add additional Toaster instances.

### 5.5 Edge Function Invocation

Always call edge functions via the Supabase client. The client handles JWT automatically:
```typescript
const supabase = createClient()
const { data, error } = await supabase.functions.invoke("function-name", {
  body: { key: "value" }  // Never include userId here
})
```

### 5.6 TypeScript Types

- **Generated types** (`lib/database.types.ts`): Auto-generated from Supabase schema. Regenerate after schema changes with `supabase gen types typescript`.
- **App types** (`lib/types.ts`): Manually maintained. Includes DB models, API request/response types, form types, filter types, enums.

When adding new tables or columns, update both the migration AND regenerate `database.types.ts`.

---

## 6. Edge Function Patterns

### 6.1 Function Skeleton

Every edge function must follow this exact pattern:

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

    // ... business logic

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

**Rules:**
- Always use `Deno.serve()` (not the deprecated `serve` from std).
- Always handle `OPTIONS` for CORS preflight.
- Always authenticate via `getAuthenticatedUser(req)` (except `lnbits-webhook` which uses `verifyWebhookSecret`).
- Always use `createAdminClient()` for database operations (bypasses RLS).
- Always return JSON with `corsHeaders`.
- Always cast errors with `(error as Error).message`.
- Never import from `https://deno.land/std`. Use `deno.json` import map.
- Import `@supabase/supabase-js` via the import map (mapped in `deno.json`).

### 6.2 Shared Modules

| Module | Exports | Purpose |
|--------|---------|---------|
| `_shared/cors.ts` | `corsHeaders` | CORS headers for all responses |
| `_shared/supabase.ts` | `createAdminClient()`, `createUserClient(token)` | Supabase client factories |
| `_shared/auth.ts` | `getAuthenticatedUser(req)`, `verifyWebhookSecret(req)` | JWT auth, webhook auth; re-exports supabase factories |
| `_shared/processIncomingPayment.ts` | `processIncomingPayment(supabase, hash, provider, payload?)` | Idempotent payment crediting |

**Critical:** `processIncomingPayment` is the ONLY place that credits user balances from Lightning payments. Both `check-payment` and `lnbits-webhook` call this function. Never duplicate this logic.

### 6.3 Authentication Matrix

| Function | Auth Method | JWT Required |
|----------|------------|-------------|
| `create-wallet` | `getAuthenticatedUser` | Yes |
| `create-invoice` | `getAuthenticatedUser` | Yes |
| `check-payment` | `getAuthenticatedUser` | Yes |
| `fund-escrow` | `getAuthenticatedUser` | Yes |
| `approve-payout` | `getAuthenticatedUser` | Yes |
| `resolve-dispute` | `getAuthenticatedUser` + admin role check | Yes |
| `send-notification` | Internal only (service role) | No (internal) |
| `lnbits-webhook` | `verifyWebhookSecret` | No (`--no-verify-jwt`) |

### 6.4 Environment Variables

Edge Functions access secrets via `Deno.env.get()`. These are auto-injected by Supabase:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

These must be set manually via `supabase secrets set`:
- `LNBITS_URL`, `LNBITS_ADMIN_KEY`, `LNBITS_WEBHOOK_SECRET`, `SMTP_URL` (optional)

---

## 7. Database Schema

### 7.1 Tables

| Table | Primary Key | Key Columns |
|-------|------------|-------------|
| `profiles` | `id` (UUID, ref auth.users) | username, role, skills[], lnbits_id, lnbits_admin_key, lnbits_invoice_key, avatar_url |
| `job_categories` | `id` (UUID) | name (unique, pre-seeded) |
| `jobs` | `id` (UUID) | creator_id, title, description, budget_sats, status, category, deadline, worker_id |
| `applications` | `id` (UUID) | job_id, worker_id, cover_letter, status |
| `submissions` | `id` (UUID) | job_id, worker_id, content, attachments[] |
| `accounts` | `id` (UUID) | user_id (nullable for system), type, balance_sats |
| `ledger_entries` | `id` (UUID) | debit_account_id, credit_account_id, amount_sats, reference_type, reference_id |
| `payment_intents` | `payment_hash` (TEXT) | user_id, amount_sats, payment_request, status, expires_at |
| `payment_events` | `id` (UUID) | provider, payment_hash (unique), amount_sats, status, raw_payload |
| `disputes` | `id` (UUID) | job_id, opened_by, reason, evidence_urls[], status, resolution, resolved_by |
| `escrow_holds` | `id` (UUID) | job_id (unique), amount_sats, status |

**View:** `profiles_public` -- exposes profiles without sensitive LNbits keys; includes `has_wallet` boolean.

### 7.2 Account Types

| Type | user_id | Purpose |
|------|---------|---------|
| `AVAILABLE` | user UUID | User's spendable balance |
| `ESCROW` | user UUID | User's escrowed funds (locked for jobs) |
| `PLATFORM_FEES` | NULL | System account for collected fees |
| `EXTERNAL_DEPOSITS` | NULL | System tracking account for Lightning inflows |

### 7.3 Job Status Flow

```
OPEN --> FUNDED --> IN_PROGRESS --> REVIEW --> COMPLETED
                       |              |
                       v              v
                    DISPUTED <--------+
                       |
                  +---------+
                  |         |
              CANCELLED  COMPLETED
              (refund/   (pay worker)
               split)
```

### 7.4 Key Database Functions (RPCs)

| Function | Called By | Purpose |
|----------|----------|---------|
| `move_funds(from, to, amount, ref_type, ref_id)` | fund-escrow, atomic_payout, atomic_dispute_payout | Atomic fund transfer with ledger entry |
| `get_account_id(user_id, type)` | fund-escrow | Look up account UUID |
| `process_external_deposit(user_id, amount, hash)` | processIncomingPayment | Credit user balance from Lightning deposit |
| `atomic_payout(job_id, creator_id, worker_id, budget)` | approve-payout | Pay worker + platform fee atomically |
| `atomic_dispute_payout(job_id, resolution, admin_id)` | resolve-dispute | Resolve dispute atomically |

All SECURITY DEFINER functions use `SET search_path = public`.

### 7.5 Idempotency

- `processIncomingPayment`: Uses `payment_events.payment_hash` UNIQUE constraint. Double-insert returns early.
- `atomic_payout`: Checks if job is already `COMPLETED` before processing.
- `create-wallet`: Checks `profiles.lnbits_id` before calling LNbits.
- `fund-escrow`: Uses `escrow_holds.job_id` UNIQUE via upsert.

### 7.6 Migration Rules

- There is currently **one** migration file: `0001_initial_schema.sql`.
- New migrations get the next sequence number: `0002_description.sql`.
- Always use `IF NOT EXISTS` / `IF EXISTS` for DDL idempotency.
- Always enable RLS on new tables.
- Always add `SET search_path = public` to SECURITY DEFINER functions.
- After schema changes, regenerate types: `supabase gen types typescript --project-id <ref> > apps/web/lib/database.types.ts`

---

## 8. Payment Flow

### 8.1 Top-Up (Polling-First)

```
User clicks "Add Funds"
  --> Frontend calls create-invoice edge function
  --> Edge function creates LNbits invoice, stores payment_intent (PENDING)
  --> Frontend shows QR code + countdown (1h expiry) + "Copy" + "I've Paid"
  --> Frontend polls check-payment every 3 seconds
  --> check-payment asks LNbits if invoice is paid
  --> If paid: processIncomingPayment credits balance via process_external_deposit
  --> Frontend sees { paid: true }, updates UI
```

### 8.2 Webhook (Fallback)

```
LNbits sends POST to lnbits-webhook with payment_hash
  --> verifyWebhookSecret checks shared secret
  --> processIncomingPayment credits balance (same function as polling)
  --> Idempotency: if already processed by polling, returns early
  --> Always returns HTTP 200 (prevents LNbits retries)
```

### 8.3 Escrow + Payout

```
Creator creates job
  --> fund-escrow: AVAILABLE --> ESCROW (via move_funds)
  --> escrow_holds row created, job status = FUNDED

Worker submits --> Creator approves
  --> approve-payout: atomic_payout RPC
  --> ESCROW --> worker AVAILABLE (95%)
  --> ESCROW --> PLATFORM_FEES (5%)
  --> escrow_holds = RELEASED, job = COMPLETED
```

---

## 9. Email Notifications

The `send-notification` function sends emails via an external SMTP API using `fetch()`. This is Deno-compatible (no nodemailer).

**Notification types:** `JOB_ACCEPTED`, `APPLICATION_RECEIVED`, `SUBMISSION_READY`, `PAYOUT_APPROVED`, `DISPUTE_OPENED`, `DISPUTE_RESOLVED`, `PAYMENT_RECEIVED`

**Behavior:**
- If `SMTP_URL` env var is set: sends HTTP POST to that URL with `{ to, subject, html }`.
- If not set: logs the notification to console (development mode).

---

## 10. CI/CD

### GitHub Actions (`deploy.yml`)
- Triggers on push to `main`
- Links Supabase project, pushes migrations, sets secrets, deploys all edge functions
- `lnbits-webhook` is deployed with `--no-verify-jwt`

### Vercel
- Auto-deploys via Git integration (not in GitHub Actions)
- Root directory must be set to `apps/web` in Vercel project settings
- Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars

---

## 11. Common Pitfalls

1. **Never pass userId in edge function request bodies.** The user is extracted from the JWT by `getAuthenticatedUser(req)`.
2. **Never duplicate payment processing logic.** Always use `processIncomingPayment` from `_shared/`.
3. **Never use `serve` from `deno.land/std`.** Use `Deno.serve()`.
4. **Never import dependencies via raw URLs in edge functions.** Use the `deno.json` import map.
5. **Never add a Tailwind config file.** Tailwind v4 uses CSS-native configuration in `globals.css`.
6. **Never create a new Toaster instance.** One exists in the root layout.
7. **Never bypass RLS in edge functions without `createAdminClient()`.** The admin client uses the service role key.
8. **Never store LNbits keys in frontend-accessible storage.** They live in the `profiles` table, hidden by the `profiles_public` view.
9. **Always include CORS headers** in edge function responses, including error responses.
10. **Always handle the OPTIONS preflight** as the first check in every edge function.
