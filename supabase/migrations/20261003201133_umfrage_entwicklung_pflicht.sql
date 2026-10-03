-- ============================================================================
-- Entwicklung des Monats ist Pflicht (Person und Begründung), wie in der bisherigen Umfrage.
-- Nur umfrage_einreichen_v2 ändert sich. Ohne Kolleginnen entfällt die Frage.
-- ============================================================================

create or replace function public.umfrage_einreichen_v2(payload jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  t            record;
  m            record;
  v_monat      date;
  v_start      timestamptz;
  v_zeit       timestamptz;
  v_dauer      integer;
  v_abgabe     uuid;
  v_soll       integer;
  v_ist        integer;
  v_anz        integer;
  v_ent_id     uuid;
  v_ent_name   text;
  v_constraint text;
begin
  select * into t from private.teilnehmerin();
  if not found then
    raise exception 'Du nimmst nicht an der Teamumfrage teil.' using errcode = '42501';
  end if;

  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Die Umfrage ist leer oder ungültig.' using errcode = '22023';
  end if;

  -- Monat: muss zu meinen offenen Monaten gehören
  if coalesce(payload->>'monat', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Der Monat der Umfrage fehlt oder ist ungültig.' using errcode = '22023';
  end if;
  v_monat := ((payload->>'monat') || '-01')::date;

  select * into m from public.meine_monate() x where x.monat = v_monat;
  if not found then
    raise exception 'Für diesen Monat kann keine Umfrage abgegeben werden.' using errcode = '22023';
  end if;
  if m.abgegeben then
    raise exception 'Du hast die Umfrage für diesen Monat bereits abgegeben.' using errcode = '23505';
  end if;

  -- Bewertungen
  if jsonb_typeof(payload->'bewertungen') is distinct from 'array'
     or jsonb_array_length(payload->'bewertungen') = 0 then
    raise exception 'Keine Bewertungen enthalten.' using errcode = '22023';
  end if;

  if exists (
    with b as (
      select (x->>'verhalten_nr')::int as nr, (x->>'bewertete_person_id')::uuid as pid
      from jsonb_array_elements(payload->'bewertungen') x)
    select 1 from b group by nr, pid having count(*) > 1
  ) then
    raise exception 'Die Umfrage enthält doppelte Bewertungen.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload->'bewertungen') x
    where (x->>'note') is null or (x->>'note')::int not between 1 and 5
  ) then
    raise exception 'Jede Note muss zwischen 1 und 5 liegen.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload->'bewertungen') x
    where (x->>'note')::int >= 4 and nullif(btrim(x->>'kommentar'), '') is null
  ) then
    raise exception 'Ab Note 4 ist ein Kommentar Pflicht.' using errcode = '22023';
  end if;

  -- Nur bekannte, aktive Verhalten und Teilnehmerinnen des eigenen Salons
  select count(*) into v_ist
  from jsonb_array_elements(payload->'bewertungen') x
  join public.verhalten h
    on h.salon_id = t.salon_id and h.aktiv and h.nr = (x->>'verhalten_nr')::int
  join public.personen q
    on q.id = (x->>'bewertete_person_id')::uuid
   and q.salon_id = t.salon_id and q.aktiv and q.nimmt_an_teamumfrage;

  if v_ist <> jsonb_array_length(payload->'bewertungen') then
    raise exception 'Die Umfrage enthält unbekannte Verhalten oder Personen.' using errcode = '22023';
  end if;

  -- Vollständigkeit: jedes aktive Verhalten × jede aktive Teilnehmerin (inklusive mir)
  select count(*) into v_soll
  from public.verhalten h
  cross join public.personen q
  where h.salon_id = t.salon_id and h.aktiv
    and q.salon_id = t.salon_id and q.aktiv and q.nimmt_an_teamumfrage;

  if v_ist <> v_soll then
    raise exception 'Die Umfrage ist nicht vollständig. Es fehlen Bewertungen.' using errcode = '22023';
  end if;

  -- Entwicklung des Monats ist Pflicht (wie in der bisherigen Umfrage): eine andere Teilnehmerin
  -- samt Begründung. Gibt es keine Kolleginnen, entfällt die Frage.
  v_ent_id := nullif(payload->'entwicklung'->>'person_id', '')::uuid;
  if v_ent_id is null then
    if exists (select 1 from public.personen q
               where q.salon_id = t.salon_id and q.aktiv and q.nimmt_an_teamumfrage and q.id <> t.id) then
      raise exception 'Bitte wähle bei der Entwicklung des Monats eine Kollegin aus.' using errcode = '22023';
    end if;
  else
    select q.name into v_ent_name
    from public.personen q
    where q.id = v_ent_id
      and q.salon_id = t.salon_id and q.aktiv and q.nimmt_an_teamumfrage
      and q.id <> t.id;
    if not found then
      raise exception 'Für die Entwicklung des Monats kannst du eine andere Person aus dem Team wählen.'
        using errcode = '22023';
    end if;
    if nullif(btrim(payload->'entwicklung'->>'begruendung'), '') is null then
      raise exception 'Bitte begründe deine Wahl bei der Entwicklung des Monats.' using errcode = '22023';
    end if;
  end if;

  -- Rituale
  if payload ? 'rituale' and jsonb_typeof(payload->'rituale') is distinct from 'array' then
    raise exception 'Die Ritual-Antworten sind ungültig.' using errcode = '22023';
  end if;

  if exists (
    with r as (
      select (x->>'ritual_nr')::int as rn, (x->>'frage_nr')::int as fn
      from jsonb_array_elements(coalesce(payload->'rituale', '[]'::jsonb)) x)
    select 1 from r group by rn, fn having count(*) > 1
  ) then
    raise exception 'Die Ritual-Antworten enthalten doppelte Einträge.' using errcode = '22023';
  end if;

  -- jede Antwort muss zu einer aktiven Frage des Salons gehören
  select count(*) into v_anz
  from jsonb_array_elements(coalesce(payload->'rituale', '[]'::jsonb)) x
  join public.rituale ri
    on ri.salon_id = t.salon_id and ri.aktiv and ri.nr = (x->>'ritual_nr')::int
  join public.ritual_fragen f
    on f.ritual_id = ri.id and f.nr = (x->>'frage_nr')::int;

  if v_anz <> jsonb_array_length(coalesce(payload->'rituale', '[]'::jsonb)) then
    raise exception 'Die Ritual-Antworten enthalten unbekannte Fragen.' using errcode = '22023';
  end if;

  -- Antworten müssen zum Typ der Frage passen
  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload->'rituale', '[]'::jsonb)) x
    join public.rituale ri
      on ri.salon_id = t.salon_id and ri.aktiv and ri.nr = (x->>'ritual_nr')::int
    join public.ritual_fragen f
      on f.ritual_id = ri.id and f.nr = (x->>'frage_nr')::int
    where nullif(btrim(x->>'antwort'), '') is not null
      and ((f.typ = 'skala'   and (x->>'antwort') !~ '^[1-5]$')
        or (f.typ = 'auswahl' and not ((x->>'antwort') = any (f.optionen))))
  ) then
    raise exception 'Eine Ritual-Antwort passt nicht zur Frage.' using errcode = '22023';
  end if;

  -- Pflichtfragen
  if exists (
    select 1
    from public.rituale ri
    join public.ritual_fragen f on f.ritual_id = ri.id
    where ri.salon_id = t.salon_id and ri.aktiv and f.pflicht
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(payload->'rituale', '[]'::jsonb)) x
        where (x->>'ritual_nr')::int = ri.nr
          and (x->>'frage_nr')::int = f.nr
          and nullif(btrim(x->>'antwort'), '') is not null)
  ) then
    raise exception 'Bitte beantworte alle Pflichtfragen bei den Ritualen.' using errcode = '22023';
  end if;

  -- Ausfülldauer: Start und Absenden stammen beide vom Gerät, die Differenz ist verlässlich.
  -- Unter 1 Minute oder über 24 Stunden wird sie nicht gespeichert (Plan §7.3).
  begin
    v_zeit := nullif(payload->>'zeitpunkt', '')::timestamptz;
  exception when others then
    v_zeit := null;
  end;
  begin
    v_start := nullif(payload->>'gestartet_am', '')::timestamptz;
  exception when others then
    v_start := null;
  end;
  if v_start is not null and v_zeit is not null then
    v_dauer := extract(epoch from (v_zeit - v_start))::integer;
    if v_dauer not between 60 and 86400 then
      v_dauer := null;
    end if;
  end if;

  -- Kopf
  insert into public.umfrage_abgaben
    (salon, monat, feedbackgeber, entwicklung_person, entwicklung_begruendung,
     zeitpunkt_client, gestartet_am, ausfuelldauer_sek, umfrage_version, rohdaten,
     salon_id, feedbackgeber_id)
  values
    (t.salon_name, v_monat, t.name, v_ent_name,
     case when v_ent_id is not null then nullif(btrim(payload->'entwicklung'->>'begruendung'), '') end,
     v_zeit, v_start, v_dauer, nullif(payload->>'version', ''), payload,
     t.salon_id, t.id)
  returning id into v_abgabe;

  -- Rituale: Titel und Fragetext als Momentaufnahme; leere optionale Antworten entfallen
  insert into public.umfrage_rituale
    (abgabe_id, ritual, frage_nr, frage, typ, antwort_zahl, antwort_text)
  select v_abgabe, ri.titel, f.nr, f.frage, f.typ,
         case when f.typ = 'skala' then (x->>'antwort')::smallint end,
         case when f.typ <> 'skala' then btrim(x->>'antwort') end
  from jsonb_array_elements(coalesce(payload->'rituale', '[]'::jsonb)) x
  join public.rituale ri
    on ri.salon_id = t.salon_id and ri.aktiv and ri.nr = (x->>'ritual_nr')::int
  join public.ritual_fragen f
    on f.ritual_id = ri.id and f.nr = (x->>'frage_nr')::int
  where nullif(btrim(x->>'antwort'), '') is not null;

  -- Bewertungen: Selbstbild, wenn die bewertete Person ich bin, sonst Fremdbild
  insert into public.umfrage_bewertungen
    (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule, verhalten,
     art, bewertete_person, note, kommentar, bewertende_person_id, bewertete_person_id)
  select v_abgabe, t.salon_name, v_monat, t.name, h.nr, h.grundpfeiler, h.saeule, h.titel,
         case when q.id = t.id then 'selbstbild' else 'fremdbild' end,
         q.name, (x->>'note')::smallint, nullif(btrim(x->>'kommentar'), ''), t.id, q.id
  from jsonb_array_elements(payload->'bewertungen') x
  join public.verhalten h
    on h.salon_id = t.salon_id and h.aktiv and h.nr = (x->>'verhalten_nr')::int
  join public.personen q
    on q.id = (x->>'bewertete_person_id')::uuid;

  return v_abgabe;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint in ('abgaben_einmal_pro_monat', 'abgaben_einmal_pro_monat_id') then
      raise exception 'Du hast die Umfrage für diesen Monat bereits abgegeben.' using errcode = '23505';
    end if;
    raise;
  when invalid_text_representation or numeric_value_out_of_range
     or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Die Umfrage enthält ungültige Angaben.' using errcode = '22023';
end
$$;

revoke all on function public.umfrage_einreichen_v2(jsonb) from public, anon;
grant execute on function public.umfrage_einreichen_v2(jsonb) to authenticated;
