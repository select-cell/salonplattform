-- ============================================================================
-- Phase E · Monatsabschluss und Einzelanalyse (Version 1.2, Erweiterung E)
--
-- Ablauf: Monat abschließen (auch unvollständig) → KI-Analyse je Person als Entwurf → Leitung liest, bearbeitet
-- und gibt frei → nur eine freigegebene Analyse kommt in den Personenbericht (PDF).
--
-- Alle Zahlen kommen aus SQL, die KI formuliert nur den Text:
--   analyse_eingabe     baut die Eingabe für die KI: Kennzahlen, Stufen, Vormonat, Kommentare der Kollegen OHNE Absender.
--                       Keine Namen: die bewertete Person heißt „die bewertete Person“, alle anderen „Kollege A, B …“.
--   analyse_pruefen     Faktencheck: jede Zahl im Text muss in der Eingabe vorkommen.
--   analyse_speichern / analyse_bearbeiten ermitteln „geprueft“ SELBST. Die Edge Function kann es nicht fälschen.
--
-- Rechte: nur Verantwortliche und Admin (42501 sonst). Verantwortliche sehen die eigene Analyse nicht, wenn
-- salons.eigene_analyse_nur_admin an ist. Alle Tabellen sind für alle Anmeldungen gesperrt.
--
-- Wiederholbar (if not exists, create or replace), ohne DROP und DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabellen
-- ----------------------------------------------------------------------------
create table if not exists public.monatsabschluesse (
  id                uuid primary key default gen_random_uuid(),
  salon_id          uuid        not null references public.salons (id) on delete cascade,
  monat             date        not null check (extract(day from monat) = 1),
  abgeschlossen_von uuid        references public.personen (id) on delete set null,
  von_name          text        not null,
  abgeschlossen_am  timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now(),
  abgaben           integer     not null check (abgaben >= 0),
  erwartet          integer     not null check (erwartet >= 0),
  unique (salon_id, monat)
);

comment on table public.monatsabschluesse is 'Abgeschlossene Monate (Erweiterung E). Auch unvollständig: abgaben < erwartet. Nur über die Funktionen lesbar.';

create table if not exists public.analysen (
  id              uuid primary key default gen_random_uuid(),
  salon_id        uuid        not null references public.salons (id) on delete cascade,
  monat           date        not null check (extract(day from monat) = 1),
  typ             text        not null check (typ in ('person', 'team_agenda')),
  person_id       uuid        references public.personen (id) on delete cascade,
  status          text        not null default 'entwurf' check (status in ('entwurf', 'freigegeben')),
  text            text        not null default '',
  ausgabe         jsonb,
  eingabe_hash    text,
  prompt_version  text,
  anbieter        text,
  modell          text,
  versuche        integer,
  geprueft        boolean     not null default false,
  pruef_hinweis   text,
  bearbeitet      boolean     not null default false,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  bearbeitet_am   timestamptz,
  bearbeitet_von  text,
  freigegeben_am  timestamptz,
  freigegeben_von text,
  check ((typ = 'person') = (person_id is not null))
);

comment on table public.analysen is 'KI-Analysen als Entwurf oder freigegeben (Erweiterung E). Je Salon, Monat, Typ und Person eine Zeile.';

create unique index if not exists analysen_eindeutig
  on public.analysen (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid)));

alter table public.monatsabschluesse enable row level security;
alter table public.analysen          enable row level security;
revoke all on table public.monatsabschluesse, public.analysen from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Interne Hilfen (nicht aufrufbar)
-- ----------------------------------------------------------------------------
create or replace function private.monatsanfang(p_monat date)
returns date
language sql immutable set search_path = ''
as $$ select p_monat - (extract(day from p_monat)::integer - 1) $$;

-- Wie viele Personen für den Monat erwartet werden (aktiv, nimmt teil, aktiv_ab und Salon-Start zählen)
create or replace function private.erwartete_abgaben(p_salon uuid, p_monat date)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.personen p
  join public.salons s on s.id = p.salon_id
  where p.salon_id = p_salon and p.aktiv and p.nimmt_an_teamumfrage
    and greatest(s.start_monat, coalesce(p.aktiv_ab, s.start_monat)) <= p_monat
$$;

