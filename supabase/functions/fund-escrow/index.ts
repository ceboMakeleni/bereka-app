import { getCorsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    const userId = user.id;

    const { jobId } = await req.json();
    if (!jobId) throw new Error("Missing jobId");

    const supabase = createAdminClient();

    // Get Job Details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) throw new Error("Job not found");
    if (job.creator_id !== userId) throw new Error("Unauthorized");
    if (job.status !== "OPEN") throw new Error("Job is not in OPEN state");

    // Get user accounts
    const { data: availableAcc } = await supabase.rpc("get_account_id", {
      target_user_id: userId,
      account_type: "AVAILABLE",
    });
    const { data: escrowAcc } = await supabase.rpc("get_account_id", {
      target_user_id: userId,
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

    if (holdError) console.error("escrow_holds upsert error:", holdError);

    // Mark job as funded
    await supabase.from("jobs").update({ status: "FUNDED" }).eq("id", jobId);

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
