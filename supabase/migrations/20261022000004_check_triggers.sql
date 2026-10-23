CREATE OR REPLACE FUNCTION public._check_triggers()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_triggers json;
BEGIN
  SELECT json_agg(json_build_object(
    'trigger_name', trigger_name,
    'event_object_schema', event_object_schema,
    'event_object_table', event_object_table,
    'action_statement', action_statement
  ))
  INTO v_triggers
  FROM information_schema.triggers
  WHERE event_object_table IN ('users', 'profiles', 'identities');

  RETURN v_triggers;
END;
$$;
