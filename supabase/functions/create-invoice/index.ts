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
    const log = createLogger("create-invoice", actorId);

    const { amountSats } = await req.json();
    const amount = amountSats;

    // Validate amount is a positive integer within reasonable bounds
    if (!amount || typeof amount !== "number" || !Number.isInteger(amount) || amount < 100 || amount > 10_000_000) {
      throw new Error("Invalid amount: must be an integer between 100 and 10,000,000 sats");
    }

    log.info("Invoice creation initiated", { amount });

    const supabase = createAdminClient();

    // Get user's LNbits invoice key
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("lnbits_invoice_key")
      .eq("id", actorId)
      .single();

    if (profileError || !profile?.lnbits_invoice_key) {
      throw new Error("User wallet not found. Please create a wallet first.");
    }

    const lnbitsUrl = Deno.env.get("LNBITS_URL");
    if (!lnbitsUrl) throw new Error("Missing LNbits configuration");

    const invoiceKey = profile.lnbits_invoice_key;

    const response = await fetch(`${lnbitsUrl}/api/v1/payments`, {
      method: "POST",
      headers: {
        "X-Api-Key": invoiceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        out: false,
        amount,
        memo: `Bereka top-up for ${actorId}`,
        expiry: 3600,
        unit: "sat",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.error("LNbits invoice creation failed", { status: response.status, response: errText });
      throw new Error(`LNbits API error: ${response.status}`);
    }

    const data = await response.json();

    // Store payment intent
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const { error: dbError } = await supabase.from("payment_intents").insert({
      payment_hash: data.payment_hash,
      user_id: actorId,
      amount_sats: amount,
      payment_request: data.payment_request,
      status: "PENDING",
      expires_at: expiresAt,
    });

    if (dbError) throw dbError;

    log.info("Invoice created successfully", { paymentHash: data.payment_hash, amount });

    // Write audit trail entry
    await writeAuditLog(supabase, {
      actorId,
      actorRole: "worker",
      action: "payment.invoice_created",
      resourceType: "payment",
      resourceId: data.payment_hash,
      details: { amount_sats: amount, expires_at: expiresAt },
      ipAddress: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    await logFunctionExecution(supabase, {
      functionName: "create-invoice",
      actorId,
      status: "success",
      durationMs: Date.now() - startTime,
      requestMeta: getRequestMeta(req),
      responseMeta: { status: 200, paymentHash: data.payment_hash },
    });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const supabase = createAdminClient();

    await logFunctionExecution(supabase, {
      functionName: "create-invoice",
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
