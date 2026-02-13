import { createUserClient, createAdminClient } from "./supabase.ts";

/**
 * Extracts and verifies the authenticated user from the request's Authorization header.
 * Returns the user object or throws if not authenticated.
 */
export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    throw new Error("Missing auth token");
  }

  const supabase = createUserClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Invalid or expired auth token");
  }

  return user;
}

/**
 * Verifies the webhook secret from query params or headers.
 * Used for the LNbits webhook endpoint which is not user-authenticated.
 */
export function verifyWebhookSecret(req: Request): boolean {
  const webhookSecret = Deno.env.get("LNBITS_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("LNBITS_WEBHOOK_SECRET not set — rejecting webhook for security");
    return false;
  }

  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = req.headers.get("x-webhook-secret");

  return querySecret === webhookSecret || headerSecret === webhookSecret;
}

// Re-export for convenience
export { createAdminClient, createUserClient } from "./supabase.ts";