-- Rechte und Voraussetzungen für alles, was eine Person und einen Monat betrifft. Liefert den Salon.
-- Eine fremde, eine unbekannte und die eigene Person (bei eingeschaltetem Schalter) sehen gleich aus: 42501.
create or replace function private.analyse_zugriff(p_person uuid, p_monat date, p_abschluss boolean)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon     uuid := private.leitung_salon();
  v_monat     date;
  v_ich       record;
  v_nur_admin boolean;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := private.monatsanfang(p_monat);

  select p.id, p.rolle into v_ich
  from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  if p_person is null or not exists (select 1 from public.personen p where p.id = p_person and p.salon_id = v_salon) then
    raise exception 'Person nicht gefunden.' using errcode = '42501';
  end if;

  select s.eigene_analyse_nur_admin into v_nur_admin from public.salons s where s.id = v_salon;
  if v_nur_admin and v_ich.rolle = 'verantwortlicher' and v_ich.id = p_person then
    raise exception 'Person nicht gefunden.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.umfrage_bewertungen b
    join public.umfrage_abgaben a on a.id = b.abgabe_id
    where a.salon_id = v_salon and b.bewertete_person_id = p_person and b.monat = v_monat
  ) then
    raise exception 'Für diese Person gibt es in diesem Monat keine Auswertung.' using errcode = '22023';
  end if;

  if p_abschluss and not exists (
    select 1 from public.monatsabschluesse m where m.salon_id = v_salon and m.monat = v_monat
  ) then
    raise exception 'Der Monat ist noch nicht abgeschlossen.' using errcode = '22023';
  end if;

  return v_salon;
end
$$;

