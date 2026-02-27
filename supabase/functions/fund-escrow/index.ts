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
    const log = createLogger("fund-escrow", actorId);

    const { jobId } = await req.json();
    if (!jobId) throw new Error("Missing jobId");

    log.info("Escrow funding initiated", { jobId });

    const supabase = createAdminClient();

    // Get Job Details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) throw new Error("Job not found");
    if (job.creator_id !== actorId) throw new Error("Unauthorized");
    if (job.status !== "OPEN") throw new Error("Job is not in OPEN state");

    // Get user accounts
    const { data: availableAcc } = await supabase.rpc("get_account_id", {
      target_user_id: actorId,
      account_type: "AVAILABLE",
    });
    const { data: escrowAcc } = await supabase.rpc("get_account_id", {
      target_user_id: actorId,
      account_type: "ESCROW",
    });

    if (!availableAcc || !escrowAcc) throw new Error("Accounts not found");

    // Move funds from available to escrow
    const { error: moveError } = await supabase.rpc("move_funds", {
      from_account_id: availableAcc,
      to_account_id: escrowAcc,
      amount: job.budget_sats,
      ref_type: "ESCROW_LOCK",
      ref_id: jobId,
    });

    if (moveError) throw moveError;

    // Record escrow hold (with duplicate guard via upsert on unique job_id)
    const { error: holdError } = await supabase.from("escrow_holds").upsert(
      {
        job_id: jobId,
        amount_sats: job.budget_sats,
        status: "HELD",
      },
      { onConflict: "job_id" }
    );

    if (holdError) {
      log.warn("Escrow hold upsert error (non-blocking)", { error: holdError.message });
    }

    // Mark job as funded
    await supabase.from("jobs").update({ status: "FUNDED" }).eq("id", jobId);

    log.info("Escrow funding completed", { jobId, amount: Number(job.budget_sats) });

    // Write audit trail entry
    await writeAuditLog(supabase, {
      actorId,
      actorRole: "client",
      action: "escrow.funded",
      resourceType: "job",
      resourceId: jobId,
      details: {
        amount_sats: Number(job.budget_sats),
        from_account: availableAcc,
        to_account: escrowAcc,
      },
      ipAddress: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    // Log function execution
    await logFunctionExecution(supabase, {
      functionName: "fund-escrow",
      actorId,
      status: "success",
      durationMs: Date.now() - startTime,
      requestMeta: getRequestMeta(req),
      responseMeta: { status: 200, jobId },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const supabase = createAdminClient();

    await logFunctionExecution(supabase, {
      functionName: "fund-escrow",
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
