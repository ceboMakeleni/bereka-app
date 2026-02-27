import { getCorsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";
import { processIncomingPayment } from "../_shared/processIncomingPayment.ts";
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
    // Authenticate the user making the polling request
    const user = await getAuthenticatedUser(req);
    actorId = user.id;
    const log = createLogger("check-payment", actorId);

    const { paymentHash } = await req.json();
    if (!paymentHash) throw new Error("Missing paymentHash");

    // Validate paymentHash format (hex string, 64 chars for SHA256)
    if (typeof paymentHash !== "string" || !/^[a-f0-9]{64}$/i.test(paymentHash)) {
      throw new Error("Invalid paymentHash format");
    }

    log.info("Payment check initiated", { paymentHash });

    const supabase = createAdminClient();

    // Verify payment intent exists AND belongs to the authenticated user
    const { data: intent } = await supabase
      .from("payment_intents")
      .select("status, user_id, amount_sats")
      .eq("payment_hash", paymentHash)
      .single();

    if (!intent || intent.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already completed (fast path, no LNbits call needed)
    if (intent.status === "COMPLETED") {
      log.info("Payment already completed (fast path)", { paymentHash });

      await logFunctionExecution(supabase, {
        functionName: "check-payment",
        actorId,
        status: "success",
        durationMs: Date.now() - startTime,
        requestMeta: getRequestMeta(req),
        responseMeta: { status: 200, paid: true, fastPath: true },
      });

      return new Response(JSON.stringify({ paid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the user's LNbits invoice key to check payment status
    const { data: profile } = await supabase
      .from("profiles")
      .select("lnbits_invoice_key")
      .eq("id", user.id)
      .single();

    const lnbitsUrl = Deno.env.get("LNBITS_URL");
    const invoiceKey = profile?.lnbits_invoice_key;

    if (!lnbitsUrl || !invoiceKey) {
      throw new Error("Missing LNbits configuration or user wallet");
    }

    // Check LNbits for payment status
    const response = await fetch(
      `${lnbitsUrl}/api/v1/payments/${paymentHash}`,
      {
        method: "GET",
        headers: {
          "X-Api-Key": invoiceKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      const data = await response.json();

      if (data.paid) {
        // Use centralized idempotent payment processing
        const result = await processIncomingPayment(
          supabase,
          paymentHash,
          "lnbits_poll",
          data
        );

        log.info("Payment confirmed via polling", {
          paymentHash,
          amount: result.amount,
          alreadyProcessed: result.alreadyProcessed,
        });

        // Write audit trail entry for completed payment
        if (!result.alreadyProcessed) {
          await writeAuditLog(supabase, {
            actorId,
            actorRole: "worker",
            action: "payment.completed",
            resourceType: "payment",
            resourceId: paymentHash,
            details: { amount_sats: result.amount, source: "poll" },
            ipAddress: req.headers.get("x-forwarded-for"),
          });
        }

        await logFunctionExecution(supabase, {
          functionName: "check-payment",
          actorId,
          status: "success",
          durationMs: Date.now() - startTime,
          requestMeta: getRequestMeta(req),
          responseMeta: { status: 200, paid: true },
        });

        return new Response(JSON.stringify({ paid: true, amount: result.amount }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    await logFunctionExecution(supabase, {
      functionName: "check-payment",
      actorId,
      status: "success",
      durationMs: Date.now() - startTime,
      requestMeta: getRequestMeta(req),
      responseMeta: { status: 200, paid: false },
    });

    return new Response(JSON.stringify({ paid: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const supabase = createAdminClient();

    await logFunctionExecution(supabase, {
      functionName: "check-payment",
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