-- Namen und E-Mail-Adressen aus einem Text entfernen. Ganze Namen und einzelne Namensteile (ohne Rücksicht auf
-- Groß-/Kleinschreibung, auch „Annas“): die bewertete Person → „die bewertete Person“, alle anderen → „Kollege A, B …“.
-- Die Buchstaben ordnet ein Hash an, damit sie nichts über die Reihenfolge der Namen verraten.
create or replace function private.analyse_anonymisieren(p_salon uuid, p_person uuid, p_monat date, p_text text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_text text := p_text;
  r      record;
begin
  if v_text is null then
    return null;
  end if;

  v_text := regexp_replace(v_text, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', 'E-Mail-Adresse', 'g');

  for r in
    with andere as (
      select q.id, q.name, row_number() over (order by md5(q.id::text || p_monat::text)) as nr
      from public.personen q
      where (q.salon_id = p_salon or q.rolle = 'admin') and q.id is distinct from p_person
    ),
    nummeriert as (
      select a.id, a.name,
             'Kollege ' || case when a.nr <= 26 then chr(64 + a.nr::integer) else 'Z' || a.nr::text end as ersatz
      from andere a
      union all
      select p.id, p.name, 'die bewertete Person'
      from public.personen p where p.id = p_person
    ),
    teile as (
      select distinct z.ersatz, z.muster, z.prio
      from (
        select n.ersatz, btrim(n.name) as muster, 1 as prio from nummeriert n
        union all
        -- Vor- und Nachname einzeln (ein Doppelname mit Bindestrich bleibt dabei ganz), danach auch dessen Teile
        select n.ersatz, t.teil, 2
        from nummeriert n
        cross join lateral regexp_split_to_table(btrim(n.name), '\s+') as t(teil)
        where length(t.teil) >= 3
          and lower(t.teil) not in ('von', 'van', 'der', 'den', 'dem', 'des', 'und', 'zur', 'zum', 'del', 'dos', 'das')
        union all
        select n.ersatz, t.teil, 3
        from nummeriert n
        cross join lateral regexp_split_to_table(btrim(n.name), '[\s\-]+') as t(teil)
        where length(t.teil) >= 3
          and lower(t.teil) not in ('von', 'van', 'der', 'den', 'dem', 'des', 'und', 'zur', 'zum', 'del', 'dos', 'das')
      ) z
      where z.muster <> ''
    )
    select t.ersatz, t.muster
    from teile t
    -- ganze Namen zuerst, dann Vor- und Nachnamen, dann Bindestrich-Teile; die bewertete Person gewinnt bei gleichem Teil
    order by t.prio, length(t.muster) desc, (t.ersatz = 'die bewertete Person') desc, t.ersatz
  loop
    v_text := regexp_replace(
      v_text,
      '\m' || regexp_replace(r.muster, '([.^$|()\[\]{}*+?\\-])', '\\\1', 'g') || 's?\M',
      r.ersatz, 'gi');
  end loop;

  return v_text;
end
$$;

-- Zahlen aus einem Text: „3,5“ = „3.5“ = „3,50“, das Vorzeichen zählt nicht, Listennummern am Zeilenanfang zählen nicht
create or replace function private.analyse_zahlen(p_text text, p_liste_ignorieren boolean default false)
returns numeric[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct abs(replace(m[1], ',', '.')::numeric)), '{}'::numeric[])
  from regexp_matches(
    case when p_liste_ignorieren
         then regexp_replace(coalesce(p_text, ''), '(^|\n)[ \t]*(?:[-*][ \t]+)?\d+[.)][ \t]+', '\1', 'g')
         else coalesce(p_text, '') end,
    '(\d+(?:[.,]\d+)?)', 'g') as m
$$;

-- Zahlen aus allen Zahlen und Texten eines JSON-Dokuments
create or replace function private.analyse_json_zahlen(p_json jsonb, p_liste_ignorieren boolean default false)
returns numeric[]
language sql stable set search_path = ''
as $$
  select coalesce(array_agg(distinct s.z), '{}'::numeric[])
  from (
    select unnest(
             case jsonb_typeof(w)
               when 'number' then array[abs((w #>> '{}')::numeric)]
               when 'string' then private.analyse_zahlen(w #>> '{}', p_liste_ignorieren)
               else '{}'::numeric[]
             end) as z
    from jsonb_path_query(coalesce(p_json, 'null'::jsonb), 'strict $.**') as w
  ) s
$$;

-- Faktencheck: jede Zahl im Text und in der strukturierten Ausgabe muss in der Eingabe vorkommen.
-- 1 bis 5 sind immer erlaubt (Notenskala). Ergebnis: { geprueft, abweichungen[], hinweis }
create or replace function private.analyse_faktencheck(p_eingabe jsonb, p_text text, p_ausgabe jsonb default null)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_erlaubt  numeric[] := array[1, 2, 3, 4, 5]::numeric[] || private.analyse_json_zahlen(p_eingabe, false);
  v_gefunden numeric[] := private.analyse_zahlen(p_text, true) || private.analyse_json_zahlen(p_ausgabe, true);
  v_fehlt    text[];
  v_n        integer;
  v_hinweis  text;
begin
  select coalesce(array_agg(replace(trim_scale(s.z)::text, '.', ',') order by s.z), '{}'::text[])
    into v_fehlt
  from (select distinct u.z from unnest(v_gefunden) as u(z) where u.z <> all (v_erlaubt)) s;

  v_n := coalesce(array_length(v_fehlt, 1), 0);
  if v_n = 1 then
    v_hinweis := 'Faktencheck nicht bestanden: ' || v_fehlt[1] || ' steht nicht in den Daten';
  elsif v_n > 1 then
    v_hinweis := 'Faktencheck nicht bestanden: ' || array_to_string(v_fehlt[1:v_n - 1], ', ')
                 || ' und ' || v_fehlt[v_n] || ' stehen nicht in den Daten';
  end if;

  return jsonb_build_object('geprueft', v_n = 0, 'abweichungen', to_jsonb(v_fehlt), 'hinweis', v_hinweis);
end
$$;

-- Die Eingabe für die KI (ohne Namen, ohne Absender, ohne Kennungen)
create or replace function private.analyse_eingabe_bauen(p_salon uuid, p_person uuid, p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_key     text := to_char(p_monat, 'YYYY-MM');
  v_vorkey  text;
  v_a       jsonb := private.person_auswertung(p_salon, p_person, null, null, true);
  v_sw      jsonb := private.schwellen(p_salon);
  v_aus     numeric := (v_sw->>'ausgewogen')::numeric;
  v_nied    numeric := (v_sw->>'niedrig')::numeric;
  v_hoch    numeric := (v_sw->>'hoch')::numeric;
  v_sb      numeric;
  v_fb      numeric;
  v_diff    numeric;
  v_sbv     numeric;
  v_fbv     numeric;
  v_diffv   numeric;
  v_abs     record;
  v_vorm    jsonb;
  v_verh    jsonb;
  v_staerke jsonb;
  v_felder  jsonb;
begin
  select avg(x.sb), avg(x.fb) into v_sb, v_fb
  from jsonb_to_recordset(v_a->'verhalten') as x(monat text, nr integer, sb numeric, fb numeric)
  where x.monat = v_key;
  v_diff := case when v_sb is not null and v_fb is not null then round(v_sb - v_fb, 2) end;

  -- Vormonat = der letzte frühere Monat, in dem es für diese Person Daten gibt
  select max(x.monat) into v_vorkey
  from jsonb_to_recordset(v_a->'verhalten') as x(monat text)
  where x.monat < v_key;

  if v_vorkey is not null then
    select avg(x.sb), avg(x.fb) into v_sbv, v_fbv
    from jsonb_to_recordset(v_a->'verhalten') as x(monat text, sb numeric, fb numeric)
    where x.monat = v_vorkey;
    v_diffv := case when v_sbv is not null and v_fbv is not null then round(v_sbv - v_fbv, 2) end;
    v_vorm := jsonb_build_object(
      'monat', v_vorkey,
      'selbstbild', round(v_sbv, 1), 'fremdbild', round(v_fbv, 1), 'differenz', round(v_diffv, 1),
      'veraenderung_fremdbild', case when v_fb is not null and v_fbv is not null then round(round(v_fb, 2) - round(v_fbv, 2), 1) end,
      'veraenderung_selbstbild', case when v_sb is not null and v_sbv is not null then round(round(v_sb, 2) - round(v_sbv, 2), 1) end);
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'nr', x.nr, 'titel', x.titel, 'grundpfeiler', x.grundpfeiler, 'saeule', x.saeule,
           'selbstbild', x.sb, 'fremdbild', round(x.fb, 1), 'anzahl_fremdbilder', x.anzahl_fb,
           'differenz', case when x.sb is not null and x.fb is not null then round(x.sb - x.fb, 1) end,
           'stufe_fremdbild', case when x.fb is null then null when x.fb >= v_hoch then 'hoch' when x.fb < v_nied then 'niedrig' else 'mittel' end,
           'fremdbild_vormonat', round(vm.fb, 1),
           'veraenderung_fremdbild', case when x.fb is not null and vm.fb is not null then round(x.fb - vm.fb, 1) end
         )) order by x.nr), '[]'::jsonb)
    into v_verh
  from jsonb_to_recordset(v_a->'verhalten') as x(monat text, nr integer, titel text, grundpfeiler text, saeule text, sb numeric, fb numeric, anzahl_fb integer)
  left join jsonb_to_recordset(v_a->'verhalten') as vm(monat text, nr integer, fb numeric)
    on vm.monat = v_vorkey and vm.nr = x.nr
  where x.monat = v_key;

  select coalesce(jsonb_agg(jsonb_build_object('nr', t.nr, 'titel', t.titel, 'fremdbild', round(t.fb, 1)) order by t.fb desc, t.nr), '[]'::jsonb)
    into v_staerke
  from (select x.nr, x.titel, x.fb from jsonb_to_recordset(v_a->'verhalten') as x(monat text, nr integer, titel text, fb numeric)
        where x.monat = v_key and x.fb is not null order by x.fb desc, x.nr limit 3) t;

  select coalesce(jsonb_agg(jsonb_build_object('nr', t.nr, 'titel', t.titel, 'fremdbild', round(t.fb, 1)) order by t.fb, t.nr), '[]'::jsonb)
    into v_felder
  from (select x.nr, x.titel, x.fb from jsonb_to_recordset(v_a->'verhalten') as x(monat text, nr integer, titel text, fb numeric)
        where x.monat = v_key and x.fb is not null order by x.fb, x.nr limit 3) t;

  select m.abgaben, m.erwartet into v_abs
  from public.monatsabschluesse m where m.salon_id = p_salon and m.monat = p_monat;

  return jsonb_strip_nulls(jsonb_build_object(
    'bewertete_person', 'die bewertete Person',
    'monat', v_key,
    'skala', 'Noten von 1 (niedrig) bis 5 (hoch)',
    'schwellen', jsonb_build_object('ausgewogen', v_aus, 'niedrig', v_nied, 'hoch', v_hoch),
    'beteiligung', case when v_abs.abgaben is not null then jsonb_build_object('abgegeben', v_abs.abgaben, 'erwartet', v_abs.erwartet) end,
    'kennzahlen', jsonb_build_object(
      'selbstbild', round(v_sb, 1), 'fremdbild', round(v_fb, 1), 'differenz', round(v_diff, 1),
      'einordnung', case when v_diff is null then 'keine Daten'
                         when abs(v_diff) <= v_aus then 'ausgewogen'
                         when v_diff > 0 then 'Selbstüberschätzung'
                         else 'Selbstunterschätzung' end,
      'stufe_fremdbild', case when v_fb is null then null when v_fb >= v_hoch then 'hoch' when v_fb < v_nied then 'niedrig' else 'mittel' end),
    'vormonat', v_vorm,
    'verhalten', v_verh,
    'staerken', v_staerke,
    'entwicklungsfelder', v_felder,
    'kommentare_kollegen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nr', (k.e->>'nr')::integer,
               'verhalten', (select y.titel from jsonb_to_recordset(v_a->'verhalten') as y(monat text, nr integer, titel text)
                             where y.monat = v_key and y.nr = (k.e->>'nr')::integer limit 1),
               'note', (k.e->>'note')::integer,
               'kommentar', private.analyse_anonymisieren(p_salon, p_person, p_monat, k.e->>'kommentar'))
             order by k.pos)
      from jsonb_array_elements(v_a->'kommentare') with ordinality as k(e, pos)
      where k.e->>'monat' = v_key), '[]'::jsonb),
    'eigene_kommentare', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nr', (k.e->>'nr')::integer,
               'verhalten', (select y.titel from jsonb_to_recordset(v_a->'verhalten') as y(monat text, nr integer, titel text)
                             where y.monat = v_key and y.nr = (k.e->>'nr')::integer limit 1),
               'note', (k.e->>'note')::integer,
               'kommentar', private.analyse_anonymisieren(p_salon, p_person, p_monat, k.e->>'kommentar'))
             order by k.pos)
      from jsonb_array_elements(v_a->'selbst_kommentare') with ordinality as k(e, pos)
      where k.e->>'monat' = v_key), '[]'::jsonb),
    'entwicklung', jsonb_build_object(
      'nennungen', (select count(*) from jsonb_array_elements(v_a->'entwicklung') e where e->>'monat' = v_key),
      'begruendungen', coalesce((
        select jsonb_agg(private.analyse_anonymisieren(p_salon, p_person, p_monat, e->>'begruendung') order by o)
        from jsonb_array_elements(v_a->'entwicklung') with ordinality as t(e, o)
        where e->>'monat' = v_key and coalesce(btrim(e->>'begruendung'), '') <> ''), '[]'::jsonb))
  ));
