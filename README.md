# Bereka

A Lightning micro-task marketplace MVP where users earn sats instantly for completing small digital tasks and can also post their own jobs. Powered by LNbits for custodial Lightning wallets, Supabase for backend services, and Next.js for the frontend.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Shadcn UI, Sonner toasts |
| Backend | Supabase (Auth, Postgres 15, Storage, Edge Functions in Deno) |
| Payments | LNbits (custodial wallets per user) |
| Deploy | Vercel (web), Supabase (DB, Storage, Edge Functions) |
| CI/CD | GitHub Actions (Supabase deploy), Vercel auto-deploy via Git |

## Features

- **Custodial Lightning Wallets**: One LNbits wallet per user with internal double-entry ledger (available, escrow, platform fee buckets)
- **Escrow System**: Job creators fund escrow on job creation; funds released to workers on approval
- **Payment Verification**: Polling-first invoice payment detection with webhook fallback for real-time confirmation
- **Platform Fee**: 5% fee on approved payouts, processed atomically with worker payment
- **Admin Dispute Resolution**: Refund, pay worker, or 50-50 split with full dispute console and ledger view
- **Post-Job Ratings**: Creators and workers rate each other (1–5 stars + optional comment) after job completion, with confirmation dialog, audit trail, and notification
- **File Uploads**: Submission attachments and avatar uploads via Supabase Storage
- **Email Notifications**: External SMTP API integration (Deno-compatible, no nodemailer), 8 event types
- **Accessibility (a11y)**: WCAG 2.2 Level AA compliant — skip navigation, ARIA landmarks, focus management, live regions, `prefers-reduced-motion`, and screen reader support

## Project Structure

```
bereka-app/
├── apps/web/              # Next.js frontend
│   ├── app/               # App Router pages
│   │   ├── dashboard/     # Auth-protected pages
│   │   │   ├── admin/     # Admin dispute console + ledger
│   │   │   ├── applications/ # Job applications tracker
│   │   │   ├── disputes/  # Dispute management
│   │   │   ├── jobs/      # Job list, create, detail
│   │   │   ├── wallet/    # Balance + top-up via Lightning
│   │   │   └── settings/  # Profile + wallet management
│   │   ├── login/
│   │   ├── signup/
│   │   ├── forgot-password/ # Password reset flow
│   │   ├── reset-password/  # Supabase auth callback
│   │   ├── privacy/
│   │   └── terms/
│   ├── components/ui/     # Shadcn components
│   └── lib/               # Supabase clients, types, utils, hooks, validations
├── supabase/
│   ├── migrations/        # Single consolidated migration
│   ├── functions/         # Deno Edge Functions
│   │   ├── _shared/       # Shared auth, CORS, payment processing
│   │   ├── create-wallet/
│   │   ├── create-invoice/
│   │   ├── check-payment/
│   │   ├── lnbits-webhook/
│   │   ├── fund-escrow/
│   │   ├── approve-payout/
│   │   ├── resolve-dispute/
│   │   ├── submit-rating/
│   │   └── send-notification/
│   └── config.toml
└── .github/workflows/     # CI/CD
```

## Architecture Overview

```
User → Next.js App → Supabase Auth (JWT)
                   → Supabase Postgres (accounts, ledger, jobs, disputes, escrow)
                   → Supabase Storage (submissions, avatars)
                   → Edge Functions → LNbits API (wallet, invoice, payment)
                                    → SMTP (email notifications)
                                    → Webhook Handler

LNbits ───────────────────────────→ Edge Functions (lnbits-webhook for real-time payment confirmation)
```

**Edge Functions**: All functions use JWT auth via `getAuthenticatedUser` (except `lnbits-webhook`, which uses a webhook secret). All use the `Deno.serve()` pattern. Payment processing is centralized in `_shared/processIncomingPayment.ts`.

**Database**: Double-entry ledger with `AVAILABLE`, `ESCROW`, `PLATFORM_FEES`, and `EXTERNAL_DEPOSITS` account types. Atomic payouts and dispute resolution via database transactions.

## Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | User data (username, bio, role, LNbits wallet keys) |
| `jobs` | Task postings (title, budget, status, category, deadline) |
| `applications` | Worker applications with cover letters |
| `submissions` | Worker deliverables with optional file attachments |
| `accounts` | Financial accounts per user (AVAILABLE, ESCROW) + system accounts |
| `ledger_entries` | Double-entry accounting log |
| `payment_intents` | Lightning invoice tracking |
| `payment_events` | Idempotent payment processing log |
| `disputes` | Dispute records with resolution metadata |
| `escrow_holds` | Escrow tracking per job |
| `job_categories` | Pre-seeded task categories |

**Views**: `profiles_public` (hides sensitive LNbits keys from public queries).

## Prerequisites

> **📚 New Developer?** See [SETUP.md](SETUP.md) for detailed, platform-specific setup instructions for Windows, macOS, and Linux.

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- An LNbits instance (self-hosted or cloud)

## Local Development

