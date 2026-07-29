grant select (bracket_id, is_paid)
on table public.bracket_payments
to authenticated;

create policy "Authenticated users can view bracket payment status"
on public.bracket_payments
for select
to authenticated
using (true);