end
$$;

-- Eine Analyse als JSON (für die Oberfläche). „veraltet“: die Eingabe hat sich seit dem Erstellen geändert.
create or replace function private.analyse_zeile(p_salon uuid, p_a public.analysen)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'person_id', p_a.person_id,
    'monat', to_char(p_a.monat, 'YYYY-MM'),
    'status', p_a.status,
    'text', p_a.text,
    'ausgabe', p_a.ausgabe,
    'geprueft', p_a.geprueft,
    'pruef_hinweis', p_a.pruef_hinweis,
    'bearbeitet', p_a.bearbeitet,
    'prompt_version', p_a.prompt_version,
    'eingabe_hash', p_a.eingabe_hash,
    'anbieter', p_a.anbieter,
    'modell', p_a.modell,
    'versuche', p_a.versuche,
    'erstellt_am', p_a.erstellt_am,
    'aktualisiert_am', p_a.aktualisiert_am,
    'bearbeitet_am', p_a.bearbeitet_am,
    'bearbeitet_von', p_a.bearbeitet_von,
    'freigegeben_am', p_a.freigegeben_am,
    'freigegeben_von', p_a.freigegeben_von,
    'veraltet', case when p_a.typ = 'person'
                     then p_a.eingabe_hash is distinct from md5(private.analyse_eingabe_bauen(p_salon, p_a.person_id, p_a.monat)::text)
                     else false end)
