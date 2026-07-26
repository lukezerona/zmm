grant usage on schema private to authenticated;

grant execute
on function private.bracket_access_state(smallint)
to authenticated;
