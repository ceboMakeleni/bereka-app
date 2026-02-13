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

    const { amountSats } = await req.json();
    const amount = amountSats;

    // FIX 10: Validate amount is a positive integer within reasonable bounds
    if (!amount || typeof amount !== "number" || !Number.isInteger(amount) || amount < 100 || amount > 10_000_000) {
      throw new Error("Invalid amount: must be an integer between 100 and 10,000,000 sats");
    }

    const supabase = createAdminClient();

    // Get user's LNbits invoice key
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("lnbits_invoice_key")
      .eq("id", userId)
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
        memo: `Bereka top-up for ${userId}`,
        expiry: 3600,
        unit: "sat",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("LNbits Error:", errText);
      throw new Error(`LNbits API error: ${response.status}`);
    }

    const data = await response.json();

    // Store payment intent
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const { error: dbError } = await supabase.from("payment_intents").insert({
      payment_hash: data.payment_hash,
      user_id: userId,
      amount_sats: amount,
      payment_request: data.payment_request,
      status: "PENDING",
      expires_at: expiresAt,
    });

    if (dbError) throw dbError;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
