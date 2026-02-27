-- Add FK from disputes.opened_by to profiles.id (in public schema)
-- PostgREST can only traverse FKs within the public schema, and the existing
-- disputes_opened_by_fkey points to auth.users which is in the auth schema
ALTER TABLE disputes
  ADD CONSTRAINT disputes_opened_by_profiles_fkey
  FOREIGN KEY (opened_by) REFERENCES profiles(id);
