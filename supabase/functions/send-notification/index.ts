import { getCorsHeaders } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/auth.ts";

interface NotificationPayload {
  type: string;
  recipientUserId: string;
  jobId?: string;
  amount?: number;
  resolution?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // FIX 6: Verify this is an internal/service call
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!authHeader || !serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: NotificationPayload = await req.json();
    const { type, recipientUserId, jobId, amount, resolution } = payload;

    if (!type || !recipientUserId) {
      throw new Error("Missing required fields: type, recipientUserId");
    }

    const supabase = createAdminClient();

    // Get recipient email
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.admin.getUserById(recipientUserId);

    if (userError || !user?.email) {
      console.log(
        `Could not find email for user ${recipientUserId}, skipping notification`
      );
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = user.email;
    let subject = "";
    let body = "";

    // Get job title if available
    let jobTitle = "Unknown Job";
    if (jobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("title")
        .eq("id", jobId)
        .single();
      if (job) jobTitle = job.title;
    }

    switch (type) {
      case "JOB_ACCEPTED":
        subject = `Your application has been accepted: ${jobTitle}`;
        body = `Congratulations! Your application for "${jobTitle}" has been accepted. You can now start working on the task.`;
        break;
      case "APPLICATION_RECEIVED":
        subject = `New application received: ${jobTitle}`;
        body = `Someone has applied to your job "${jobTitle}". Review the application in your dashboard.`;
        break;
      case "SUBMISSION_READY":
        subject = `Work submitted for review: ${jobTitle}`;
        body = `The worker has submitted their work for "${jobTitle}". Please review it in your dashboard.`;
        break;
      case "PAYOUT_APPROVED":
        subject = `Payout approved: ${jobTitle}`;
        body = `Your work on "${jobTitle}" has been approved! ${amount ? `${amount.toLocaleString()} sats` : "Your payment"} has been credited to your available balance.`;
        break;
      case "DISPUTE_RESOLVED":
        subject = `Dispute resolved: ${jobTitle}`;
        body = `The dispute for "${jobTitle}" has been resolved. Resolution: ${resolution ?? "See dashboard for details"}.`;
        break;
      case "DISPUTE_OPENED":
        subject = `A dispute has been opened: ${jobTitle}`;
        body = `A dispute has been opened on "${jobTitle}". An admin will review and resolve it.`;
        break;
      case "PAYMENT_RECEIVED":
        subject = `Payment received: ${amount ? `${amount.toLocaleString()} sats` : "funds"} added`;
        body = `Your Lightning payment of ${amount ? `${amount.toLocaleString()} sats` : "funds"} has been received and credited to your available balance.`;
        break;
      default:
        subject = "Bereka notification";
        body = "You have a new notification on Bereka. Check your dashboard for details.";
    }

    // Send email via Resend API
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (resendApiKey) {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "Bereka <noreply@bereka.co.za>",
          to: [email],
          subject,
          html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #eab308;">&#9889; Bereka</h2>
            <p>${body}</p>
            <hr style="border-color: #e5e7eb; margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px;">This is an automated notification from Bereka.</p>
          </div>`,
        }),
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        console.error(
          `Failed to send email to ${email}: ${resendResponse.statusText} - ${errorText}`
        );
      }
    } else {
      // Dev mode: log to console
      console.log(
        `[NOTIFICATION] To: ${email} | Subject: ${subject} | Body: ${body}`
      );
    }

    // Persist in-app notification to the database
    try {
      const { error: insertError } = await supabase
        .from("notifications")
        .insert({
          user_id: recipientUserId,
          type,
          title: subject,
          message: body,
          job_id: jobId ?? null,
          read: false,
        });

      if (insertError) {
        console.error("Failed to insert notification:", insertError);
      }
    } catch (dbError) {
      // Non-blocking — email was already sent
      console.error("Notification DB insert failed:", dbError);
    }

    return new Response(
      JSON.stringify({ success: true, type, recipient: email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Notification error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
