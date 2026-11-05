-- ============================================================================
-- Phase B · Zeiterfassung der Umfrage (Version 1.2, Erweiterung B)
--
-- Misst, wie lange jemand die Umfrage wirklich bearbeitet, ohne dass Pausen, andere Tabs,
-- ein gesperrter Bildschirm oder eine verstellte Geräteuhr das Ergebnis verfälschen:
--
--   * Die Serveruhr zählt. Start, Herzschläge und Abgabe stempelt die Datenbank.
--   * Das Gerät liefert nur Zählerstände (aktive Sekunden, aus performance.now()), die der Server deckelt:
--     nie weniger als bisher, höchstens die echte Serverzeit seit dem letzten Herzschlag plus Toleranz mehr,
--     insgesamt höchstens die Zeit seit dem Start. Schrittzeiten wachsen zusammen nie mehr als die aktive Zeit.
--   * Nichts wird verworfen: Auffällige Sitzungen bekommen Kennzeichen und zählen dann nicht in Median
--     und Spanne, bleiben aber sichtbar.
--
--   umfrage_starten(monat, neu)                          Sitzung beginnen oder fortsetzen
--   umfrage_heartbeat(sitzung, aktive_sek, schritte)     Zählerstand melden
--   umfrage_einreichen_v3(payload, sitzung, ...)         Abgabe (ruft v2) und Sitzung abschließen
--   meine_ausfuellzeit(monat)                            eigene aktive Zeit (für die Danke-Seite)
--   zeit_auswertung(monat)                               nur Verantwortliche und Admin
--
-- Alle: security definer, search_path leer, nur für eingeloggte Nutzer. Die Rohdaten-Tabellen sind gesperrt.
-- Die Migration ist wiederholbar (if not exists, create or replace) und kommt ohne DROP und DELETE aus.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Einstellungen je Salon (im Supabase-Dashboard änderbar, kein Code nötig)
-- ----------------------------------------------------------------------------
alter table public.salons
  add column if not exists zeit_min_sek_pro_verhalten integer      not null default 5
    check (zeit_min_sek_pro_verhalten >= 0),
  add column if not exists zeit_sehr_lang_sek         integer      not null default 14400
    check (zeit_sehr_lang_sek > 0),
  add column if not exists zeit_pausen_quote          numeric(3,2) not null default 0.30
    check (zeit_pausen_quote between 0 and 1),
  add column if not exists zeit_heartbeat_luecke_sek  integer      not null default 180
    check (zeit_heartbeat_luecke_sek > 0),
  add column if not exists zeit_toleranz_sek          integer      not null default 10
    check (zeit_toleranz_sek >= 0);

comment on column public.salons.zeit_min_sek_pro_verhalten is 'Aktive Mindestzeit je Verhalten; darunter gilt die Abgabe als „zu schnell“.';
comment on column public.salons.zeit_sehr_lang_sek is 'Gesamtdauer, ab der eine Sitzung als „sehr lang“ gilt (Standard 4 Stunden).';
comment on column public.salons.zeit_pausen_quote is 'Aktive Zeit ÷ Gesamtzeit unter diesem Wert: Hinweis „viele Pausen“.';
comment on column public.salons.zeit_heartbeat_luecke_sek is 'Längere Lücke zwischen zwei Herzschlägen: Hinweis „Herzschlag-Lücke“.';
comment on column public.salons.zeit_toleranz_sek is 'Toleranz der Serverprüfung je Herzschlag (Netzwerk, Takt).';

-- ----------------------------------------------------------------------------
-- Sitzungen und Schrittzeiten (gesperrt, Zugriff nur über die Funktionen)
-- ----------------------------------------------------------------------------
create table if not exists public.umfrage_sitzungen (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid        not null references public.salons (id)   on delete cascade,
  person_id             uuid        not null references public.personen (id) on delete cascade,
  monat                 date        not null,
  gestartet_am          timestamptz not null default now(),
  letzter_herzschlag_am timestamptz not null default now(),
  beendet_am            timestamptz,
  aktive_sek            integer     not null default 0 check (aktive_sek >= 0),
  status                text        not null default 'laufend'
                          check (status in ('laufend', 'abgegeben', 'neu_begonnen')),
  kennzeichen           text[]      not null default '{}',
  abgabe_id             uuid references public.umfrage_abgaben (id) on delete set null,
  constraint umfrage_sitzungen_monat_erster check (extract(day from monat) = 1)
);

