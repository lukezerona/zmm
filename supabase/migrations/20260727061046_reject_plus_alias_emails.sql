create or replace function public.reject_plus_alias_email(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email_address text;
  email_local_part text;
begin
  email_address := lower(coalesce(event->'user'->>'email', ''));
  email_local_part := split_part(email_address, '@', 1);

  if position('+' in email_local_part) > 0 then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code',
        400,
        'message',
        'Use one regular email address for the family account. Add family brackets inside ZMM.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute
on function public.reject_plus_alias_email(jsonb)
to supabase_auth_admin;

revoke execute
on function public.reject_plus_alias_email(jsonb)
from public, anon, authenticated;