$$;

create or replace function private.abschluss_json(p_m public.monatsabschluesse)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'monat', to_char(p_m.monat, 'YYYY-MM'),
    'abgeschlossen_am', p_m.abgeschlossen_am,
    'aktualisiert_am', p_m.aktualisiert_am,
    'von', p_m.von_name,
    'abgaben', p_m.abgaben,
    'erwartet', p_m.erwartet,
    'unvollstaendig', p_m.abgaben < p_m.erwartet)
$$;

revoke all on function
  private.monatsanfang(date), private.erwartete_abgaben(uuid, date), private.analyse_zugriff(uuid, date, boolean),
  private.analyse_anonymisieren(uuid, uuid, date, text), private.analyse_zahlen(text, boolean),
  private.analyse_json_zahlen(jsonb, boolean), private.analyse_faktencheck(jsonb, text, jsonb),
  private.analyse_eingabe_bauen(uuid, uuid, date), private.analyse_zeile(uuid, public.analysen),
  private.abschluss_json(public.monatsabschluesse)
from public;

-- ----------------------------------------------------------------------------
-- Monat abschließen (auch unvollständig). Ein zweiter Aufruf aktualisiert nur die Zahlen.
-- ----------------------------------------------------------------------------
create or replace function public.monat_abschliessen(p_monat date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_monat date;
  v_ich   record;
  v_abg   integer;
  v_zeile public.monatsabschluesse;
  v_vorher boolean;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := private.monatsanfang(p_monat);

  select count(*)::integer into v_abg
  from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat;
  if v_abg = 0 then
    raise exception 'Für diesen Monat gibt es noch keine Abgaben.' using errcode = '22023';
  end if;

  select p.id, p.name into v_ich
  from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  v_vorher := exists (select 1 from public.monatsabschluesse m where m.salon_id = v_salon and m.monat = v_monat);

  insert into public.monatsabschluesse (salon_id, monat, abgeschlossen_von, von_name, abgaben, erwartet)
  values (v_salon, v_monat, v_ich.id, coalesce(v_ich.name, 'unbekannt'), v_abg, private.erwartete_abgaben(v_salon, v_monat))
  on conflict (salon_id, monat) do update
    set abgaben = excluded.abgaben, erwartet = excluded.erwartet, aktualisiert_am = now()
  returning * into v_zeile;

  return private.abschluss_json(v_zeile) || jsonb_build_object('bereits_abgeschlossen', v_vorher);
end
$$;

-- ----------------------------------------------------------------------------
-- Übersicht für die Seite „Monatsabschluss“
-- ----------------------------------------------------------------------------
create or replace function public.abschluss_uebersicht(p_monat date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon     uuid := private.leitung_salon();
  v_monat     date;
  v_ich       record;
  v_nur_admin boolean;
  v_abg       integer;
  v_m         public.monatsabschluesse;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;

  select p.id, p.rolle into v_ich
  from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  select s.eigene_analyse_nur_admin into v_nur_admin from public.salons s where s.id = v_salon;

  v_monat := coalesce(private.monatsanfang(p_monat),
                      (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));

  select count(*)::integer into v_abg
  from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat;

  select * into v_m from public.monatsabschluesse m where m.salon_id = v_salon and m.monat = v_monat;

  return jsonb_build_object(
    'monat', to_char(v_monat, 'YYYY-MM'),
    'monate', private.monate_mit_daten(v_salon),
    'eigene_analyse_nur_admin', v_nur_admin,
    'abschluss', case when v_m.id is not null then private.abschluss_json(v_m) end,
    'aktuell', jsonb_build_object('abgaben', v_abg, 'erwartet', private.erwartete_abgaben(v_salon, v_monat)),
    'nicht_abgegeben', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
      from public.personen p
      join public.salons s on s.id = p.salon_id
      where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage
        and greatest(s.start_monat, coalesce(p.aktiv_ab, s.start_monat)) <= v_monat
        and not exists (select 1 from public.umfrage_abgaben a
                        where a.salon_id = v_salon and a.monat = v_monat and a.feedbackgeber_id = p.id)), '[]'::jsonb),
    'personen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name,
               'analyse', case when an.id is not null then jsonb_build_object(
                   'status', an.status, 'geprueft', an.geprueft, 'bearbeitet', an.bearbeitet,
                   'aktualisiert_am', an.aktualisiert_am, 'freigegeben_am', an.freigegeben_am,
                   'veraltet', an.eingabe_hash is distinct from md5(private.analyse_eingabe_bauen(v_salon, p.id, v_monat)::text)) end)
             order by p.name)
      from public.personen p
      left join public.analysen an
        on an.salon_id = v_salon and an.monat = v_monat and an.typ = 'person' and an.person_id = p.id
      where p.salon_id = v_salon
        and exists (select 1 from public.umfrage_bewertungen b
                    join public.umfrage_abgaben a on a.id = b.abgabe_id
                    where a.salon_id = v_salon and b.bewertete_person_id = p.id and b.monat = v_monat)
        and not (v_nur_admin and v_ich.rolle = 'verantwortlicher' and p.id = v_ich.id)), '[]'::jsonb)
  );
