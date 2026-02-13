-- Migration: Restrict profiles table RLS
-- Fixes: CRITICAL - profiles table was publicly readable, exposing lnbits_admin_key and lnbits_invoice_key

-- Drop the overly permissive SELECT policy that allows anyone to read all profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Users can only read their own full profile (includes wallet keys for server-side use)
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can read all profiles (needed for admin dashboard)
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
