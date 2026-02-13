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

    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) throw new Error("Job not found");
    if (job.creator_id !== userId) throw new Error("Unauthorized");
    if (job.status !== "IN_PROGRESS" && job.status !== "REVIEW") {
      throw new Error("Job not ready for payout");
    }
    if (!job.worker_id) throw new Error("No worker assigned to this job");

    // Use atomic_payout stored procedure (idempotent — returns early if already COMPLETED)
    const { data: result, error: payoutError } = await supabase.rpc(
      "atomic_payout",
      {
        p_job_id: jobId,
        p_creator_id: job.creator_id,
        p_worker_id: job.worker_id,
        p_budget_sats: Number(job.budget_sats),
      }
    );

    if (payoutError) {
      console.error("Payout error:", payoutError);
      throw new Error(`Payout failed: ${payoutError.message}`);
    }

    // Send notification to worker (non-blocking)
    try {
      await supabase.functions.invoke("send-notification", {
        body: {
          type: "PAYOUT_APPROVED",
          recipientUserId: job.worker_id,
          jobId,
          amount: result?.payout ?? 0,
        },
      });
    } catch (_) {
      /* notification failure is non-blocking */
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
