create index tournament_launches_approved_by_idx
on public.tournament_launches (approved_by)
where approved_by is not null;
