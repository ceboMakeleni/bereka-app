import { getCorsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    const adminId = user.id;

    const { jobId, resolution } = await req.json();
    if (!jobId || !resolution) {
      throw new Error("Missing required fields: jobId, resolution");
    }

    const supabase = createAdminClient();

    // Verify admin role
    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminId)
      .single();

    if (adminError || !adminProfile || adminProfile.role !== "admin") {
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
        p_admin_id: adminId,
      }
    );

    if (payoutError) {
      throw new Error(`Dispute payout failed: ${payoutError.message}`);
    }

    if (!result?.success) {
      throw new Error("Dispute payout did not succeed");
    }

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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
