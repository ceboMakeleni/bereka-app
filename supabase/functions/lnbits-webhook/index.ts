import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyWebhookSecret, createAdminClient } from "../_shared/auth.ts";
import { processIncomingPayment } from "../_shared/processIncomingPayment.ts";
import { createLogger } from "../_shared/logger.ts";
import { writeAuditLog, logFunctionExecution, getRequestMeta } from "../_shared/audit.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const log = createLogger("lnbits-webhook", null);

  try {
    // Verify webhook secret (not JWT — this is called by LNbits)
    if (!verifyWebhookSecret(req)) {
      log.warn("Invalid webhook secret — rejected");

      const supabase = createAdminClient();
      await logFunctionExecution(supabase, {
        functionName: "lnbits-webhook",
        actorId: null,
        status: "error",
        durationMs: Date.now() - startTime,
        requestMeta: getRequestMeta(req),
        errorMessage: "Invalid webhook secret",
      });

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

    log.info("Processing webhook", { paymentHash });

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
      log.warn("Payment processing skipped", { error: (err as Error).message, paymentHash });

      await logFunctionExecution(supabase, {
        functionName: "lnbits-webhook",
        actorId: null,
        status: "warning",
        durationMs: Date.now() - startTime,
        requestMeta: getRequestMeta(req),
        responseMeta: { status: 200, skipped: true },
        errorMessage: (err as Error).message,
      });

      return new Response(
        JSON.stringify({ received: true, message: "Payment not found in system" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Webhook payment processed", {
      paymentHash,
      amount: result.amount,
      alreadyProcessed: result.alreadyProcessed,
    });

    // Write audit trail entry for webhook-processed payment
    if (!result.alreadyProcessed) {
      // Get user_id from the payment intent for audit
      const { data: intent } = await supabase
        .from("payment_intents")
        .select("user_id")
        .eq("payment_hash", paymentHash)
        .single();

      if (intent) {
        await writeAuditLog(supabase, {
          actorId: null,
          actorRole: "system",
          action: "payment.webhook_processed",
          resourceType: "payment",
          resourceId: paymentHash,
          details: {
            amount_sats: result.amount,
            user_id: intent.user_id,
            source: "lnbits_webhook",
          },
        });
      }
    }

    await logFunctionExecution(supabase, {
      functionName: "lnbits-webhook",
      actorId: null,
      status: "success",
      durationMs: Date.now() - startTime,
      requestMeta: getRequestMeta(req),
      responseMeta: {
        status: 200,
        processed: !result.alreadyProcessed,
        amount: result.amount,
      },
    });

    // Send notification (non-blocking)
    if (!result.alreadyProcessed) {
      try {
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
        log.warn("Notification failed (non-blocking)", { error: (notifError as Error).message });
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
    log.error("Webhook processing error", { error: (error as Error).message });

    const supabase = createAdminClient();
    await logFunctionExecution(supabase, {
      functionName: "lnbits-webhook",
      actorId: null,
      status: "error",
      durationMs: Date.now() - startTime,
      requestMeta: getRequestMeta(req),
      errorMessage: (error as Error).message,
    });

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
