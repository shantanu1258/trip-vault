-- Repair projects that installed 202609140001 with a hotel function that
-- referenced a non-existent enum. itinerary_items.timing_mode is deliberately
-- text constrained by itinerary_timing_mode_check, so the function must write
-- text values rather than casting to public.event_timing_mode.

do $migration$
declare
  function_id regprocedure := to_regprocedure('public.save_hotel_stay(jsonb,uuid[],jsonb)');
  function_definition text;
begin
  if function_id is null then
    raise exception 'Run 202609140001_event_form_data_model.sql before this repair';
  end if;

  function_definition := pg_get_functiondef(function_id);
  function_definition := replace(
    function_definition,
    '::public.event_timing_mode',
    ''
  );

  if strpos(function_definition, 'public.event_timing_mode') > 0 then
    raise exception 'Could not remove the stale hotel timing enum reference';
  end if;

  execute function_definition;
end
$migration$;
