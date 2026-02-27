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
    const log = createLogger("resolve-dispute", actorId);

    const { jobId, resolution } = await req.json();
    if (!jobId || !resolution) {
      throw new Error("Missing required fields: jobId, resolution");
    }

    log.info("Dispute resolution initiated", { jobId, resolution });

    const supabase = createAdminClient();

    // Verify admin role
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", actorId)
      .single();

    if (adminError || !adminProfile || adminProfile.role !== "admin") {
      log.warn("Unauthorized dispute resolution attempt", { jobId });
      throw new Error("Unauthorized: Admin role required");
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) throw new Error("Job not found");
    if (job.status !== "DISPUTED") throw new Error("Job is not in DISPUTED state");

    // Use atomic dispute payout
    const { data: result, error: payoutError } = await supabase.rpc(
      "atomic_dispute_payout",
      {
        p_job_id: jobId,
        p_resolution: resolution,
        p_admin_id: actorId,
      }
    );

    if (payoutError) {
      log.error("Dispute payout RPC failed", { jobId, error: payoutError.message });
      throw new Error(`Dispute payout failed: ${payoutError.message}`);
    }

    if (!result?.success) {
      throw new Error("Dispute payout did not succeed");
    }

    log.info("Dispute resolved successfully", {
      jobId,
      resolution,
      amount: result?.amount ?? 0,
      creatorId: job.creator_id,
      workerId: job.worker_id,
    });

    // Write audit trail entry (critical — admin action)
    await writeAuditLog(supabase, {
      actorId,
      actorRole: "admin",
      action: "dispute.resolved",
      resourceType: "dispute",
      resourceId: jobId,
      details: {
        resolution,
        amount_sats: result?.amount ?? 0,
        creator_id: job.creator_id,
        worker_id: job.worker_id,
        job_title: job.title,
      },
      ipAddress: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    // Log function execution
    await logFunctionExecution(supabase, {
      functionName: "resolve-dispute",
      actorId,
      status: "success",
      durationMs: Date.now() - startTime,
      requestMeta: getRequestMeta(req),
      responseMeta: { status: 200, resolution },
    });

    // Send notifications to both parties (non-blocking)
    const notifyParties = [job.creator_id, job.worker_id].filter(Boolean);
    for (const partyUserId of notifyParties) {
      try {
        await supabase.functions.invoke("send-notification", {
          body: {
            type: "DISPUTE_RESOLVED",
            recipientUserId: partyUserId,
            jobId,
            resolution,
          },
        });
      } catch (_) {
        /* non-blocking */
      }
    }

    return new Response(JSON.stringify({ success: true, resolution }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const supabase = createAdminClient();

    await logFunctionExecution(supabase, {
      functionName: "resolve-dispute",
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
