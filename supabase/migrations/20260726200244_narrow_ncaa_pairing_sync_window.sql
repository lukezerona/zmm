do $$
declare
  target_job record;
  updated_command text;
begin
  for target_job in
    select jobid, jobname, command
    from cron.job
    where jobname in (
      'sync-ncaa-region-pairings-hourly',
      'manage-espn-sync-season'
    )
  loop
    updated_command := replace(
      target_job.command,
      'config.tournament_start - 10',
      'config.tournament_start - 4'
    );

    if updated_command = target_job.command then
      raise exception
        'Could not update the NCAA pairing window in Cron job %.',
        target_job.jobname;
    end if;

    perform cron.alter_job(
      job_id := target_job.jobid,
      command := updated_command
    );
  end loop;
end
$$;
