# API Reference

All Edge Functions are deployed as Supabase Edge Functions and are invoked via the Supabase client or direct HTTP calls.

**Base URL:** `{SUPABASE_URL}/functions/v1/{function-name}`

## Authentication

All endpoints except `lnbits-webhook` require a valid JWT in the `Authorization: Bearer <token>` header. When using the Supabase JS client, this is handled automatically.

The `lnbits-webhook` endpoint uses a shared secret for verification (via query param `?secret=` or header `x-webhook-secret`).

---

## Endpoints

### POST /create-wallet

Creates an LNbits wallet for the authenticated user. Idempotent -- returns existing wallet if one already exists.

**Auth:** JWT (required)

**Request Body:** `{}` (empty -- user ID is extracted from JWT)

**Response:**
```json
{
  "wallet": {
    "id": "wallet-id",
    "adminkey": "...",
    "inkey": "..."
  }
}
```

**Errors:**
- `400` Missing LNbits configuration
- `400` LNbits API error

---

### POST /create-invoice

Creates a Lightning invoice for topping up the user's balance.

**Auth:** JWT (required)

**Request Body:**
```json
{
  "amountSats": 1000
}
```

**Response:**
```json
{
  "payment_hash": "abc123...",
  "payment_request": "lnbc..."
}
```

**Side Effects:**
- Inserts a `payment_intents` row with status `PENDING`
- Invoice expires in 1 hour

**Errors:**
- `400` Invalid amount
- `400` User wallet not found

---

### POST /check-payment

Polls LNbits to check if a Lightning invoice has been paid. If paid, credits the user's balance via the centralized `processIncomingPayment` flow.

**Auth:** JWT (required)

**Request Body:**
```json
{
  "paymentHash": "abc123..."
}
```

**Response:**
```json
{ "paid": true, "amount": 1000 }
```
or
```json
{ "paid": false }
```

**Idempotency:** Safe to call multiple times. Uses `payment_events` unique constraint on `payment_hash` to prevent double-crediting.

---

### POST /lnbits-webhook

Receives payment confirmation from LNbits. Uses the same centralized `processIncomingPayment` flow as `check-payment`.

**Auth:** Webhook secret (query param `?secret=` or header `x-webhook-secret`)

**JWT:** Not required (set `verify_jwt: false` on deployment)

**Request Body:** LNbits webhook payload containing `payment_hash`.

**Response:** Always returns HTTP 200 to prevent LNbits retries.

```json
{ "received": true, "processed": true, "amount": 1000 }
```

**Idempotency:** Same as `check-payment`. Safe for at-least-once delivery.

---

### POST /fund-escrow

Moves funds from the creator's AVAILABLE account to their ESCROW account and marks the job as FUNDED.

**Auth:** JWT (required -- must be the job creator)

**Request Body:**
```json
{
  "jobId": "uuid"
}
```

**Response:**
```json
{ "success": true }
```

**Side Effects:**
- `move_funds` RPC: AVAILABLE -> ESCROW
- Inserts/upserts `escrow_holds` row
- Updates job status to `FUNDED`

**Errors:**
- `400` Unauthorized (not the job creator)
- `400` Job is not in OPEN state
- `400` Insufficient funds

---

### POST /approve-payout

Creator approves the worker's submission. Atomically transfers funds from escrow to the worker (minus 5% platform fee).

**Auth:** JWT (required -- must be the job creator)

**Request Body:**
```json
{
  "jobId": "uuid"
}
```

**Response:**
```json
{ "success": true, "payout": 950, "fee": 50 }
```

**Idempotency:** The `atomic_payout` database function checks if the job is already `COMPLETED` and returns early if so.

**Side Effects:**
- `atomic_payout` RPC: ESCROW -> worker AVAILABLE (95%), ESCROW -> PLATFORM_FEES (5%)
- Updates escrow hold to `RELEASED`
- Updates job status to `COMPLETED`
- Sends `PAYOUT_APPROVED` notification to worker

---

### POST /cancel-job

Cancels a job posted by the authenticated creator. Only available for jobs in `OPEN` or `FUNDED` state. If the job is `FUNDED`, the escrowed budget is atomically refunded to the creator's available balance.

**Auth:** JWT (required — must be the job creator)

**Request Body:**
```json
{
  "jobId": "uuid"
}
```

