-- ============================================================================
-- KI nur für den Admin und Gesamtauswertung des Teams (Version 1.3)
--
-- 1. Alle KI-Funktionen (Einzelanalyse und Gesamtauswertung) sind zunächst nur für den Admin.
--    Der Schalter salons.ki_nur_admin (Standard AN) regelt das; schaltet man ihn aus, dürfen auch Verantwortliche.
--    Verantwortliche bekommen 42501 „Nur für Admins.“. Der Monatsabschluss selbst und das PDF mit freigegebenen
--    Analysen bleiben für Verantwortliche, wie sie sind.
-- 2. Gesamtauswertung: ein KI-Text über das ganze Team (nur Teamwerte, keine Namen, keine Einzelpersonen, keine
--    Kommentartexte). Gleicher Ablauf wie bei der Einzelanalyse: Eingabe baut die Datenbank, Faktencheck und
--    „geprueft“ rechnet die Datenbank selbst, Entwurf → bearbeiten → freigeben.
--
-- Wiederholbar (if not exists, create or replace), ohne DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Schalter
-- ----------------------------------------------------------------------------
alter table public.salons
  add column if not exists ki_nur_admin boolean not null default true;

comment on column public.salons.ki_nur_admin is
  'Standard an: Nur der Admin darf KI-Analysen erstellen, lesen, bearbeiten und freigeben. Aus: auch Verantwortliche.';

-- ----------------------------------------------------------------------------
-- Zugriff: Salon, für den die aufrufende Person KI nutzen darf
-- ----------------------------------------------------------------------------
create or replace function private.ki_salon()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon     uuid := private.leitung_salon();
  v_nur_admin boolean;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if private.rolle() is distinct from 'admin' then
    select s.ki_nur_admin into v_nur_admin from public.salons s where s.id = v_salon;
    if coalesce(v_nur_admin, true) then
      raise exception 'Nur für Admins.' using errcode = '42501';
    end if;
  end if;
  return v_salon;
end
$$;

revoke all on function private.ki_salon() from public;

-- Rechte und Voraussetzungen für alles, was eine Person und einen Monat betrifft. Wie bisher, aber über ki_salon().
create or replace function private.analyse_zugriff(p_person uuid, p_monat date, p_abschluss boolean)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon     uuid := private.ki_salon();
  v_monat     date;
  v_ich       record;
  v_nur_admin boolean;
begin
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

-- ----------------------------------------------------------------------------
-- Gesamtauswertung: Typ in der Tabelle analysen
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analysen'::regclass and conname = 'analysen_typ_check'
      and pg_get_constraintdef(oid) like '%team_gesamt%'
  ) then
    alter table public.analysen drop constraint if exists analysen_typ_check;
    alter table public.analysen
      add constraint analysen_typ_check check (typ in ('person', 'team_agenda', 'team_gesamt'));
  end if;
end
$$;

-- Rechte und Voraussetzungen für die Gesamtauswertung. Liefert den Salon.
create or replace function private.gesamt_zugriff(p_monat date, p_abschluss boolean)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.ki_salon();
  v_monat date;
begin
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := private.monatsanfang(p_monat);

  if not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es keine Auswertung.' using errcode = '22023';
  end if;

  if p_abschluss and not exists (
    select 1 from public.monatsabschluesse m where m.salon_id = v_salon and m.monat = v_monat
  ) then
    raise exception 'Der Monat ist noch nicht abgeschlossen.' using errcode = '22023';
  end if;

  return v_salon;
end
$$;

