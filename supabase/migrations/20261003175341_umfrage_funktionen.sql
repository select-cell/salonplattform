-- ============================================================================
-- Phase 2 · Funktionen der Monatsumfrage (Plan §5.3)
--
--   umfrage_inhalt()           Inhalte und bewertbare Kolleginnen
--   meine_monate()             alle Monate meiner Teilnahme mit Status
--   meine_offenen_monate()     davon die noch offenen
--   umfrage_einreichen_v2()    Abgabe über die Plattform
--
-- Alle: security definer, search_path leer, nur für eingeloggte Nutzer.
-- Die Rolle des Aufrufers kommt immer aus auth.uid(), nie aus den übergebenen Daten.
-- ============================================================================

-- Die eingeloggte Person, wenn sie aktiv ist und an der Teamumfrage teilnimmt.
-- ab_monat = erster Monat, für den sie abgeben muss: max(Salon-Start, aktiv_ab).
create or replace function private.teilnehmerin()
returns table (id uuid, name text, salon_id uuid, salon_name text, ab_monat date)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.salon_id, s.name,
         greatest(s.start_monat, coalesce(p.aktiv_ab, s.start_monat))
  from public.personen p
  join public.salons s on s.id = p.salon_id
  where p.auth_user_id = (select auth.uid())
    and p.aktiv
    and p.nimmt_an_teamumfrage
$$;

revoke all on function private.teilnehmerin() from public;

-- ----------------------------------------------------------------------------
-- meine_monate(): jeder Monat von meinem ersten Monat bis zum laufenden Monat
-- (Europe/Berlin), neuester zuerst. Frist = letzter Tag des Monats (Plan §6).
-- ----------------------------------------------------------------------------
create or replace function public.meine_monate()
returns table (
  monat          date,
  monat_key      text,
  frist          date,
  tage_bis_frist integer,
  abgegeben      boolean,
  abgegeben_am   timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with t as (select * from private.teilnehmerin()),
       h as (select (now() at time zone 'Europe/Berlin')::date as d)
  select m.monat,
         to_char(m.monat, 'YYYY-MM'),
         (m.monat + interval '1 month' - interval '1 day')::date,
         (m.monat + interval '1 month' - interval '1 day')::date - h.d,
         a.id is not null,
         a.abgeschickt_am
  from t
  cross join h
  cross join lateral (
    select g::date as monat
    from generate_series(t.ab_monat::timestamp,
                         (h.d - (extract(day from h.d)::int - 1))::timestamp,
                         interval '1 month') g
  ) m
  left join public.umfrage_abgaben a
         on a.salon_id = t.salon_id
        and a.feedbackgeber_id = t.id
        and a.monat = m.monat
  order by m.monat desc
$$;

create or replace function public.meine_offenen_monate()
returns table (
  monat          date,
  monat_key      text,
  frist          date,
  tage_bis_frist integer,
  abgegeben      boolean,
  abgegeben_am   timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select m.monat, m.monat_key, m.frist, m.tage_bis_frist, m.abgegeben, m.abgegeben_am
  from public.meine_monate() m
  where not m.abgegeben
  order by m.monat
$$;

-- ----------------------------------------------------------------------------
-- umfrage_inhalt(): alles, was die Umfrage-Seite zum Anzeigen braucht
-- ----------------------------------------------------------------------------
create or replace function public.umfrage_inhalt()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  p record;
begin
  select x.id, x.name, x.salon_id, x.nimmt_an_teamumfrage
    into p
  from public.personen x
  where x.auth_user_id = (select auth.uid())
    and x.aktiv
    and x.salon_id is not null;

  if not found then
    raise exception 'Kein Zugang.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'salon', (select jsonb_build_object('id', s.id, 'name', s.name)
              from public.salons s where s.id = p.salon_id),
    'person', jsonb_build_object('id', p.id, 'name', p.name),
    'verhalten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nr', h.nr,
               'grundpfeiler', h.grundpfeiler,
               'saeule', h.saeule,
               'titel', h.titel,
               'video_url', nullif(btrim(h.video_url), ''),
               'kriterien', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'stufe', k.stufe,
                           'bezeichnung', k.bezeichnung,
                           'prozent', k.prozent,
                           'leitsatz', k.leitsatz,
                           'punkte', to_jsonb(k.punkte)) order by k.stufe)
                  from public.verhalten_kriterien k
                  where k.verhalten_id = h.id), '[]'::jsonb)
             ) order by h.nr)
      from public.verhalten h
      where h.salon_id = p.salon_id and h.aktiv), '[]'::jsonb),
    'rituale', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nr', r.nr,
               'titel', r.titel,
               'video_url', nullif(btrim(r.video_url), ''),
               'fragen', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'nr', f.nr,
                           'typ', f.typ,
                           'frage', f.frage,
                           'optionen', to_jsonb(f.optionen),
                           'labels', to_jsonb(f.labels),
                           'pflicht', f.pflicht) order by f.nr)
                  from public.ritual_fragen f
                  where f.ritual_id = r.id), '[]'::jsonb)
             ) order by r.nr)
      from public.rituale r
      where r.salon_id = p.salon_id and r.aktiv), '[]'::jsonb),
    -- Bewertbar sind alle anderen aktiven Teilnehmerinnen. Wer selbst nicht teilnimmt, bewertet niemanden.
    'kolleginnen', case when p.nimmt_an_teamumfrage then coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name) order by q.name)
      from public.personen q
      where q.salon_id = p.salon_id
        and q.aktiv
        and q.nimmt_an_teamumfrage
        and q.id <> p.id), '[]'::jsonb)
      else '[]'::jsonb end
  );
