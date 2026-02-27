# Security Guide — Bereka

This document covers security practices for contributors and self-hosters.

## Environment Variables & Secrets

**Never commit `.env` files.** The `.gitignore` is configured to exclude them, and there is a pre-commit hook (`.husky/pre-commit`) that blocks commits containing `.env` files.

### Required Secrets

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Supabase anonymous key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Server-only admin access |
| `LNBITS_URL` | Edge Functions | LNbits instance URL |
| `LNBITS_ADMIN_KEY` | Edge Functions | LNbits super-admin key |
| `LNBITS_WEBHOOK_SECRET` | Edge Functions | Webhook verification secret |
| `RESEND_API_KEY` | Edge Functions | Transactional email API key |

### Rotating Secrets

If you suspect a secret has been exposed:
1. **Supabase**: Go to Dashboard → Settings → API → Regenerate keys
2. **LNbits**: Rotate via LNbits admin panel
3. **Resend**: Dashboard → API Keys → Create new key, delete old one
4. **Vercel**: Dashboard → Settings → Environment Variables → Update values
5. **GitHub Actions**: Settings → Secrets → Update each secret

After rotating, redeploy all edge functions and the frontend.

## Row Level Security (RLS)

All tables have RLS enabled. Key policies:

- **`profiles`**: Users can only read their own row. Admins can read all.
- **`jobs`**: Everyone can read. Only creators can update/delete their own.
- **`payment_intents`/`ledger_entries`**: Users can only see their own records.
- **`job_categories`**: Everyone can read. Only admins can create/update/delete.

The `profiles_public` view provides safe cross-user lookups without exposing wallet keys.

## Edge Function Security

- All endpoints (except `lnbits-webhook`) require JWT authentication
- `lnbits-webhook` uses a shared secret (`LNBITS_WEBHOOK_SECRET`) — if unset, **all webhooks are rejected**
- `send-notification` requires the `SUPABASE_SERVICE_ROLE_KEY` for authentication (internal calls only)
- CORS is restricted to `bereka.co.za` and `localhost:3000`

## Admin Promotion

There is **no auto-promote mechanism**. To make a user an admin:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'user@example.com';
```

## Security Headers

The following headers are set on all responses via `vercel.json`:

- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing
- `Strict-Transport-Security` — enforces HTTPS
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — restricts browser API access

## Audit Trail & Logging

All business-critical actions are recorded for forensic and compliance purposes.

### Audit Tables

| Table | Purpose | Retention |
|-------|---------|-----------|
| `audit_log` | WHO did WHAT, WHEN, to WHICH resource | Unlimited |
| `edge_function_logs` | Function execution metrics (timing, errors) | 90 days |
| `ledger_entries` | Double-entry financial movements (now with `actor_id`) | Unlimited |

### Automatic Change Data Capture

Database triggers automatically log INSERT/UPDATE events on `jobs`, `applications`, `disputes`, `escrow_holds`, `profiles`, and `submissions` to the `audit_log` table. This ensures all data modifications are captured regardless of the entry point.

### Admin Action Logging

All admin actions (dispute resolution, role changes) are explicitly audited with the `admin` actor role, IP address, and user agent. Admin audit entries can be queried with:
```sql
SELECT * FROM audit_log WHERE actor_role = 'admin' ORDER BY created_at DESC;
```

### Log Integrity

- Audit tables use RLS: users can only see their own entries; admins can see all.
- Only `SECURITY DEFINER` triggers and service-role clients can insert audit entries.
- Structured JSON logging in edge functions ensures tamper-evident log streams.

See `LOGGING.md` for operational queries and maintenance procedures.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately rather than opening a public issue.
