-- Debug inspect users and identities
CREATE OR REPLACE FUNCTION public.debug_inspect_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_users json;
  v_identities json;
BEGIN
  SELECT json_agg(u) INTO v_users FROM auth.users u;
  SELECT json_agg(i) INTO v_identities FROM auth.identities i;
  RETURN json_build_object('users', v_users, 'identities', v_identities);
END;
$$;