**Response:**
```json
{ "success": true, "refunded": true, "amount_sats": 5000 }
```

For `OPEN` jobs (escrow not yet funded):
```json
{ "success": true, "refunded": false, "amount_sats": 0 }
```

**Idempotency:** The `atomic_cancel_job` database function checks if the job is already `CANCELLED` and returns early if so.

**Side Effects:**
- `atomic_cancel_job` RPC: if `FUNDED`, ESCROW → creator AVAILABLE (`ESCROW_REFUND` ledger entry)
- Updates `escrow_holds.status` to `REFUNDED` (FUNDED jobs only)
- Updates job `status` to `CANCELLED`
- Writes `job.cancelled` audit log entry

**Errors:**
- `400` Unauthorized (not the job creator)
- `400` Job is not in `OPEN` or `FUNDED` state
- `400` No active escrow hold found (data integrity error)

---

### POST /resolve-dispute

Admin resolves a disputed job. Atomically distributes escrowed funds based on the resolution.

**Auth:** JWT (required -- must have `admin` role)

**Request Body:**
```json
{
  "jobId": "uuid",
  "resolution": "REFUND"
}
```

Resolution options:
- `REFUND` -- Full refund to creator
- `PAY_WORKER` -- Pay worker (minus 5% fee)
- `SPLIT` -- 50/50 split (minus 5% fee on each half)

**Response:**
```json
{ "success": true, "resolution": "REFUND" }
```

**Side Effects:**
- `atomic_dispute_payout` RPC handles all fund movements
- Updates dispute status to `RESOLVED`
- Updates job status to `COMPLETED` or `CANCELLED`
- Sends `DISPUTE_RESOLVED` notifications to both parties

---

### POST /send-notification

Internal function invoked by other Edge Functions. Sends email notifications via an external SMTP API.

**Auth:** Called internally via `supabase.functions.invoke()` with service role.

**Request Body:**
```json
{
  "type": "PAYOUT_APPROVED",
  "recipientUserId": "uuid",
  "jobId": "uuid",
  "amount": 950,
  "resolution": "REFUND"
}
```

**Notification Types:**
| Type | Trigger |
|------|---------|
| `JOB_ACCEPTED` | Creator accepts a worker's application |
| `APPLICATION_RECEIVED` | Worker applies to a job |
| `SUBMISSION_READY` | Worker submits deliverable |
| `PAYOUT_APPROVED` | Creator approves payout |
| `DISPUTE_OPENED` | Either party opens a dispute |
| `DISPUTE_RESOLVED` | Admin resolves dispute |
| `PAYMENT_RECEIVED` | Lightning invoice paid |

**Email Delivery:** If `SMTP_URL` is configured, sends via HTTP POST to that endpoint. Otherwise logs to console (development mode).

---

## Database RPCs

These functions are called by Edge Functions via `supabase.rpc()`:

| Function | Purpose |
|----------|---------|
| `get_account_id(user_id, type)` | Returns account UUID for a user and account type |
| `move_funds(from, to, amount, ref_type, ref_id)` | Atomic fund transfer with ledger entry |
| `increment_balance(account_id, amount)` | Increment an account balance |
| `process_external_deposit(user_id, amount, hash)` | Double-entry deposit from Lightning |
| `atomic_payout(job_id, creator_id, worker_id, budget)` | Atomic payout with platform fee |
| `atomic_cancel_job(job_id, creator_id)` | Atomic job cancellation with escrow refund |
| `atomic_dispute_payout(job_id, resolution, admin_id)` | Atomic dispute resolution |

---

## Shared Modules

Edge Functions share these modules from `supabase/functions/_shared/`:

| Module | Purpose |
|--------|---------|
| `auth.ts` | `getAuthenticatedUser(req)`, `verifyWebhookSecret(req)`, Supabase client factories |
| `cors.ts` | CORS headers for all responses |
| `processIncomingPayment.ts` | Centralized, idempotent payment processing used by both polling and webhook |
| `supabase.ts` | `createAdminClient()` and `createUserClient(token)` |

---

## Error Handling

All endpoints return errors as:
```json
{
  "error": "Error message"
}
```

HTTP status codes:
- `200` -- Success
- `400` -- Client error (bad input, unauthorized, insufficient funds)
- `401` -- Authentication failure (lnbits-webhook only)

Exception: `lnbits-webhook` always returns `200` to prevent LNbits retry loops.