comment on table public.umfrage_sitzungen is
  'Zeiterfassung: eine Sitzung je Anlauf einer Umfrage. Die Uhr ist die des Servers.';

-- Pro Person und Monat höchstens eine laufende Sitzung
create unique index if not exists umfrage_sitzungen_eine_laufende
  on public.umfrage_sitzungen (person_id, monat) where status = 'laufend';
create index if not exists umfrage_sitzungen_salon_monat
  on public.umfrage_sitzungen (salon_id, monat);

create table if not exists public.umfrage_schrittzeiten (
  sitzung_id uuid    not null references public.umfrage_sitzungen (id) on delete cascade,
  schritt    text    not null check (schritt ~ '^(entwicklung|v[0-9]{1,3})$'),
  aktive_sek integer not null default 0 check (aktive_sek >= 0),
  primary key (sitzung_id, schritt)
);

comment on table public.umfrage_schrittzeiten is
  'Aktive Zeit je Schritt der Umfrage („entwicklung“, „v<Nr>“ für ein Verhalten).';

alter table public.umfrage_sitzungen   enable row level security;
alter table public.umfrage_schrittzeiten enable row level security;
revoke all on table public.umfrage_sitzungen, public.umfrage_schrittzeiten from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Intern: Zählerstand buchen (Serveruhr, Deckelung, Schrittzeiten, Kennzeichen)
-- Gibt die gebuchte aktive Zeit zurück, bei unbekannter Sitzung null.
-- ----------------------------------------------------------------------------
create or replace function private.sitzung_buchen(p_sitzung uuid, p_aktive_sek integer, p_schritte jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  s               record;
  v_jetzt         timestamptz := now();
  v_seit_letztem  numeric;
  v_seit_start    numeric;
  v_neu           integer;
  v_summe_alt     bigint;
  v_summe_neu     bigint;
  v_faktor        numeric;
  v_kennz         text[];
begin
  select u.id, u.status, u.aktive_sek, u.gestartet_am, u.letzter_herzschlag_am, u.kennzeichen,
         sa.zeit_toleranz_sek, sa.zeit_heartbeat_luecke_sek
    into s
  from public.umfrage_sitzungen u
  join public.salons sa on sa.id = u.salon_id
  where u.id = p_sitzung
  for update of u;
  if not found then
    return null;
  end if;
  if s.status <> 'laufend' then
    return s.aktive_sek;
  end if;

  v_seit_letztem := extract(epoch from (v_jetzt - s.letzter_herzschlag_am));
  v_seit_start   := extract(epoch from (v_jetzt - s.gestartet_am));

  -- nie weniger als bisher; höchstens Serverzeit seit dem letzten Herzschlag plus Toleranz mehr;
  -- insgesamt höchstens die Zeit seit dem Start
  v_neu := greatest(
    s.aktive_sek,
    least(
      coalesce(p_aktive_sek, s.aktive_sek),
      s.aktive_sek + floor(v_seit_letztem + s.zeit_toleranz_sek)::integer,
      ceil(v_seit_start)::integer));

  -- Schrittzeiten: nie weniger als bisher, nie mehr als die aktive Zeit, zusammen nie mehr als die aktive Zeit
  if jsonb_typeof(p_schritte) = 'object' then
    select coalesce(sum(e.aktive_sek), 0) into v_summe_alt
    from public.umfrage_schrittzeiten e where e.sitzung_id = s.id;

    select coalesce(sum(n.sek), 0) into v_summe_neu
    from (
      select greatest(coalesce(e.aktive_sek, 0), coalesce(v.sek, 0)) as sek
      from (
        select j.key as schritt, least(j.value::bigint, v_neu)::integer as sek
        from jsonb_each_text(p_schritte) j
        where j.key ~ '^(entwicklung|v[0-9]{1,3})$' and j.value ~ '^[0-9]{1,9}$'
      ) v
      full join (select * from public.umfrage_schrittzeiten where sitzung_id = s.id) e on e.schritt = v.schritt
    ) n;

    v_faktor := case
      when v_summe_neu <= v_neu then 1
      when v_summe_neu = v_summe_alt then 0
      else greatest(0, least(1, (v_neu - v_summe_alt)::numeric / (v_summe_neu - v_summe_alt)))
    end;

    insert into public.umfrage_schrittzeiten (sitzung_id, schritt, aktive_sek)
    select s.id, v.schritt,
           coalesce(e.aktive_sek, 0)
             + floor((greatest(coalesce(e.aktive_sek, 0), v.sek) - coalesce(e.aktive_sek, 0)) * v_faktor)::integer
    from (
      select j.key as schritt, least(j.value::bigint, v_neu)::integer as sek
      from jsonb_each_text(p_schritte) j
      where j.key ~ '^(entwicklung|v[0-9]{1,3})$' and j.value ~ '^[0-9]{1,9}$'
    ) v
    left join public.umfrage_schrittzeiten e on e.sitzung_id = s.id and e.schritt = v.schritt
    on conflict (sitzung_id, schritt) do update set aktive_sek = excluded.aktive_sek;
  end if;

  v_kennz := s.kennzeichen;
  if v_seit_letztem > s.zeit_heartbeat_luecke_sek and not ('heartbeat_luecke' = any (v_kennz)) then
    v_kennz := array_append(v_kennz, 'heartbeat_luecke'::text);
  end if;

  update public.umfrage_sitzungen
     set aktive_sek = v_neu, letzter_herzschlag_am = v_jetzt, kennzeichen = v_kennz
   where id = s.id;

  return v_neu;
end
$$;

revoke all on function private.sitzung_buchen(uuid, integer, jsonb) from public;

-- Intern: Zusammenfassung einer Sitzung für die Antwort an das Gerät
create or replace function private.sitzung_antwort(p_sitzung uuid, p_wiederaufgenommen boolean)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'sitzung', u.id,
    'aktive_sek', u.aktive_sek,
    'wiederaufgenommen', p_wiederaufgenommen,
    'schritte', coalesce(
      (select jsonb_object_agg(z.schritt, z.aktive_sek) from public.umfrage_schrittzeiten z where z.sitzung_id = u.id),
      '{}'::jsonb))
  from public.umfrage_sitzungen u
  where u.id = p_sitzung
