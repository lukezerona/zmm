update public.espn_games
set
  round_code = 'PLAY_IN',
  is_play_in = true,
  updated_at = now()
where
  is_play_in
  or round_code ~ '^FIRST_'
  or round_code = 'OPENING_ROUND';
