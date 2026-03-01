import { getCorsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { writeAuditLog, logFunctionExecution, getRequestMeta } from "../_shared/audit.ts";

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const startTime = Date.now();
    let actorId: string | null = null;

    try {
        const user = await getAuthenticatedUser(req);
        actorId = user.id;
        const log = createLogger("cancel-job", actorId);

        const { jobId } = await req.json();
        if (!jobId) throw new Error("Missing jobId");

        log.info("Job cancellation initiated", { jobId });

        const supabase = createAdminClient();

        // Fetch job to validate ownership and current state
        const { data: job, error: jobError } = await supabase
            .from("jobs")
            .select("*")
            .eq("id", jobId)
            .single();

        if (jobError || !job) throw new Error("Job not found");
        if (job.creator_id !== actorId) throw new Error("Unauthorized: only the job creator can cancel this job");
        if (!["OPEN", "FUNDED"].includes(job.status)) {
            throw new Error(`Job cannot be cancelled in status: ${job.status}`);
        }

        // Atomically cancel the job (and refund escrow if FUNDED)
        const { data: result, error: cancelError } = await supabase.rpc(
            "atomic_cancel_job",
            {
                p_job_id: jobId,
                p_creator_id: actorId,
            }
        );

        if (cancelError) {
            log.error("Cancel job RPC failed", { jobId, error: cancelError.message });
            throw new Error(`Cancellation failed: ${cancelError.message}`);
        }

        log.info("Job cancelled successfully", {
            jobId,
            previousStatus: job.status,
            refunded: result?.refunded ?? false,
            amountSats: result?.amount_sats ?? 0,
            alreadyCancelled: result?.already_cancelled ?? false,
        });

        // Write audit trail entry
        await writeAuditLog(supabase, {
            actorId,
            actorRole: "user",
            action: "job.cancelled",
            resourceType: "job",
            resourceId: jobId,
            details: {
                previous_status: job.status,
                refunded: result?.refunded ?? false,
                amount_sats: result?.amount_sats ?? 0,
                title: job.title,
            },
            ipAddress: req.headers.get("x-forwarded-for"),
            userAgent: req.headers.get("user-agent"),
        });

        // Log function execution
        await logFunctionExecution(supabase, {
            functionName: "cancel-job",
            actorId,
            status: "success",
            durationMs: Date.now() - startTime,
            requestMeta: getRequestMeta(req),
            responseMeta: { status: 200, jobId },
        });

        return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        const supabase = createAdminClient();

        await logFunctionExecution(supabase, {
            functionName: "cancel-job",
            actorId,
            status: "error",
            durationMs: Date.now() - startTime,
            requestMeta: getRequestMeta(req),
            errorMessage: (error as Error).message,
        });

        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
