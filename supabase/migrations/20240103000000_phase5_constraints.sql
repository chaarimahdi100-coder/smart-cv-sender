-- Add unique constraint to prevent duplicate applications
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'unique_application_per_opportunity') then
    alter table applications
      add constraint unique_application_per_opportunity unique (user_id, opportunity_id);
  end if;
end $$;
