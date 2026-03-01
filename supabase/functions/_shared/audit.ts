/**
 * Audit trail helper for Supabase Edge Functions.
 *
 * Provides functions to write audit entries and edge function execution logs
 * to the audit_log and edge_function_logs tables respectively.
 *
 * Usage:
 *   await writeAuditLog(supabase, {
 *     actorId: userId,
 *     actorRole: 'client',
 *     action: 'escrow.funded',
 *     resourceType: 'job',
 *     resourceId: jobId,
 *     details: { amount: 5000 },
 *     ipAddress: req.headers.get('x-forwarded-for'),
 *   });
 */

import { type SupabaseClient } from "npm:@supabase/supabase-js@2";

interface AuditEntry {
    actorId: string | null;
    actorRole: "user" | "worker" | "client" | "admin" | "system";
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
}

interface FunctionLogEntry {
    functionName: string;
    actorId: string | null;
    status: "success" | "error" | "warning";
    durationMs: number;
    requestMeta?: Record<string, unknown>;
    responseMeta?: Record<string, unknown>;
    errorMessage?: string | null;
}

/**
 * Writes an audit trail entry to the audit_log table.
 * Non-blocking — errors are logged but do not throw.
 */
export async function writeAuditLog(
    supabase: SupabaseClient,
    entry: AuditEntry
): Promise<void> {
    try {
        const { error } = await supabase.from("audit_log").insert({
            actor_id: entry.actorId,
            actor_role: entry.actorRole,
            action: entry.action,
            resource_type: entry.resourceType,
            resource_id: entry.resourceId,
            details: entry.details ?? {},
            ip_address: entry.ipAddress ?? null,
            user_agent: entry.userAgent ?? null,
        });

        if (error) {
            console.error(
                JSON.stringify({
                    severity: "ERROR",
                    message: "Failed to write audit log",
                    error: error.message,
                    entry,
                })
            );
        }
    } catch (err) {
        console.error(
            JSON.stringify({
                severity: "ERROR",
                message: "Audit log write exception",
                error: (err as Error).message,
            })
        );
    }
}

/**
 * Writes an edge function execution log to the edge_function_logs table.
 * Non-blocking — errors are logged but do not throw.
 */
export async function logFunctionExecution(
    supabase: SupabaseClient,
    entry: FunctionLogEntry
): Promise<void> {
    try {
        const { error } = await supabase.from("edge_function_logs").insert({
            function_name: entry.functionName,
            actor_id: entry.actorId,
            status: entry.status,
            duration_ms: entry.durationMs,
            request_meta: entry.requestMeta ?? {},
            response_meta: entry.responseMeta ?? {},
            error_message: entry.errorMessage ?? null,
        });

        if (error) {
            console.error(
                JSON.stringify({
                    severity: "ERROR",
                    message: "Failed to write function execution log",
                    error: error.message,
                })
            );
        }
    } catch (err) {
        console.error(
            JSON.stringify({
                severity: "ERROR",
                message: "Function execution log write exception",
                error: (err as Error).message,
            })
        );
    }
}

/**
 * Extracts sanitized request metadata for logging.
 * Strips sensitive headers (Authorization, cookies).
 */
export function getRequestMeta(req: Request): Record<string, unknown> {
    return {
        method: req.method,
        url: new URL(req.url).pathname,
        origin: req.headers.get("origin") ?? null,
        ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
        user_agent: req.headers.get("user-agent") ?? null,
    };
}
