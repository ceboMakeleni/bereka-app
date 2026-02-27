# Logging & Auditing — Operational Guide

This document covers the Bereka application's logging and audit trail infrastructure, including how to query logs, investigate issues, and maintain the system.

---

## Architecture Overview

```
┌──────────────────────┐    ┌────────────────────┐    ┌──────────────────────┐
│   Edge Functions     │───▶│   audit_log        │    │ CDC Triggers         │
│                      │    │   (business events)│◀───│ (auto-captures       │
│  createLogger()      │    └────────────────────┘    │  data changes)       │
│  writeAuditLog()     │                              └──────────────────────┘
│  logFunctionExecution│    ┌────────────────────┐
│                      │───▶│ edge_function_logs │
│                      │    │ (execution metrics)│
└──────────────────────┘    └────────────────────┘
```

| Layer | Table | What It Captures | Retention |
|-------|-------|-----------------|-----------|
| Business audit trail | `audit_log` | WHO did WHAT to WHICH resource | Unlimited |
| Function execution | `edge_function_logs` | Performance, errors, timing | 90 days |
| Financial ledger | `ledger_entries` | Double-entry fund movements | Unlimited |
| CDC (automatic) | `audit_log` (via triggers) | Data changes on critical tables | Unlimited |

---

## Querying Audit Logs

### Recent activity for a specific user
```sql
SELECT action, resource_type, resource_id, details, created_at
FROM audit_log
WHERE actor_id = '<user-uuid>'
ORDER BY created_at DESC
LIMIT 50;
```

### All admin actions (dispute resolutions, role changes)
```sql
SELECT * FROM audit_log
WHERE actor_role = 'admin'
ORDER BY created_at DESC;
```

### Track a specific job's lifecycle
```sql
SELECT action, actor_role, details, created_at
FROM audit_log
WHERE resource_type IN ('job', 'dispute', 'escrow_holds')
  AND (resource_id = '<job-uuid>' OR details->>'job_id' = '<job-uuid>')
ORDER BY created_at;
```

### Financial audit — all payment events
```sql
SELECT action, details, created_at
FROM audit_log
WHERE action LIKE 'payment.%'
ORDER BY created_at DESC;
```

---

## Querying Edge Function Logs

### Functions with errors in the last 24 hours
```sql
SELECT function_name, actor_id, error_message, duration_ms, created_at
FROM edge_function_logs
WHERE status = 'error' AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

### Average execution time by function
```sql
SELECT function_name,
  count(*) as total_calls,
  avg(duration_ms) as avg_ms,
  max(duration_ms) as max_ms,
  count(*) FILTER (WHERE status = 'error') as error_count
FROM edge_function_logs
WHERE created_at > now() - interval '7 days'
GROUP BY function_name
ORDER BY total_calls DESC;
```

---

## Investigating Financial Discrepancies

1. **Check the ledger entries** for the user:
   ```sql
   SELECT le.*, a_from.type as from_type, a_to.type as to_type
   FROM ledger_entries le
   JOIN accounts a_from ON le.debit_account_id = a_from.id
   JOIN accounts a_to ON le.credit_account_id = a_to.id
   WHERE a_from.user_id = '<user-uuid>' OR a_to.user_id = '<user-uuid>'
   ORDER BY le.created_at;
   ```

2. **Cross-reference with audit log** for the same period:
   ```sql
   SELECT * FROM audit_log
   WHERE actor_id = '<user-uuid>'
     AND action IN ('escrow.funded', 'payout.approved', 'payment.completed')
   ORDER BY created_at;
   ```

---

## CDC Trigger Coverage

| Table | Events Tracked | Key Details Captured |
|-------|---------------|---------------------|
| `jobs` | INSERT, UPDATE | Status changes, worker assignment |
| `applications` | INSERT, UPDATE | Status changes (accept/reject) |
| `disputes` | INSERT, UPDATE | Status changes, resolution |
| `escrow_holds` | INSERT, UPDATE | Status changes, amounts |
| `profiles` | UPDATE | Role changes (security-critical) |
| `submissions` | INSERT | Work submissions |

---

## Maintenance

### 90-day cleanup for edge function logs
```sql
DELETE FROM edge_function_logs WHERE created_at < now() - interval '90 days';
```

Schedule this via Supabase cron (pg_cron) or a database function.
