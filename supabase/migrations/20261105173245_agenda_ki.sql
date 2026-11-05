-- ============================================================================
-- Agenda mit KI (Version 1.3)
--
-- Die Agenda fürs Teammeeting entsteht weiterhin aus der festen Vorlage (agenda_erzeugen, ohne KI). Zusätzlich kann der Admin
-- sie von der KI formulieren lassen. Die Datenbank bleibt die Instanz, die entscheidet:
--   agenda_ki_eingabe    die Eingabe für die KI: nur Teamwerte (wie bei der Gesamtauswertung), die Fokus-Verhalten von heute
--                        (nur Nummer und Titel) und das Zeitbudget je Block. Keine Namen, keine Kommentartexte, keine Begründungen.
--   agenda_ki_pruefen    Aufbau (fünf Blöcke), Zeitbudget und jede Zahl im Text. Ein Fehler im Aufbau kommt als Text zurück,
--                        damit die KI ihn korrigieren kann.
--   agenda_ki_speichern  speichert als Entwurf (Typ team_agenda, wie die Vorlage). Überschriften, Hinweise „Stand unvollständig“
--                        und Zeitbudget setzt und prüft die Datenbank; „geprueft“ rechnet sie selbst.
-- Nur der Admin, solange salons.ki_nur_admin an ist (private.ki_salon). Lesen, Bearbeiten und Freigeben bleiben bei der Leitung.
--
-- Wiederholbar (create or replace), ohne DROP und DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Hilfen
-- ----------------------------------------------------------------------------

-- Die Texte aller Punkte (ohne Kommentar-Beispiele), eine Zeile je Punkt: Grundlage des Faktenchecks
create or replace function private.agenda_punkte_text(p_agenda jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce(string_agg(pp.punkt->>'text', E'\n'), '')
  from jsonb_array_elements(coalesce(p_agenda->'bloecke', '[]'::jsonb)) as bb(blk),
       jsonb_array_elements(coalesce(bb.blk->'punkte', '[]'::jsonb)) as pp(punkt)
  where not coalesce((pp.punkt->>'beispiel')::boolean, false)
$$;

-- Die Eingabe für die KI
create or replace function private.agenda_ki_eingabe_bauen(p_salon uuid, p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fokus jsonb;
begin
  -- die Fokus-Verhalten von heute (nur Nummer und Titel; die Begründung der Leitung geht nicht an die KI)
  select coalesce(jsonb_agg(jsonb_build_object('nr', t.nr, 'titel', t.titel) order by t.nr), '[]'::jsonb)
    into v_fokus
  from (select distinct v.nr, v.titel
        from public.fokus_verhalten f join public.verhalten v on v.id = f.verhalten_id
        where f.salon_id = p_salon and f.gueltig_ab <= private.heute() and (f.gueltig_bis is null or f.gueltig_bis >= private.heute())) t;

  return jsonb_build_object(
    'aufgabe', 'Agenda für das nächste Teammeeting',
    'monat', to_char(p_monat, 'YYYY-MM'),
    'team', private.gesamt_eingabe_bauen(p_salon, p_monat),
    'fokus_aktuell', v_fokus,
    'zeitbudget', jsonb_build_object(
      'gesamt_min', 15, 'gesamt_max', 20,
      'bloecke', jsonb_build_array(
        jsonb_build_object('id', 'einstieg',       'titel', 'Einstieg und Beteiligung',          'min', 2, 'max', 2, 'vorschlag', 2),
        jsonb_build_object('id', 'kennzahlen',     'titel', 'Team-Kennzahlen des Monats',        'min', 3, 'max', 3, 'vorschlag', 3),
        jsonb_build_object('id', 'fokus',          'titel', 'Fokus-Verhalten',                   'min', 6, 'max', 8, 'vorschlag', 7),
        jsonb_build_object('id', 'entwicklung',    'titel', 'Entwicklungsfelder und Differenzen', 'min', 3, 'max', 4, 'vorschlag', 4),
        jsonb_build_object('id', 'vereinbarungen', 'titel', 'Vereinbarungen',                    'min', 2, 'max', 3, 'vorschlag', 2)))
  );
end
$$;

-- Aus den Blöcken der KI die Agenda bauen: Überschriften, Hinweise „Stand unvollständig“ und Aufbau kommen von der Datenbank.
-- p_bloecke: [{ id, minuten, punkte: [text, …] }, …]. Ob alles stimmt, prüft anschließend agenda_validieren.
create or replace function private.agenda_ki_bauen(p_salon uuid, p_monat date, p_bloecke jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_vorlage jsonb;
begin
  if p_bloecke is null or jsonb_typeof(p_bloecke) is distinct from 'array' then
    raise exception 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_bloecke) e
    where jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e->'id') is distinct from 'string'
       or jsonb_typeof(e->'minuten') is distinct from 'number'
       or jsonb_typeof(e->'punkte') is distinct from 'array'
  ) then
    raise exception 'Jeder Block braucht eine id, Minuten (Zahl) und eine Liste von Punkten.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_bloecke) e, jsonb_array_elements(e->'punkte') p
    where jsonb_typeof(p) is distinct from 'string'
  ) then
    raise exception 'Jeder Punkt muss ein Text sein.' using errcode = '22023';
  end if;

  v_vorlage := private.agenda_bauen(p_salon, p_monat, private.heute());

  return jsonb_build_object(
    'vorlage', 'agenda-ki-v1',
    'monat', to_char(p_monat, 'YYYY-MM'),
    'minuten_gesamt', (select sum((e->>'minuten')::numeric) from jsonb_array_elements(p_bloecke) e),
    'unvollstaendig', v_vorlage->'unvollstaendig',
    'hinweise', v_vorlage->'hinweise',
    'bloecke', (
      select jsonb_agg(jsonb_build_object(
               'id', u.blk->>'id',
               'titel', coalesce(vt.v->>'titel', u.blk->>'id'),
               'minuten', u.blk->'minuten',
               'punkte', (select jsonb_agg(jsonb_build_object('text', btrim(x.t)) order by x.o)
                          from jsonb_array_elements_text(u.blk->'punkte') with ordinality as x(t, o))
             ) order by u.bo)
      from jsonb_array_elements(p_bloecke) with ordinality as u(blk, bo)
      left join lateral (select a2.v from jsonb_array_elements(v_vorlage->'bloecke') as a2(v) where a2.v->>'id' = u.blk->>'id') vt on true))
  ;
