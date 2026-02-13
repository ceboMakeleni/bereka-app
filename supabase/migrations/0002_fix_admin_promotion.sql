-- ============================================================================
-- Fix: Admin auto-promotion trigger timing
-- ============================================================================
-- The original `auto_promote_admin` trigger fires on `auth.users` AFTER INSERT,
-- but the profile row doesn't exist yet at that point (it's created later in
-- the app code). This means the UPDATE matches 0 rows and admin is never promoted.
--
-- Fix: Move admin promotion logic into the `create_user_accounts()` function,
-- which runs as a BEFORE INSERT trigger on `profiles`. This lets us modify
-- NEW.role before the row is inserted.
-- ============================================================================

-- 1. Replace create_user_accounts to also handle admin promotion
CREATE OR REPLACE FUNCTION create_user_accounts()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-promote admin by checking auth.users email
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = NEW.id AND email = 'cebomakeleni@gmail.com'
  ) THEN
    NEW.role := 'admin';
  END IF;

  -- Create AVAILABLE and ESCROW accounts for the new user
  INSERT INTO public.accounts (user_id, type, balance_sats)
  VALUES (NEW.id, 'AVAILABLE', 0), (NEW.id, 'ESCROW', 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Change the profiles trigger to BEFORE INSERT so we can modify NEW.role
DROP TRIGGER IF EXISTS on_profile_created ON profiles;
CREATE TRIGGER on_profile_created
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION create_user_accounts();

-- 3. Remove the old auth.users trigger (no longer needed)
DROP TRIGGER IF EXISTS on_auth_user_created_promote_admin ON auth.users;