### 1. Clone and Install

```bash
git clone <repo-url>
cd bereka-app
npm install --prefix apps/web
```

### 2. Environment Variables

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local` with your Supabase project URL and anon key:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |

### 3. Start Supabase

```bash
supabase start
supabase db reset
```

`supabase db reset` applies migrations and seeds the platform account and job categories.

### 4. Edge Function Secrets

```bash
# LNbits (required)
supabase secrets set LNBITS_URL=https://your-lnbits.com
supabase secrets set LNBITS_ADMIN_KEY=your-admin-key

# Webhook verification (recommended for production)
supabase secrets set LNBITS_WEBHOOK_SECRET=your-random-secret-string

# Email notifications (optional)
supabase secrets set SMTP_URL=https://your-smtp-relay.com/send
```

### 5. Run Edge Functions and Frontend

```bash
# Terminal 1: Edge Functions
supabase functions serve

# Terminal 2: Next.js
npm run dev
```

Visit `http://localhost:3000`.

## Environment Variables Reference

### Frontend (`apps/web/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |

### Supabase Edge Function Secrets

Set via `supabase secrets set`:

| Secret | Required | Description |
|--------|----------|-------------|
| `LNBITS_URL` | Yes | LNbits instance URL |
| `LNBITS_ADMIN_KEY` | Yes | LNbits admin API key (User Manager extension) |
| `LNBITS_WEBHOOK_SECRET` | Recommended | Shared secret for webhook verification |
| `SMTP_URL` | No | SMTP relay endpoint for email notifications |

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` automatically.

### GitHub Actions Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `SUPABASE_ACCESS_TOKEN` | Yes | Personal access token from supabase.com/dashboard/account/tokens |
| `SUPABASE_DB_PASSWORD` | Yes | Database password from project settings |
| `SUPABASE_PROJECT_ID` | Yes | Project reference ID |

### Vercel Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same as `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Same as `.env.local` |

## Deployment

### Vercel (Frontend)

1. Connect the repository to Vercel
2. Set root directory: `apps/web`
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Vercel auto-deploys on push to `main`

### Supabase (Backend)

1. Link the project: `supabase link --project-ref <ref>`
2. Push migrations: `supabase db push`
3. Deploy Edge Functions: `supabase functions deploy`
4. Set secrets (see Edge Function Secrets above)

### GitHub Actions CI/CD

On push to `main`:
- Migrations are deployed via `supabase db push`
- Edge Functions are deployed via `supabase functions deploy`
- Frontend CI runs: Install → Lint → Type Check → Test → Build → Deploy

## Testing

```bash
# Run tests (one-off)
npm run test

# Run tests in watch mode
npm run test:watch

# Type check
npm run type-check
```

Test framework: Vitest + React Testing Library + jsdom. Test files live alongside source files as `*.test.ts` / `*.test.tsx`.

See also: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for UI component guidelines.

## User Flows

1. **Sign Up**: Creates auth user, profile, accounts (AVAILABLE + ESCROW), and LNbits wallet
2. **Top Up**: Generate Lightning invoice, scan QR, poll for payment (or webhook), balance credited via ledger
3. **Post Task**: Set title, description, budget, category, deadline; funds move from AVAILABLE to ESCROW
4. **Apply**: Worker submits application; creator is notified
5. **Accept**: Creator accepts applicant; worker is notified; status becomes IN_PROGRESS
6. **Submit Work**: Worker uploads deliverable and optional files; creator is notified; status becomes REVIEW
7. **Approve and Pay**: Creator approves; atomic transaction: 95% to worker, 5% platform fee; escrow released
8. **Dispute**: Either party raises dispute; admin resolves via Refund, Pay Worker, or 50-50 split

## Job Status Flow

```
OPEN → FUNDED → IN_PROGRESS → REVIEW → COMPLETED
                    ↓             ↓
                DISPUTED ← ← ← ←
                    ↓
            CANCELLED (refund/split)
            COMPLETED (pay worker)
```

## Additional Documentation

- [SETUP.md](SETUP.md) – Detailed setup guide for Windows, macOS, and Linux
- [API.md](API.md) – Edge Function API reference and examples
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) – Color tokens, components, typography, and design guidelines
- [AGENTS.md](AGENTS.md) – Agent coding guidelines and project conventions
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) – Common issues and solutions
- [ACCESSIBILITY.md](ACCESSIBILITY.md) – Accessibility standards and implementation guide

## Contribution Guidelines

1. Fork the repository and create a feature branch from `main`
2. Follow existing code style and conventions
3. Run `npm run lint` before committing
4. **Ensure all changes meet WCAG 2.2 Level AA accessibility standards** (see [AGENTS.md §13](AGENTS.md#13-accessibility-a11y-conventions) and [ACCESSIBILITY.md](ACCESSIBILITY.md))
5. Ensure migrations are backward-compatible when modifying the schema
6. Update documentation for new features or environment variables
7. Submit a pull request with a clear description of changes

## License

MIT