end
$$;

revoke all on function
  private.agenda_punkte_text(jsonb), private.agenda_ki_eingabe_bauen(uuid, date), private.agenda_ki_bauen(uuid, date, jsonb)
from public;

-- ----------------------------------------------------------------------------
-- Die Agenda als Antwort: neu sind Anbieter, Prompt-Version, Faktencheck und Eingabe-Hash
-- ----------------------------------------------------------------------------
create or replace function private.agenda_zeile(p_a public.analysen)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'monat', to_char(p_a.monat, 'YYYY-MM'),
    'status', p_a.status,
    'agenda', p_a.ausgabe,
    'text', p_a.text,
    'bearbeitet', p_a.bearbeitet,
    'erstellt_am', p_a.erstellt_am,
    'aktualisiert_am', p_a.aktualisiert_am,
    'bearbeitet_am', p_a.bearbeitet_am,
    'bearbeitet_von', p_a.bearbeitet_von,
    'freigegeben_am', p_a.freigegeben_am,
    'freigegeben_von', p_a.freigegeben_von,
    'anbieter', p_a.anbieter,
    'modell', p_a.modell,
    'prompt_version', p_a.prompt_version,
    'versuche', p_a.versuche,
    'eingabe_hash', p_a.eingabe_hash,
    'geprueft', p_a.geprueft,
    'pruef_hinweis', p_a.pruef_hinweis)
$$;

