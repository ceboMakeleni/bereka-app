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
    const log = createLogger("create-wallet", actorId);

    const supabase = createAdminClient();

    // Check if wallet already exists (idempotency)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("lnbits_id")
      .eq("id", actorId)
      .single();

    if (existingProfile?.lnbits_id) {
      log.info("Wallet already exists — idempotent return", { walletId: existingProfile.lnbits_id });

      await logFunctionExecution(supabase, {
        functionName: "create-wallet",
        actorId,
        status: "success",
        durationMs: Date.now() - startTime,
        requestMeta: getRequestMeta(req),
        responseMeta: { status: 200, idempotent: true },
      });

      return new Response(
        JSON.stringify({
          wallet_id: existingProfile.lnbits_id,
          message: "Wallet already exists",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lnbitsUrl = Deno.env.get("LNBITS_URL");
    const adminKey = Deno.env.get("LNBITS_ADMIN_KEY");

    if (!lnbitsUrl || !adminKey) {
      throw new Error("Missing LNbits configuration");
    }

    log.info("Creating LNbits wallet");

    // Create a new LNbits account + wallet via the core API
    const response = await fetch(`${lnbitsUrl}/api/v1/account`, {
      method: "POST",
      headers: {
        "X-Api-Key": adminKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: actorId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      log.error("LNbits API error", { status: response.status, response: text });
      throw new Error(`LNbits API error: ${response.status}`);
    }

    const wallet = await response.json();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        lnbits_id: wallet.user,
        lnbits_admin_key: wallet.adminkey,
        lnbits_invoice_key: wallet.inkey,
      })
      .eq("id", actorId);

    if (updateError) {
      log.error("Failed to save wallet keys to profile", { error: updateError.message });
      throw new Error("Failed to save wallet keys to profile");
    }

    log.info("Wallet created successfully", { walletId: wallet.id });

    // Write audit trail entry
    await writeAuditLog(supabase, {
      actorId,
      actorRole: "worker",
      action: "wallet.created",
      resourceType: "profile",
      resourceId: actorId,
      details: { wallet_id: wallet.id },
      ipAddress: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    await logFunctionExecution(supabase, {
      functionName: "create-wallet",
      actorId,
      status: "success",
      durationMs: Date.now() - startTime,
      requestMeta: getRequestMeta(req),
      responseMeta: { status: 200 },
    });

    // Only return wallet_id and balance — never expose keys to client
    return new Response(JSON.stringify({ wallet_id: wallet.id, balance: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const supabase = createAdminClient();

    await logFunctionExecution(supabase, {
      functionName: "create-wallet",
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