-- Die Eingabe für die KI: nur Teamwerte (Mittel der Personenwerte wie im Monatsbericht), keine Namen, keine Einzelpersonen,
-- keine Kommentartexte, keine Texte aus dem Fokus (nur Nummer und Titel des Verhaltens).
create or replace function private.gesamt_eingabe_bauen(p_salon uuid, p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_key     text := to_char(p_monat, 'YYYY-MM');
  v_sw      jsonb := private.schwellen(p_salon);
  v_aus     numeric := (v_sw->>'ausgewogen')::numeric;
  v_nied    numeric := (v_sw->>'niedrig')::numeric;
  v_hoch    numeric := (v_sw->>'hoch')::numeric;
  v_ende    date := (p_monat + interval '1 month' - interval '1 day')::date;
  v_vor     date;
  v_rows    jsonb;
  v_sb      numeric;
  v_fb      numeric;
  v_diff    numeric;
  v_sbv     numeric;
  v_fbv     numeric;
  v_pers    integer;
  v_abs     record;
  v_komm    record;
  v_vorm    jsonb;
  v_verh    jsonb;
  v_staerke jsonb;
  v_felder  jsonb;
  v_diffs   jsonb;
  v_veraend jsonb;
  v_fokus   jsonb;
begin
  select max(a.monat) into v_vor from public.umfrage_abgaben a where a.salon_id = p_salon and a.monat < p_monat;

  -- je Verhalten: Team-Schnitte dieses Monats und das Fremdbild des Vormonats
  select coalesce(jsonb_agg(jsonb_build_object(
           'nr', x.nr, 'titel', coalesce(vt.titel, x.titel), 'grundpfeiler', vt.grundpfeiler, 'saeule', vt.saeule,
           'sb', x.sb, 'fb', x.fb, 'fb_vor', y.fb) order by x.nr), '[]'::jsonb)
    into v_rows
  from (
    select b.verhalten_nr::integer as nr, max(b.verhalten) as titel,
           round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb,
           round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
    from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
    where a.salon_id = p_salon and b.monat = p_monat group by b.verhalten_nr
  ) x
  left join (
    select b.verhalten_nr::integer as nr, round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
    from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
    where a.salon_id = p_salon and b.monat = v_vor group by b.verhalten_nr
  ) y on y.nr = x.nr
  left join public.verhalten vt on vt.salon_id = p_salon and vt.nr = x.nr;

  -- Team-Kennzahlen: Mittel der Personenwerte
  select round(avg(p.sb), 2), round(avg(p.fb), 2), count(*)::integer into v_sb, v_fb, v_pers
  from (select round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb, round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
        from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
        where a.salon_id = p_salon and b.monat = p_monat and b.bewertete_person_id is not null group by b.bewertete_person_id) p;
  v_diff := case when v_sb is not null and v_fb is not null then round(v_sb - v_fb, 2) end;

  if v_vor is not null then
    select round(avg(p.sb), 2), round(avg(p.fb), 2) into v_sbv, v_fbv
    from (select round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb, round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
          from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
          where a.salon_id = p_salon and b.monat = v_vor and b.bewertete_person_id is not null group by b.bewertete_person_id) p;
    v_vorm := jsonb_build_object(
      'monat', to_char(v_vor, 'YYYY-MM'),
      'selbstbild', round(v_sbv, 1), 'fremdbild', round(v_fbv, 1),
      'differenz', case when v_sbv is not null and v_fbv is not null then round(v_sbv - v_fbv, 1) end,
      'veraenderung_fremdbild', case when v_fb is not null and v_fbv is not null then round(v_fb - v_fbv, 1) end,
      'veraenderung_selbstbild', case when v_sb is not null and v_sbv is not null then round(v_sb - v_sbv, 1) end);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nr', r.nr, 'titel', r.titel, 'grundpfeiler', r.grundpfeiler, 'saeule', r.saeule,
           'selbstbild', round(r.sb, 1), 'fremdbild', round(r.fb, 1),
           'differenz', case when r.sb is not null and r.fb is not null then round(r.sb - r.fb, 1) end,
           'stufe_fremdbild', case when r.fb is null then null when r.fb >= v_hoch then 'hoch' when r.fb < v_nied then 'niedrig' else 'mittel' end,
           'fremdbild_vormonat', round(r.fb_vor, 1),
           'veraenderung_fremdbild', case when r.fb is not null and r.fb_vor is not null then round(r.fb - r.fb_vor, 1) end
         ) order by r.nr), '[]'::jsonb)
    into v_verh
  from jsonb_to_recordset(v_rows) as r(nr integer, titel text, grundpfeiler text, saeule text, sb numeric, fb numeric, fb_vor numeric);

  select coalesce(jsonb_agg(jsonb_build_object('nr', t.nr, 'titel', t.titel, 'fremdbild', round(t.fb, 1)) order by t.fb desc, t.nr), '[]'::jsonb)
    into v_staerke
  from (select r.nr, r.titel, r.fb from jsonb_to_recordset(v_rows) as r(nr integer, titel text, sb numeric, fb numeric)
        where r.fb is not null order by r.fb desc, r.nr limit 3) t;

  select coalesce(jsonb_agg(jsonb_build_object('nr', t.nr, 'titel', t.titel, 'fremdbild', round(t.fb, 1)) order by t.fb, t.nr), '[]'::jsonb)
    into v_felder
  from (select r.nr, r.titel, r.fb from jsonb_to_recordset(v_rows) as r(nr integer, titel text, sb numeric, fb numeric)
        where r.fb is not null order by r.fb, r.nr limit 3) t;

  -- die größten Abweichungen zwischen Selbst- und Fremdbild (nur über der Schwelle „ausgewogen“)
  select coalesce(jsonb_agg(jsonb_build_object(
           'nr', t.nr, 'titel', t.titel, 'selbstbild', round(t.sb, 1), 'fremdbild', round(t.fb, 1), 'differenz', round(t.sb - t.fb, 1)
         ) order by abs(t.sb - t.fb) desc, t.nr), '[]'::jsonb)
    into v_diffs
  from (select r.nr, r.titel, r.sb, r.fb from jsonb_to_recordset(v_rows) as r(nr integer, titel text, sb numeric, fb numeric)
        where r.sb is not null and r.fb is not null and abs(r.sb - r.fb) > v_aus
        order by abs(r.sb - r.fb) desc, r.nr limit 3) t;

  -- die größten Veränderungen beim Fremdbild zum Vormonat
  select coalesce(jsonb_agg(jsonb_build_object(
           'nr', t.nr, 'titel', t.titel, 'fremdbild', round(t.fb, 1), 'fremdbild_vormonat', round(t.fb_vor, 1),
           'veraenderung_fremdbild', round(t.fb - t.fb_vor, 1)
         ) order by abs(t.fb - t.fb_vor) desc, t.nr), '[]'::jsonb)
    into v_veraend
  from (select r.nr, r.titel, r.fb, r.fb_vor from jsonb_to_recordset(v_rows) as r(nr integer, titel text, fb numeric, fb_vor numeric)
        where r.fb is not null and r.fb_vor is not null and round(r.fb - r.fb_vor, 1) <> 0
        order by abs(r.fb - r.fb_vor) desc, r.nr limit 3) t;

  -- Fokus-Verhalten, die in diesem Monat galten (nur Nummer und Titel)
  select coalesce(jsonb_agg(jsonb_build_object('nr', t.nr, 'titel', t.titel) order by t.nr), '[]'::jsonb)
    into v_fokus
  from (select distinct v.nr, v.titel
        from public.fokus_verhalten f join public.verhalten v on v.id = f.verhalten_id
        where f.salon_id = p_salon and f.gueltig_ab <= v_ende and (f.gueltig_bis is null or f.gueltig_bis >= p_monat)) t;

  select m.abgaben, m.erwartet into v_abs
  from public.monatsabschluesse m where m.salon_id = p_salon and m.monat = p_monat;

  -- Kommentare nur als Zahlen
  select count(*)::integer as n, (count(*) filter (where coalesce(btrim(b.kommentar), '') <> ''))::integer as mit
    into v_komm
  from public.umfrage_bewertungen b join public.umfrage_abgaben a on a.id = b.abgabe_id
  where a.salon_id = p_salon and b.monat = p_monat and b.art = 'fremdbild';

  return jsonb_strip_nulls(jsonb_build_object(
    'bewertet', 'das Team',
    'monat', v_key,
    'skala', 'Noten von 1 (niedrig) bis 5 (hoch)',
    'schwellen', jsonb_build_object('ausgewogen', v_aus, 'niedrig', v_nied, 'hoch', v_hoch),
    'beteiligung', case when v_abs.abgaben is not null then jsonb_build_object('abgegeben', v_abs.abgaben, 'erwartet', v_abs.erwartet) end,
    'personen_mit_bewertung', v_pers,
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
    'groesste_differenzen', v_diffs,
    'groesste_veraenderungen', v_veraend,
    'fokus_verhalten', v_fokus,
    'kommentare', jsonb_build_object('fremdbild_bewertungen', v_komm.n, 'davon_mit_kommentar', v_komm.mit)
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
    'veraltet', case p_a.typ
                  when 'person' then p_a.eingabe_hash is distinct from md5(private.analyse_eingabe_bauen(p_salon, p_a.person_id, p_a.monat)::text)
                  when 'team_gesamt' then p_a.eingabe_hash is distinct from md5(private.gesamt_eingabe_bauen(p_salon, p_a.monat)::text)
                  else false end)
$$;

revoke all on function
  private.gesamt_zugriff(date, boolean), private.gesamt_eingabe_bauen(uuid, date), private.analyse_zeile(uuid, public.analysen)
from public;

-- ----------------------------------------------------------------------------
-- Gesamtauswertung: Eingabe, Faktencheck, Speichern, Lesen, Bearbeiten, Freigeben
-- ----------------------------------------------------------------------------
create or replace function public.gesamt_eingabe(p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.gesamt_zugriff(p_monat, true);
  v_e     jsonb;
begin
  v_e := private.gesamt_eingabe_bauen(v_salon, private.monatsanfang(p_monat));
  return jsonb_build_object('eingabe', v_e, 'hash', md5(v_e::text));
end
$$;

create or replace function public.gesamt_pruefen(p_monat date, p_text text, p_ausgabe jsonb default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.gesamt_zugriff(p_monat, true);
begin
  return private.analyse_faktencheck(private.gesamt_eingabe_bauen(v_salon, private.monatsanfang(p_monat)), p_text, p_ausgabe);
end
$$;

create or replace function public.gesamt_speichern(
  p_monat date, p_text text, p_ausgabe jsonb, p_prompt_version text,
  p_anbieter text default null, p_modell text default null, p_versuche integer default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon   uuid := private.gesamt_zugriff(p_monat, true);
  v_monat   date := private.monatsanfang(p_monat);
  v_eingabe jsonb;
  v_check   jsonb;
  v_zeile   public.analysen;
begin
  if p_text is null or btrim(p_text) = '' then
    raise exception 'Der Text der Auswertung fehlt.' using errcode = '22023';
  end if;
  if p_prompt_version is null or btrim(p_prompt_version) = '' then
    raise exception 'Die Prompt-Version fehlt.' using errcode = '22023';
  end if;

  -- Eingabe und Faktencheck rechnet die Datenbank selbst: der Aufrufer kann „geprueft“ nicht vorgeben
  v_eingabe := private.gesamt_eingabe_bauen(v_salon, v_monat);
  v_check := private.analyse_faktencheck(v_eingabe, p_text, p_ausgabe);

  insert into public.analysen
    (salon_id, monat, typ, person_id, status, text, ausgabe, eingabe_hash, prompt_version, anbieter, modell, versuche,
     geprueft, pruef_hinweis)
  values
    (v_salon, v_monat, 'team_gesamt', null, 'entwurf', p_text, p_ausgabe, md5(v_eingabe::text), p_prompt_version,
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

create or replace function public.gesamt_lesen(p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.gesamt_zugriff(p_monat, false);
  v_zeile public.analysen;
begin
  select * into v_zeile from public.analysen a
  where a.salon_id = v_salon and a.monat = private.monatsanfang(p_monat) and a.typ = 'team_gesamt';
  if v_zeile.id is null then
    return null;
  end if;
  return private.analyse_zeile(v_salon, v_zeile);
end
$$;

-- Bearbeiten macht die Auswertung wieder zum Entwurf; der Faktencheck läuft erneut über den neuen Text.
-- Ein unveränderter Text ändert nichts (auch nicht die Freigabe).
create or replace function public.gesamt_bearbeiten(p_monat date, p_text text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.gesamt_zugriff(p_monat, false);
  v_monat date := private.monatsanfang(p_monat);
  v_ich   record;
  v_alt   public.analysen;
  v_check jsonb;
  v_zeile public.analysen;
begin
  if p_text is null or btrim(p_text) = '' then
    raise exception 'Der Text der Auswertung fehlt.' using errcode = '22023';
  end if;

  select * into v_alt from public.analysen a
  where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'team_gesamt';
  if v_alt.id is null then
    raise exception 'Es gibt noch keine Auswertung.' using errcode = '22023';
  end if;
  if v_alt.text = p_text then
    return private.analyse_zeile(v_salon, v_alt);
  end if;

  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  v_check := private.analyse_faktencheck(private.gesamt_eingabe_bauen(v_salon, v_monat), p_text, null);

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
create or replace function public.gesamt_freigeben(p_monat date, p_freigeben boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.gesamt_zugriff(p_monat, false);
  v_ich   record;
  v_zeile public.analysen;
begin
  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  update public.analysen a
     set status = case when coalesce(p_freigeben, true) then 'freigegeben' else 'entwurf' end,
         freigegeben_am = case when coalesce(p_freigeben, true) then now() end,
         freigegeben_von = case when coalesce(p_freigeben, true) then coalesce(v_ich.name, 'unbekannt') end,
         aktualisiert_am = now()
   where a.salon_id = v_salon and a.monat = private.monatsanfang(p_monat) and a.typ = 'team_gesamt'
     and btrim(a.text) <> ''
   returning * into v_zeile;

  if v_zeile.id is null then
    raise exception 'Es gibt noch keine Auswertung.' using errcode = '22023';
  end if;
  return private.analyse_zeile(v_salon, v_zeile);
end
$$;

revoke all on function
  public.gesamt_eingabe(date), public.gesamt_pruefen(date, text, jsonb),
  public.gesamt_speichern(date, text, jsonb, text, text, text, integer),
  public.gesamt_lesen(date), public.gesamt_bearbeiten(date, text), public.gesamt_freigeben(date, boolean)
from public, anon;
grant execute on function
  public.gesamt_eingabe(date), public.gesamt_pruefen(date, text, jsonb),
  public.gesamt_speichern(date, text, jsonb, text, text, text, integer),
  public.gesamt_lesen(date), public.gesamt_bearbeiten(date, text), public.gesamt_freigeben(date, boolean)
to authenticated;

-- ----------------------------------------------------------------------------
-- Übersicht für die Seite „Monatsabschluss“: neu sind „ki“ (darf die aufrufende Person KI nutzen?) und „gesamt“.
-- Ohne KI-Recht stehen die Analysen nicht in der Übersicht.
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
  v_ki        boolean;
  v_abg       integer;
  v_m         public.monatsabschluesse;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;

  select p.id, p.rolle into v_ich
  from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  select s.eigene_analyse_nur_admin, (v_ich.rolle = 'admin' or not s.ki_nur_admin)
    into v_nur_admin, v_ki
  from public.salons s where s.id = v_salon;
  v_ki := coalesce(v_ki, false);

  v_monat := coalesce(private.monatsanfang(p_monat),
                      (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));

  select count(*)::integer into v_abg
  from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat;

  select * into v_m from public.monatsabschluesse m where m.salon_id = v_salon and m.monat = v_monat;

  return jsonb_build_object(
    'monat', to_char(v_monat, 'YYYY-MM'),
    'monate', private.monate_mit_daten(v_salon),
    'eigene_analyse_nur_admin', v_nur_admin,
    'ki', v_ki,
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
               'analyse', case when v_ki and an.id is not null then jsonb_build_object(
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
        and not (v_nur_admin and v_ich.rolle = 'verantwortlicher' and p.id = v_ich.id)), '[]'::jsonb),
    'gesamt', case when v_ki then (
      select jsonb_build_object(
               'status', g.status, 'geprueft', g.geprueft, 'bearbeitet', g.bearbeitet,
               'aktualisiert_am', g.aktualisiert_am, 'freigegeben_am', g.freigegeben_am,
               'veraltet', g.eingabe_hash is distinct from md5(private.gesamt_eingabe_bauen(v_salon, v_monat)::text))
      from public.analysen g
      where g.salon_id = v_salon and g.monat = v_monat and g.typ = 'team_gesamt') end
  );
end
$$;

revoke all on function public.abschluss_uebersicht(date) from public, anon;
grant execute on function public.abschluss_uebersicht(date) to authenticated;
