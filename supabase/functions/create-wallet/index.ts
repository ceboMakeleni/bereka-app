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

    const supabase = createAdminClient();

    // Check if wallet already exists (idempotency)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("lnbits_id")
      .eq("id", userId)
      .single();

    if (existingProfile?.lnbits_id) {
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

    // Create a new LNbits account + wallet via the core API
    const response = await fetch(`${lnbitsUrl}/api/v1/account`, {
      method: "POST",
      headers: {
        "X-Api-Key": adminKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: userId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("LNbits Error:", text);
      throw new Error(`LNbits API error: ${response.status}`);
    }

    // Core API returns wallet data directly:
    // { id, user, adminkey, inkey, name, ... }
    const wallet = await response.json();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        lnbits_id: wallet.user,
        lnbits_admin_key: wallet.adminkey,
        lnbits_invoice_key: wallet.inkey,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update profile with wallet keys:", updateError);
      throw new Error("Failed to save wallet keys to profile");
    }

    // FIX 1: Only return wallet_id and balance — never expose keys to client
    return new Response(JSON.stringify({ wallet_id: wallet.id, balance: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
