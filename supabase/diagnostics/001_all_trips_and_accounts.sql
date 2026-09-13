-- Read-only audit: every trip, including archived/recently deleted rows, with
-- its creator and membership accounts. Run in the Supabase SQL Editor.

select
  trip.id,
  trip.title,
  trip.destination_summary,
  trip.start_date,
  trip.end_date,
  trip.status,
  trip.deleted_at,
  trip.created_at,
  creator.email as created_by_email,
  lower(coalesce(creator.email, '')) = 'bingalan1@gmail.com'
    or exists (
      select 1
      from public.trip_members access
      join auth.users account on account.id = access.user_id
      where access.trip_id = trip.id
        and lower(account.email) = 'bingalan1@gmail.com'
        and access.status = 'active'
        and access.removed_at is null
    ) as bingalan1_should_see,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'email', account.email,
      'role', member.role,
      'status', member.status,
      'removed_at', member.removed_at
    ) order by account.email)
    from public.trip_members member
    join auth.users account on account.id = member.user_id
    where member.trip_id = trip.id
  ), '[]'::jsonb) as member_accounts
from public.trips trip
left join auth.users creator on creator.id = trip.created_by
order by trip.created_at desc;
