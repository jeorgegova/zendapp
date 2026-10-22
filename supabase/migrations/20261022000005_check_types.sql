CREATE OR REPLACE FUNCTION public._check_types()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res json;
BEGIN
  SELECT json_agg(json_build_object(
    'table', table_name,
    'col', column_name,
    'data_type', data_type,
    'udt_name', udt_name
  ))
  INTO v_res
  FROM information_schema.columns
  WHERE table_schema IN ('public', 'auth')
    AND table_name IN ('profiles', 'users');

  RETURN v_res;
END;
$$;