end
$$;

-- ----------------------------------------------------------------------------
-- Analyse: Eingabe, Faktencheck, Speichern, Lesen, Bearbeiten, Freigeben
-- ----------------------------------------------------------------------------
create or replace function public.analyse_eingabe(p_person uuid, p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.analyse_zugriff(p_person, p_monat, true);
  v_e     jsonb;
begin
  v_e := private.analyse_eingabe_bauen(v_salon, p_person, private.monatsanfang(p_monat));
  return jsonb_build_object('eingabe', v_e, 'hash', md5(v_e::text));
end
$$;

create or replace function public.analyse_pruefen(p_person uuid, p_monat date, p_text text, p_ausgabe jsonb default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.analyse_zugriff(p_person, p_monat, true);
begin
  return private.analyse_faktencheck(
    private.analyse_eingabe_bauen(v_salon, p_person, private.monatsanfang(p_monat)), p_text, p_ausgabe);
end
$$;

create or replace function public.analyse_speichern(
  p_person uuid, p_monat date, p_text text, p_ausgabe jsonb, p_prompt_version text,
  p_anbieter text default null, p_modell text default null, p_versuche integer default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon   uuid := private.analyse_zugriff(p_person, p_monat, true);
  v_monat   date := private.monatsanfang(p_monat);
  v_eingabe jsonb;
  v_check   jsonb;
  v_zeile   public.analysen;
begin
  if p_text is null or btrim(p_text) = '' then
    raise exception 'Der Text der Analyse fehlt.' using errcode = '22023';
  end if;
  if p_prompt_version is null or btrim(p_prompt_version) = '' then
    raise exception 'Die Prompt-Version fehlt.' using errcode = '22023';
  end if;

  -- Eingabe und Faktencheck rechnet die Datenbank selbst: der Aufrufer kann „geprueft“ nicht vorgeben
  v_eingabe := private.analyse_eingabe_bauen(v_salon, p_person, v_monat);
  v_check := private.analyse_faktencheck(v_eingabe, p_text, p_ausgabe);

  insert into public.analysen
    (salon_id, monat, typ, person_id, status, text, ausgabe, eingabe_hash, prompt_version, anbieter, modell, versuche,
     geprueft, pruef_hinweis)
  values
    (v_salon, v_monat, 'person', p_person, 'entwurf', p_text, p_ausgabe, md5(v_eingabe::text), p_prompt_version,
     p_anbieter, p_modell, p_versuche, (v_check->>'geprueft')::boolean, v_check->>'hinweis')
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
    set status = 'entwurf', text = excluded.text, ausgabe = excluded.ausgabe, eingabe_hash = excluded.eingabe_hash,
        prompt_version = excluded.prompt_version, anbieter = excluded.anbieter, modell = excluded.modell,
        versuche = excluded.versuche, geprueft = excluded.geprueft, pruef_hinweis = excluded.pruef_hinweis,
        bearbeitet = false, bearbeitet_am = null, bearbeitet_von = null,
        freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
  returning * into v_zeile;

  return private.analyse_zeile(v_salon, v_zeile);
end
$$;

create or replace function public.analyse_lesen(p_person uuid, p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.analyse_zugriff(p_person, p_monat, false);
  v_zeile public.analysen;
begin
  select * into v_zeile from public.analysen a
  where a.salon_id = v_salon and a.monat = private.monatsanfang(p_monat) and a.typ = 'person' and a.person_id = p_person;
  if v_zeile.id is null then
    return null;
  end if;
  return private.analyse_zeile(v_salon, v_zeile);
end
$$;

-- Bearbeiten macht die Analyse wieder zum Entwurf; der Faktencheck läuft erneut über den neuen Text.
-- Ein unveränderter Text ändert nichts (auch nicht die Freigabe).
create or replace function public.analyse_bearbeiten(p_person uuid, p_monat date, p_text text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.analyse_zugriff(p_person, p_monat, false);
  v_monat date := private.monatsanfang(p_monat);
  v_ich   record;
  v_alt   public.analysen;
  v_check jsonb;
  v_zeile public.analysen;
begin
  if p_text is null or btrim(p_text) = '' then
    raise exception 'Der Text der Analyse fehlt.' using errcode = '22023';
  end if;

  select * into v_alt from public.analysen a
  where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'person' and a.person_id = p_person;
  if v_alt.id is null then
    raise exception 'Es gibt noch keine Analyse.' using errcode = '22023';
  end if;
  if v_alt.text = p_text then
    return private.analyse_zeile(v_salon, v_alt);
  end if;

  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  v_check := private.analyse_faktencheck(private.analyse_eingabe_bauen(v_salon, p_person, v_monat), p_text, null);

  update public.analysen a
     set text = p_text, status = 'entwurf', bearbeitet = true, bearbeitet_am = now(),
         bearbeitet_von = coalesce(v_ich.name, 'unbekannt'),
         geprueft = (v_check->>'geprueft')::boolean, pruef_hinweis = v_check->>'hinweis',
         freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
   where a.id = v_alt.id
   returning * into v_zeile;

  return private.analyse_zeile(v_salon, v_zeile);
end
$$;

-- Freigeben (auch bei nicht bestandenem Faktencheck: die Leitung entscheidet) oder die Freigabe zurücknehmen
create or replace function public.analyse_freigeben(p_person uuid, p_monat date, p_freigeben boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.analyse_zugriff(p_person, p_monat, false);
  v_ich   record;
  v_zeile public.analysen;
begin
  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  update public.analysen a
     set status = case when coalesce(p_freigeben, true) then 'freigegeben' else 'entwurf' end,
         freigegeben_am = case when coalesce(p_freigeben, true) then now() end,
         freigegeben_von = case when coalesce(p_freigeben, true) then coalesce(v_ich.name, 'unbekannt') end,
         aktualisiert_am = now()
   where a.salon_id = v_salon and a.monat = private.monatsanfang(p_monat) and a.typ = 'person' and a.person_id = p_person
     and btrim(a.text) <> ''
   returning * into v_zeile;

  if v_zeile.id is null then
    raise exception 'Es gibt noch keine Analyse.' using errcode = '22023';
  end if;
  return private.analyse_zeile(v_salon, v_zeile);
end
$$;

revoke all on function
  public.monat_abschliessen(date), public.abschluss_uebersicht(date),
  public.analyse_eingabe(uuid, date), public.analyse_pruefen(uuid, date, text, jsonb),
  public.analyse_speichern(uuid, date, text, jsonb, text, text, text, integer),
  public.analyse_lesen(uuid, date), public.analyse_bearbeiten(uuid, date, text),
  public.analyse_freigeben(uuid, date, boolean)
from public, anon;
grant execute on function
  public.monat_abschliessen(date), public.abschluss_uebersicht(date),
  public.analyse_eingabe(uuid, date), public.analyse_pruefen(uuid, date, text, jsonb),
  public.analyse_speichern(uuid, date, text, jsonb, text, text, text, integer),
  public.analyse_lesen(uuid, date), public.analyse_bearbeiten(uuid, date, text),
  public.analyse_freigeben(uuid, date, boolean)
to authenticated;

-- ----------------------------------------------------------------------------
-- PDF: der Personenbericht enthält die Analyse nur, wenn sie freigegeben ist
-- ----------------------------------------------------------------------------
create or replace function public.pdf_personenbericht(p_person uuid, p_monat date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.leitung_salon();
  v_monat  date;
  v_key    text;
  v_ich    record;
  v_ziel   record;
  v_alles  jsonb;
  v_nur_admin boolean;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := p_monat - (extract(day from p_monat)::integer - 1);
  v_key := to_char(v_monat, 'YYYY-MM');

  select p.id, p.name, p.rolle into v_ich
  from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  -- Fremde und unbekannte Personen sehen gleich aus
  select p.id, p.name into v_ziel
  from public.personen p where p.id = p_person and p.salon_id = v_salon;
  if not found then
    raise exception 'Person nicht gefunden.' using errcode = '42501';
  end if;

  -- Datenschutz-Schalter: Verantwortliche bekommen ihren eigenen Bericht nicht
  select s.eigene_analyse_nur_admin into v_nur_admin from public.salons s where s.id = v_salon;
  if v_nur_admin and v_ich.rolle = 'verantwortlicher' and v_ich.id = p_person then
    raise exception 'Person nicht gefunden.' using errcode = '42501';
  end if;

  v_alles := private.person_auswertung(v_salon, p_person, null, null, true);

  if not exists (select 1 from jsonb_array_elements(v_alles->'verhalten') x where x->>'monat' = v_key) then
    raise exception 'Für diese Person gibt es in diesem Monat keine Auswertung.' using errcode = '22023';
  end if;

  insert into public.pdf_export_log (salon_id, exportiert_von, von_name, art, monat, ziel_person_id, ziel_name)
  values (v_salon, v_ich.id, coalesce(v_ich.name, 'unbekannt'), 'personenbericht', v_monat, v_ziel.id, v_ziel.name);

  return jsonb_build_object(
    'salon', (select s.name from public.salons s where s.id = v_salon),
    'monat', v_key,
    'erstellt_am', now(),
    'person', v_alles->'person',
    'schwellen', v_alles->'schwellen',
    -- alle Monate: daraus entstehen Vormonat und Verlauf
    'verhalten', v_alles->'verhalten',
    'kommentare', coalesce((select jsonb_agg(x) from jsonb_array_elements(v_alles->'kommentare') x where x->>'monat' = v_key), '[]'::jsonb),
    'selbst_kommentare', coalesce((select jsonb_agg(x) from jsonb_array_elements(v_alles->'selbst_kommentare') x where x->>'monat' = v_key), '[]'::jsonb),
    'entwicklung', coalesce((
      select jsonb_agg(jsonb_build_object('begruendung', x->>'begruendung'))
      from jsonb_array_elements(v_alles->'entwicklung') x where x->>'monat' = v_key), '[]'::jsonb),
    -- nur eine freigegebene Analyse; ein Entwurf kommt nie ins PDF
    'analyse', (
      select jsonb_build_object('text', a.text, 'freigegeben_am', a.freigegeben_am, 'freigegeben_von', a.freigegeben_von)
      from public.analysen a
      where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'person' and a.person_id = p_person
        and a.status = 'freigegeben')
  );
end
$$;
