alter table public.brackets
drop constraint if exists brackets_tiebreaker_total;

alter table public.brackets
alter column tiebreaker_total type numeric
using tiebreaker_total::numeric;

alter table public.brackets
add constraint brackets_tiebreaker_total
check (
  tiebreaker_total is null
  or (
    tiebreaker_total >= 0
    and tiebreaker_total = trunc(tiebreaker_total)
  )
);