-- Die Vorlage ersetzt auch eine KI-Agenda vollständig (Anbieter, Faktencheck und Eingabe zurücksetzen)
create or replace function public.agenda_erzeugen(p_monat date, p_neu boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.leitung_salon();
  v_monat  date;
  v_alt    public.analysen;
  v_agenda jsonb;
  v_zeile  public.analysen;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := private.monatsanfang(p_monat);
  if not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es keine Auswertung.' using errcode = '22023';
  end if;

  select * into v_alt from public.analysen a
  where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'team_agenda';
  if v_alt.id is not null and not coalesce(p_neu, false) then
    return private.agenda_zeile(v_alt);
  end if;

  v_agenda := private.agenda_bauen(v_salon, v_monat, private.heute());
  perform private.agenda_validieren(v_agenda);

  insert into public.analysen (salon_id, monat, typ, person_id, status, text, ausgabe, prompt_version, anbieter, geprueft)
  values (v_salon, v_monat, 'team_agenda', null, 'entwurf', private.agenda_text(v_agenda), v_agenda, 'agenda-vorlage-v1', 'vorlage', true)
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
    set status = 'entwurf', text = excluded.text, ausgabe = excluded.ausgabe, prompt_version = excluded.prompt_version,
        anbieter = 'vorlage', modell = null, versuche = null, eingabe_hash = null, geprueft = true, pruef_hinweis = null,
        bearbeitet = false, bearbeitet_am = null, bearbeitet_von = null,
        freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
  returning * into v_zeile;
  return private.agenda_zeile(v_zeile);
end
$$;

-- Bearbeiten: Aufbau und Zeitbudget prüft die Datenbank; Überschriften, Reihenfolge und Hinweise bleiben fest.
-- Bei einer Agenda der KI läuft der Faktencheck erneut über den neuen Text.
-- Jede Bearbeitung macht die Agenda wieder zum Entwurf; ein unveränderter Stand ändert nichts.
create or replace function public.agenda_bearbeiten(p_monat date, p_agenda jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.leitung_salon();
  v_monat  date;
  v_alt    public.analysen;
  v_neu    jsonb;
  v_ich    text;
  v_check  jsonb;
  v_zeile  public.analysen;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := private.monatsanfang(p_monat);
  select * into v_alt from public.analysen a where a.salon_id = v_salon and a.monat = v_monat and a.typ = 'team_agenda';
  if v_alt.id is null then
    raise exception 'Es gibt noch keine Agenda.' using errcode = '22023';
  end if;

  perform private.agenda_validieren(p_agenda);

  -- nur die erlaubten Felder übernehmen
  v_neu := jsonb_build_object(
    'vorlage', v_alt.ausgabe->'vorlage', 'monat', v_alt.ausgabe->'monat',
    'unvollstaendig', v_alt.ausgabe->'unvollstaendig', 'hinweise', v_alt.ausgabe->'hinweise',
    'minuten_gesamt', (select sum((b->>'minuten')::numeric) from jsonb_array_elements(p_agenda->'bloecke') b),
    'bloecke', (
      select jsonb_agg(jsonb_build_object(
               'id', b->>'id', 'titel', alt.blk->>'titel', 'minuten', (b->>'minuten')::integer,
               'punkte', (select jsonb_agg(
                            jsonb_strip_nulls(jsonb_build_object(
                              'text', btrim(p->>'text'),
                              'beispiel', case when coalesce((p->>'beispiel')::boolean, false) then true end,
                              'grund', p->>'grund', 'nr', p->'nr')) order by o)
                          from jsonb_array_elements(b->'punkte') with ordinality as t(p, o))) order by bo)
      from jsonb_array_elements(p_agenda->'bloecke') with ordinality as u(b, bo)
      join lateral (select a2.blk from jsonb_array_elements(v_alt.ausgabe->'bloecke') a2(blk) where a2.blk->>'id' = u.b->>'id') alt on true));

  if v_neu = v_alt.ausgabe then
    return private.agenda_zeile(v_alt);
  end if;

  -- Eine Agenda der KI wird erneut gegen die Eingabe geprüft; die Vorlage bleibt „geprüft“
  if v_alt.anbieter is distinct from 'vorlage' then
    v_check := private.analyse_faktencheck(private.agenda_ki_eingabe_bauen(v_salon, v_monat), private.agenda_punkte_text(v_neu), null);
  end if;

  select p.name into v_ich from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;
  update public.analysen a
     set ausgabe = v_neu, text = private.agenda_text(v_neu), status = 'entwurf', bearbeitet = true,
         bearbeitet_am = now(), bearbeitet_von = coalesce(v_ich, 'unbekannt'),
         geprueft = case when v_check is not null then (v_check->>'geprueft')::boolean else a.geprueft end,
         pruef_hinweis = case when v_check is not null then v_check->>'hinweis' else a.pruef_hinweis end,
         freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
   where a.id = v_alt.id
   returning * into v_zeile;
  return private.agenda_zeile(v_zeile);
end
$$;

-- ----------------------------------------------------------------------------
-- Agenda mit KI: Eingabe, Prüfen, Speichern (nur Admin, solange salons.ki_nur_admin an ist)
-- ----------------------------------------------------------------------------
create or replace function public.agenda_ki_eingabe(p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.gesamt_zugriff(p_monat, false);
  v_e     jsonb;
begin
  v_e := private.agenda_ki_eingabe_bauen(v_salon, private.monatsanfang(p_monat));
  return jsonb_build_object('eingabe', v_e, 'hash', md5(v_e::text));
end
$$;

-- Ergebnis: { geprueft, abweichungen[], hinweis, struktur_fehler }. Stimmt der Aufbau nicht, ist struktur_fehler der Grund.
create or replace function public.agenda_ki_pruefen(p_monat date, p_bloecke jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.gesamt_zugriff(p_monat, false);
  v_monat  date := private.monatsanfang(p_monat);
  v_agenda jsonb;
  v_check  jsonb;
begin
  begin
    v_agenda := private.agenda_ki_bauen(v_salon, v_monat, p_bloecke);
    perform private.agenda_validieren(v_agenda);
  exception when others then
    return jsonb_build_object(
      'geprueft', false, 'abweichungen', '[]'::jsonb, 'struktur_fehler',
      case when sqlstate = '22023' then sqlerrm else 'Die Agenda hat nicht das vorgegebene Format.' end,
      'hinweis', null);
  end;
  v_check := private.analyse_faktencheck(private.agenda_ki_eingabe_bauen(v_salon, v_monat), private.agenda_punkte_text(v_agenda), null);
  return v_check || jsonb_build_object('struktur_fehler', null);
end
$$;

create or replace function public.agenda_ki_speichern(
  p_monat date, p_bloecke jsonb, p_prompt_version text,
  p_anbieter text default null, p_modell text default null, p_versuche integer default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon   uuid := private.gesamt_zugriff(p_monat, false);
  v_monat   date := private.monatsanfang(p_monat);
  v_agenda  jsonb;
  v_eingabe jsonb;
  v_check   jsonb;
  v_zeile   public.analysen;
begin
  if p_prompt_version is null or btrim(p_prompt_version) = '' then
    raise exception 'Die Prompt-Version fehlt.' using errcode = '22023';
  end if;

  -- Aufbau und Zeitbudget prüft die Datenbank (22023), „geprueft“ rechnet sie selbst
  v_agenda := private.agenda_ki_bauen(v_salon, v_monat, p_bloecke);
  perform private.agenda_validieren(v_agenda);
  v_eingabe := private.agenda_ki_eingabe_bauen(v_salon, v_monat);
  v_check := private.analyse_faktencheck(v_eingabe, private.agenda_punkte_text(v_agenda), null);

  insert into public.analysen
    (salon_id, monat, typ, person_id, status, text, ausgabe, eingabe_hash, prompt_version, anbieter, modell, versuche,
     geprueft, pruef_hinweis)
  values
    (v_salon, v_monat, 'team_agenda', null, 'entwurf', private.agenda_text(v_agenda), v_agenda, md5(v_eingabe::text),
     p_prompt_version, p_anbieter, p_modell, p_versuche, (v_check->>'geprueft')::boolean, v_check->>'hinweis')
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
    set status = 'entwurf', text = excluded.text, ausgabe = excluded.ausgabe, eingabe_hash = excluded.eingabe_hash,
        prompt_version = excluded.prompt_version, anbieter = excluded.anbieter, modell = excluded.modell,
        versuche = excluded.versuche, geprueft = excluded.geprueft, pruef_hinweis = excluded.pruef_hinweis,
        bearbeitet = false, bearbeitet_am = null, bearbeitet_von = null,
        freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
  returning * into v_zeile;

  return private.agenda_zeile(v_zeile);
end
$$;

revoke all on function
  public.agenda_ki_eingabe(date), public.agenda_ki_pruefen(date, jsonb),
  public.agenda_ki_speichern(date, jsonb, text, text, text, integer)
from public, anon;
grant execute on function
  public.agenda_ki_eingabe(date), public.agenda_ki_pruefen(date, jsonb),
  public.agenda_ki_speichern(date, jsonb, text, text, text, integer)
to authenticated;
