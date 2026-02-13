-- ============================================================================
-- Fix: Split profile triggers into BEFORE and AFTER INSERT
-- ============================================================================
-- The previous migration (0002) changed create_user_accounts to a BEFORE INSERT
-- trigger, but accounts.user_id has a foreign key to profiles.id. Since the
-- profile row doesn't exist yet during BEFORE INSERT, the FK constraint fails.
--
-- Fix: Use two separate triggers:
--   1. BEFORE INSERT: promote_admin_on_signup (modifies NEW.role)
--   2. AFTER INSERT: create_user_accounts (creates accounts rows)
-- ============================================================================

-- 1. Create a dedicated admin promotion function (BEFORE INSERT)
CREATE OR REPLACE FUNCTION promote_admin_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = NEW.id AND email = 'cebomakeleni@gmail.com'
  ) THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Restore create_user_accounts to only handle account creation (AFTER INSERT)
CREATE OR REPLACE FUNCTION create_user_accounts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (user_id, type, balance_sats)
  VALUES (NEW.id, 'AVAILABLE', 0), (NEW.id, 'ESCROW', 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Drop the combined trigger from 0002
DROP TRIGGER IF EXISTS on_profile_created ON profiles;

-- 4. Create the BEFORE INSERT trigger for admin promotion
CREATE TRIGGER on_profile_promote_admin
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION promote_admin_on_signup();

-- 5. Create the AFTER INSERT trigger for account creation
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION create_user_accounts();