$$;

revoke all on function private.sitzung_antwort(uuid, boolean) from public;

-- ----------------------------------------------------------------------------
-- umfrage_starten: Sitzung beginnen oder (nach Neuladen, anderes Gerät) fortsetzen
-- p_neu = true beendet eine laufende Sitzung mit dem Kennzeichen „neu_begonnen“ und startet eine neue.
-- ----------------------------------------------------------------------------
create or replace function public.umfrage_starten(p_monat date, p_neu boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t         record;
  m         record;
  v_monat   date;
  v_id      uuid;
  v_wieder  boolean := false;
  v_versuch integer := 0;
begin
  select * into t from private.teilnehmerin();
  if not found then
    raise exception 'Du nimmst nicht an der Teamumfrage teil.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat der Umfrage fehlt.' using errcode = '22023';
  end if;
  v_monat := p_monat - (extract(day from p_monat)::integer - 1);

  select * into m from public.meine_monate() x where x.monat = v_monat;
  if not found then
    raise exception 'Für diesen Monat kann keine Umfrage ausgefüllt werden.' using errcode = '22023';
  end if;
  if m.abgegeben then
    raise exception 'Du hast die Umfrage für diesen Monat bereits abgegeben.' using errcode = '23505';
  end if;

  loop
    v_versuch := v_versuch + 1;
    begin
      select u.id into v_id
      from public.umfrage_sitzungen u
      where u.person_id = t.id and u.monat = v_monat and u.status = 'laufend'
      for update;

      if found and p_neu then
        update public.umfrage_sitzungen
           set status = 'neu_begonnen', beendet_am = now(),
               kennzeichen = case when 'neu_begonnen' = any (kennzeichen) then kennzeichen
                                  else array_append(kennzeichen, 'neu_begonnen'::text) end
         where id = v_id;
        v_id := null;
      end if;

      if v_id is not null then
        -- Fortsetzung: die Pause zählt nicht als aktive Zeit, der Takt beginnt neu
        update public.umfrage_sitzungen
           set letzter_herzschlag_am = now(),
               kennzeichen = case when 'wiederaufgenommen' = any (kennzeichen) then kennzeichen
                                  else array_append(kennzeichen, 'wiederaufgenommen'::text) end
         where id = v_id;
        v_wieder := true;
      else
        insert into public.umfrage_sitzungen (salon_id, person_id, monat)
        values (t.salon_id, t.id, v_monat)
        returning id into v_id;
      end if;
      exit;
    exception when unique_violation then
      -- Zwei Tabs gleichzeitig: beim zweiten Anlauf die gerade angelegte Sitzung fortsetzen
      if v_versuch >= 3 then raise; end if;
      v_id := null;
    end;
  end loop;

  return private.sitzung_antwort(v_id, v_wieder);
end
$$;

-- ----------------------------------------------------------------------------
-- umfrage_heartbeat: Zählerstand melden (alle 30 s, bei Schrittwechsel, beim Ausblenden)
-- ----------------------------------------------------------------------------
create or replace function public.umfrage_heartbeat(p_sitzung uuid, p_aktive_sek integer, p_schritte jsonb default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t       record;
  v_aktiv integer;
  v_status text;
begin
  select * into t from private.teilnehmerin();
  if not found then
    raise exception 'Du nimmst nicht an der Teamumfrage teil.' using errcode = '42501';
  end if;
  -- Fremde und unbekannte Sitzungen sehen gleich aus
  if not exists (select 1 from public.umfrage_sitzungen u where u.id = p_sitzung and u.person_id = t.id) then
    raise exception 'Sitzung nicht gefunden.' using errcode = '42501';
  end if;
  if p_aktive_sek is null or p_aktive_sek < 0 then
    raise exception 'Die aktive Zeit ist ungültig.' using errcode = '22023';
  end if;
  if p_schritte is not null and jsonb_typeof(p_schritte) <> 'object' then
    raise exception 'Die Schrittzeiten sind ungültig.' using errcode = '22023';
  end if;

  v_aktiv := private.sitzung_buchen(p_sitzung, p_aktive_sek, p_schritte);
  select u.status into v_status from public.umfrage_sitzungen u where u.id = p_sitzung;
  return jsonb_build_object('aktive_sek', v_aktiv, 'status', v_status);
end
$$;

-- ----------------------------------------------------------------------------
-- umfrage_einreichen_v3: Abgabe wie v2, dazu Sitzung abschließen und Kennzeichen setzen
-- Ohne Sitzung (p_sitzung null) gibt es keine geprüfte Zeit: Kennzeichen „ohne_sitzung“, die Geräteuhr
-- wird bewusst nicht übernommen.
-- ----------------------------------------------------------------------------
create or replace function public.umfrage_einreichen_v3(
  payload jsonb, p_sitzung uuid default null, p_aktive_sek integer default null, p_schritte jsonb default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  t         record;
  s         record;
  v_monat   date;
  v_abgabe  uuid;
  v_anzahl  integer;
  v_kennz   text[];
  v_aktiv   integer;
  v_gesamt  integer;
  v_gueltig boolean;
begin
  select * into t from private.teilnehmerin();
  if not found then
    raise exception 'Du nimmst nicht an der Teamumfrage teil.' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Die Umfrage ist leer oder ungültig.' using errcode = '22023';
  end if;
  if coalesce(payload->>'monat', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Der Monat der Umfrage fehlt oder ist ungültig.' using errcode = '22023';
  end if;
  v_monat := ((payload->>'monat') || '-01')::date;

  if p_sitzung is not null then
    if not exists (select 1 from public.umfrage_sitzungen u where u.id = p_sitzung and u.person_id = t.id) then
      raise exception 'Sitzung nicht gefunden.' using errcode = '42501';
    end if;
    if p_aktive_sek is not null and p_aktive_sek < 0 then
      raise exception 'Die aktive Zeit ist ungültig.' using errcode = '22023';
    end if;
    if p_schritte is not null and jsonb_typeof(p_schritte) <> 'object' then
      raise exception 'Die Schrittzeiten sind ungültig.' using errcode = '22023';
    end if;
    -- letzter Zählerstand vor dem Abschluss
    perform private.sitzung_buchen(p_sitzung, p_aktive_sek, p_schritte);
  end if;

  -- Die eigentliche Abgabe mit allen Prüfungen. Schlägt sie fehl, bleibt auch die Sitzung unverändert offen.
  v_abgabe := public.umfrage_einreichen_v2(payload);

  select count(*) into v_anzahl
  from public.verhalten h where h.salon_id = t.salon_id and h.aktiv;

  if p_sitzung is not null then
    select u.id, u.monat, u.status, u.aktive_sek, u.gestartet_am, u.kennzeichen,
           sa.zeit_min_sek_pro_verhalten, sa.zeit_sehr_lang_sek, sa.zeit_pausen_quote
      into s
    from public.umfrage_sitzungen u
    join public.salons sa on sa.id = u.salon_id
    where u.id = p_sitzung
    for update of u;

    v_kennz  := s.kennzeichen;
    v_aktiv  := s.aktive_sek;
    v_gesamt := greatest(0, floor(extract(epoch from (now() - s.gestartet_am)))::integer);

    if v_aktiv < v_anzahl * s.zeit_min_sek_pro_verhalten then
      v_kennz := array_append(v_kennz, 'zu_schnell'::text);
    end if;
    if v_gesamt > s.zeit_sehr_lang_sek then
      v_kennz := array_append(v_kennz, 'sehr_lang'::text);
    end if;
    if v_gesamt > 0 and v_aktiv::numeric / v_gesamt < s.zeit_pausen_quote then
      v_kennz := array_append(v_kennz, 'viele_pausen'::text);
    end if;

    update public.umfrage_sitzungen
       set status = 'abgegeben', beendet_am = now(), abgabe_id = v_abgabe, kennzeichen = v_kennz
     where id = s.id;

    v_gueltig := not (v_kennz && array['zu_schnell', 'sehr_lang']);
    -- Das alte Feld bekommt die aktive Zeit, wenn sie gültig ist (sonst bleibt es leer)
    update public.umfrage_abgaben
       set ausfuelldauer_sek = case when v_gueltig and v_aktiv between 60 and 86400 then v_aktiv end
     where id = v_abgabe;
  else
    -- keine geprüfte Zeit: eine Sitzungszeile zeigt das Fehlen, die Geräteuhr zählt nicht
    insert into public.umfrage_sitzungen
      (salon_id, person_id, monat, gestartet_am, letzter_herzschlag_am, beendet_am, aktive_sek, status, kennzeichen, abgabe_id)
    values
      (t.salon_id, t.id, v_monat, now(), now(), now(), 0, 'abgegeben', array['ohne_sitzung'], v_abgabe);
    update public.umfrage_abgaben set ausfuelldauer_sek = null where id = v_abgabe;
  end if;

  return v_abgabe;
end
$$;

-- ----------------------------------------------------------------------------
-- meine_ausfuellzeit: eigene aktive Zeit für die Danke-Seite (keine Kennzeichen)
-- ----------------------------------------------------------------------------
create or replace function public.meine_ausfuellzeit(p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t record;
  r record;
begin
  select * into t from private.teilnehmerin();
  if not found then
    raise exception 'Du nimmst nicht an der Teamumfrage teil.' using errcode = '42501';
  end if;
  select u.aktive_sek, u.kennzeichen into r
  from public.umfrage_sitzungen u
  where u.person_id = t.id and u.monat = p_monat - (extract(day from p_monat)::integer - 1)
    and u.status = 'abgegeben'
  order by u.beendet_am desc
  limit 1;
  if not found or 'ohne_sitzung' = any (r.kennzeichen) then
    return null;
  end if;
  return jsonb_build_object('aktive_sek', r.aktive_sek);
end
$$;

-- ----------------------------------------------------------------------------
-- zeit_auswertung: Median, Spanne, Personenliste mit Kennzeichen, Zeit je Verhalten, Heatmap
-- Nur Verantwortliche und Admin. „Zählt“ = abgegeben und weder zu schnell noch sehr lang noch ohne Sitzung.
-- ----------------------------------------------------------------------------
create or replace function public.zeit_auswertung(p_monat date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_monat date;
  v_ohne  integer;
  v_cfg   record;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;

  v_monat := coalesce(
    p_monat - (extract(day from p_monat)::integer - 1),
    (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));

  select sa.zeit_min_sek_pro_verhalten, sa.zeit_sehr_lang_sek, sa.zeit_pausen_quote,
         sa.zeit_heartbeat_luecke_sek, sa.zeit_toleranz_sek
    into v_cfg
  from public.salons sa where sa.id = v_salon;

  select count(*) into v_ohne
  from public.umfrage_abgaben a
  where a.salon_id = v_salon and a.monat = v_monat
    and not exists (select 1 from public.umfrage_sitzungen u where u.abgabe_id = a.id);

  return jsonb_build_object(
    'monat', to_char(v_monat, 'YYYY-MM'),
    'monate', private.monate_mit_daten(v_salon),
    'einstellungen', jsonb_build_object(
      'min_sek_pro_verhalten', v_cfg.zeit_min_sek_pro_verhalten,
      'sehr_lang_sek', v_cfg.zeit_sehr_lang_sek,
      'pausen_quote', v_cfg.zeit_pausen_quote,
      'heartbeat_luecke_sek', v_cfg.zeit_heartbeat_luecke_sek),
    'abgaben_ohne_zeit', v_ohne,

    'personen', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.name)
      from (
        select p.id, p.name, u.aktive_sek,
               greatest(0, floor(extract(epoch from (u.beendet_am - u.gestartet_am)))::integer) as gesamt_sek,
               u.kennzeichen,
               not (u.kennzeichen && array['zu_schnell', 'sehr_lang', 'ohne_sitzung']) as zaehlt
        from public.umfrage_sitzungen u
        join public.personen p on p.id = u.person_id
        where u.salon_id = v_salon and u.monat = v_monat and u.status = 'abgegeben'
      ) x), '[]'::jsonb),

    'zusammenfassung', (
      select jsonb_build_object(
        'abgegeben', count(*),
        'zaehlt', count(*) filter (where z.zaehlt),
        'median_sek', round((percentile_cont(0.5) within group (order by z.aktive_sek) filter (where z.zaehlt))::numeric),
        'min_sek', min(z.aktive_sek) filter (where z.zaehlt),
        'max_sek', max(z.aktive_sek) filter (where z.zaehlt))
      from (
        select u.aktive_sek, not (u.kennzeichen && array['zu_schnell', 'sehr_lang', 'ohne_sitzung']) as zaehlt
        from public.umfrage_sitzungen u
        where u.salon_id = v_salon and u.monat = v_monat and u.status = 'abgegeben'
      ) z),

    'verhalten', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.nr)
      from (
        select z.nr, 'v' || z.nr as schritt, max(h.titel) as titel,
               round((percentile_cont(0.5) within group (order by z.aktive_sek))::numeric) as median_sek,
               round(avg(z.aktive_sek)::numeric, 1) as mittel_sek,
               count(*) as anzahl
        from (
          select case when t.schritt ~ '^v[0-9]{1,3}$' then substring(t.schritt from 2)::integer end as nr,
                 t.aktive_sek, u.salon_id
          from public.umfrage_schrittzeiten t
          join public.umfrage_sitzungen u on u.id = t.sitzung_id
          where u.salon_id = v_salon and u.monat = v_monat and u.status = 'abgegeben'
            and not (u.kennzeichen && array['zu_schnell', 'sehr_lang', 'ohne_sitzung'])
        ) z
        left join public.verhalten h on h.salon_id = z.salon_id and h.nr = z.nr
        where z.nr is not null
        group by z.nr
      ) x), '[]'::jsonb),

    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('person_id', u.person_id, 'schritt', z.schritt, 'sek', z.aktive_sek)
                       order by u.person_id, z.schritt)
      from public.umfrage_schrittzeiten z
      join public.umfrage_sitzungen u on u.id = z.sitzung_id
      where u.salon_id = v_salon and u.monat = v_monat and u.status = 'abgegeben'), '[]'::jsonb)
  );
end
$$;

-- ----------------------------------------------------------------------------
-- Rechte: nur eingeloggte Nutzer, nie anonym
-- ----------------------------------------------------------------------------
revoke all on function
  public.umfrage_starten(date, boolean),
  public.umfrage_heartbeat(uuid, integer, jsonb),
  public.umfrage_einreichen_v3(jsonb, uuid, integer, jsonb),
  public.meine_ausfuellzeit(date),
  public.zeit_auswertung(date)
  from public, anon;
grant execute on function
  public.umfrage_starten(date, boolean),
  public.umfrage_heartbeat(uuid, integer, jsonb),
  public.umfrage_einreichen_v3(jsonb, uuid, integer, jsonb),
  public.meine_ausfuellzeit(date),
  public.zeit_auswertung(date)
  to authenticated;
