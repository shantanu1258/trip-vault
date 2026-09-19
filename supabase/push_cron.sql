-- Run ONLY after deploying and testing push-dispatch. Enable Cron and pg_net in
-- the Dashboard first. Create these two Vault secrets via the Dashboard:
-- push_project_url = https://YOUR_PROJECT_REF.supabase.co
-- push_dispatch_secret = the SAME value as the PUSH_DISPATCH_SECRET function secret.
-- Do not put either credential value in this tracked SQL file.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='push_project_url'
       and decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/?$') or
     not exists (select 1 from vault.decrypted_secrets where name='push_dispatch_secret' and length(decrypted_secret)>=32) then
    raise exception 'Configure the push_project_url and push_dispatch_secret Vault secrets first';
  end if;
end $$;

select cron.schedule('trip-vault-push-dispatch', '* * * * *', $$
  select net.http_post(
    url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name='push_project_url') || '/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='push_dispatch_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Emergency pause (run separately):
-- select cron.unschedule('trip-vault-push-dispatch');
