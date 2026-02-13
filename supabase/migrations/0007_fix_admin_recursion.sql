-- Fix: Infinite recursion in RLS policies (PostgreSQL error 42P17)
-- The "Admins can view all profiles" policy references profiles itself,
-- causing infinite recursion when any table's admin policy queries profiles.
--
-- Solution: Create a SECURITY DEFINER function that bypasses RLS to check admin status.

-- 1. Create the is_admin() helper (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Fix profiles table policies (self-referential recursion)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

-- 3. Fix accounts table policies
DROP POLICY IF EXISTS "Admins can view all accounts" ON accounts;
CREATE POLICY "Admins can view all accounts"
  ON accounts FOR SELECT
  USING (is_admin());

-- 4. Fix ledger_entries table policies
DROP POLICY IF EXISTS "Admins can view all ledger entries" ON ledger_entries;
CREATE POLICY "Admins can view all ledger entries"
  ON ledger_entries FOR SELECT
  USING (is_admin());

-- 5. Fix payment_events table policies
DROP POLICY IF EXISTS "Admins can view all payment events" ON payment_events;
CREATE POLICY "Admins can view all payment events"
  ON payment_events FOR SELECT
  USING (is_admin());

-- 6. Fix disputes table policies
DROP POLICY IF EXISTS "Admins can view all disputes" ON disputes;
CREATE POLICY "Admins can view all disputes"
  ON disputes FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can update disputes" ON disputes;
CREATE POLICY "Admins can update disputes"
  ON disputes FOR UPDATE
  USING (is_admin());

-- 7. Fix job_categories table policies
DROP POLICY IF EXISTS "Admins can create categories" ON job_categories;
CREATE POLICY "Admins can create categories"
  ON job_categories FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update categories" ON job_categories;
CREATE POLICY "Admins can update categories"
  ON job_categories FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete categories" ON job_categories;
CREATE POLICY "Admins can delete categories"
  ON job_categories FOR DELETE
  USING (is_admin());

-- 8. Fix storage policies (submission_files bucket)
DROP POLICY IF EXISTS "Admins can view all submission files" ON storage.objects;
CREATE POLICY "Admins can view all submission files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'submission_files' AND is_admin());

DROP POLICY IF EXISTS "Admins can delete submission files" ON storage.objects;
CREATE POLICY "Admins can delete submission files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'submission_files' AND is_admin());
