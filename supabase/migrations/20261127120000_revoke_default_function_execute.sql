-- New functions in public are closed to anon/authenticated by default.
-- Supabase's default privileges grant EXECUTE on every new function to
-- anon and authenticated, which is how caller-less SECURITY DEFINER RPCs
-- ended up callable from the browser. Existing functions are unchanged
-- (this only affects functions created from now on by postgres).
-- Any RPC the browser needs must now be granted explicitly:
--   GRANT EXECUTE ON FUNCTION public.my_rpc(...) TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
