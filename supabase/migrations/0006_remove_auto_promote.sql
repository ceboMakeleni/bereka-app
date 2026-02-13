-- Migration: Remove auto-promote admin trigger
-- The hardcoded admin email in auto_promote_admin() is a security risk.
-- Admin promotion will now be done manually via SQL:
--   UPDATE profiles SET role = 'admin' WHERE email = 'user@example.com';

DROP TRIGGER IF EXISTS on_auth_user_created_promote ON auth.users;
DROP FUNCTION IF EXISTS auto_promote_admin();
