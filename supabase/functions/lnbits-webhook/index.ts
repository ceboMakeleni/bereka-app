import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyWebhookSecret, createAdminClient } from "../_shared/auth.ts";
import { processIncomingPayment } from "../_shared/processIncomingPayment.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify webhook secret (not JWT — this is called by LNbits)
    if (!verifyWebhookSecret(req)) {
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookData = await req.json();
    const paymentHash = webhookData.payment_hash;

    if (!paymentHash) {
      throw new Error("Missing payment_hash in webhook payload");
    }

    console.log("Processing webhook for payment:", paymentHash);

    const supabase = createAdminClient();

    // Use centralized idempotent payment processing
    let result;
    try {
      result = await processIncomingPayment(
        supabase,
        paymentHash,
        "lnbits_webhook",
        webhookData
      );
    } catch (err) {
      // Payment intent not found — acknowledge webhook to prevent retries
      console.warn("Payment processing skipped:", (err as Error).message);
      return new Response(
        JSON.stringify({ received: true, message: "Payment not found in system" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notification (non-blocking)
    if (!result.alreadyProcessed) {
      try {
        // Get user_id from the payment intent
        const { data: intent } = await supabase
          .from("payment_intents")
          .select("user_id")
          .eq("payment_hash", paymentHash)
          .single();

        if (intent) {
          await supabase.functions.invoke("send-notification", {
            body: {
              type: "PAYMENT_RECEIVED",
              recipientUserId: intent.user_id,
              amount: result.amount,
            },
          });
        }
      } catch (notifError) {
        console.error("Notification error:", notifError);
      }
    }

    return new Response(
      JSON.stringify({
        received: true,
        processed: !result.alreadyProcessed,
        amount: result.amount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Return 200 even on error to prevent LNbits from retrying
    return new Response(
      JSON.stringify({ received: true, error: (error as Error).message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