end
$$;

-- ----------------------------------------------------------------------------
-- umfrage_einreichen_v2(payload)
--
-- payload = {
--   "monat": "2026-10",
--   "gestartet_am": "<ISO>", "zeitpunkt": "<ISO>", "version": "…",
--   "bewertungen": [ { "verhalten_nr": 1, "bewertete_person_id": "<uuid>", "note": 3, "kommentar": "…" }, … ],
--   "rituale":     [ { "ritual_nr": 1, "frage_nr": 1, "antwort": 3 }, … ],
--   "entwicklung": { "person_id": "<uuid>" | null, "begruendung": "…" }
-- }
--
-- Regeln (Plan §5.3):
--  * Der Feedbackgeber kommt aus auth.uid(), niemals aus dem Payload.
--  * Der Monat muss offen sein: nicht vor dem Start, nicht in der Zukunft, nicht doppelt.
--  * Bewertet werden genau alle aktiven Teilnehmerinnen (inklusive mir als Selbstbild)
--    für jedes aktive Verhalten, jede Kombination genau einmal.
--  * Note 1–5, ab Note 4 ist ein Kommentar Pflicht.
--  * Fragen- und Verhaltenstexte werden aus der Datenbank als Momentaufnahme gespeichert.
--  * Alles in einer Transaktion.
-- ----------------------------------------------------------------------------
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

  -- Entwicklung des Monats (optional): eine andere Teilnehmerin
  v_ent_id := nullif(payload->'entwicklung'->>'person_id', '')::uuid;
  if v_ent_id is not null then
    select q.name into v_ent_name
    from public.personen q
    where q.id = v_ent_id
      and q.salon_id = t.salon_id and q.aktiv and q.nimmt_an_teamumfrage
      and q.id <> t.id;
    if not found then
      raise exception 'Für die Entwicklung des Monats kannst du eine andere Person aus dem Team wählen.'
        using errcode = '22023';
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

-- Nur für eingeloggte Nutzer (Plan §5.3: "Grant: execute nur an authenticated")
revoke all on function public.meine_monate(), public.meine_offenen_monate(),
                       public.umfrage_inhalt(), public.umfrage_einreichen_v2(jsonb)
  from public, anon;
grant execute on function public.meine_monate(), public.meine_offenen_monate(),
                          public.umfrage_inhalt(), public.umfrage_einreichen_v2(jsonb)
  to authenticated;
