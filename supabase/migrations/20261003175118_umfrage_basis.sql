-- ============================================================================
-- Basis der bestehenden Umfrage (Stand vor der Plattform)
--
-- Die Tabellen umfrage_abgaben, umfrage_rituale, umfrage_bewertungen, die
-- Auswertungs-Views v_* und die Funktion umfrage_einreichen() wurden bisher von
-- Hand angelegt (supabase/umfrage_schema.sql, ausfuelldauer.sql). Diese Migration
-- bildet sie ab, damit eine FRISCHE Datenbank (lokale Tests, Vorschau-Branches,
-- Neuaufbau) dieselbe Basis hat.
--
-- Im bestehenden Projekt tut sie nichts: Sobald umfrage_abgaben existiert, wird
-- der gesamte Block übersprungen. Es wird nichts überschrieben.
-- ============================================================================

do $basis$
begin
  if to_regclass('public.umfrage_abgaben') is not null then
    return;
  end if;

  execute $q$
    create table public.umfrage_abgaben (
      id                      uuid primary key default gen_random_uuid(),
      salon                   text not null,
      monat                   date not null,
      feedbackgeber           text not null,
      entwicklung_person      text,
      entwicklung_begruendung text,
      abgeschickt_am          timestamptz not null default now(),
      zeitpunkt_client        timestamptz,
      umfrage_version         text,
      rohdaten                jsonb not null,
      gestartet_am            timestamptz,
      ausfuelldauer_sek       integer,
      constraint abgaben_monat_erster
        check (monat = date_trunc('month', monat::timestamp with time zone)::date),
      constraint abgaben_entwicklung_nicht_selbst
        check (entwicklung_person is null or entwicklung_person <> feedbackgeber),
      constraint abgaben_dauer_plausibel
        check (ausfuelldauer_sek is null or (ausfuelldauer_sek >= 60 and ausfuelldauer_sek <= 86400)),
      constraint abgaben_einmal_pro_monat unique (salon, monat, feedbackgeber)
    )
  $q$;
  execute $q$ comment on table public.umfrage_abgaben is 'Eine Zeile pro abgeschickter Umfrage.' $q$;
  execute $q$ comment on column public.umfrage_abgaben.monat is 'Bewerteter Monat (1. des Monats). Standard: Vormonat der Abgabe.' $q$;
  execute $q$ comment on column public.umfrage_abgaben.rohdaten is 'Unveränderter Datensatz aus der Umfrage – Sicherung, falls später Felder ergänzt werden.' $q$;
  execute $q$ comment on column public.umfrage_abgaben.gestartet_am is 'Start der Umfrage laut Gerät (Feedbackgeber gewählt, erste Frage).' $q$;
  execute $q$ comment on column public.umfrage_abgaben.ausfuelldauer_sek is 'Dauer vom Start bis zum Absenden in Sekunden; leer, wenn unbekannt oder unplausibel.' $q$;
  execute $q$ create index idx_abgaben_salon_monat on public.umfrage_abgaben (salon, monat) $q$;

  execute $q$
    create table public.umfrage_rituale (
      id           bigint generated always as identity primary key,
      abgabe_id    uuid not null references public.umfrage_abgaben (id) on delete cascade,
      ritual       text not null,
      frage_nr     smallint not null,
      frage        text not null,
      typ          text not null,
      antwort_zahl smallint,
      antwort_text text,
      constraint umfrage_rituale_typ_check check (typ in ('skala', 'auswahl', 'text')),
      constraint umfrage_rituale_antwort_zahl_check check (antwort_zahl >= 1 and antwort_zahl <= 5),
      constraint rituale_typ_passt check (
        (typ = 'skala' and antwort_text is null) or (typ <> 'skala' and antwort_zahl is null)),
      constraint rituale_eindeutig unique (abgabe_id, ritual, frage_nr)
    )
  $q$;
  execute $q$ comment on table public.umfrage_rituale is 'Eine Zeile pro beantworteter Ritual-Frage.' $q$;
  execute $q$ create index idx_rituale_abgabe on public.umfrage_rituale (abgabe_id) $q$;

  execute $q$
    create table public.umfrage_bewertungen (
      id                bigint generated always as identity primary key,
      abgabe_id         uuid not null references public.umfrage_abgaben (id) on delete cascade,
      salon             text not null,
      monat             date not null,
      bewertende_person text not null,
      verhalten_nr      smallint not null,
      grundpfeiler      text,
      saeule            text,
      verhalten         text not null,
      art               text not null,
      bewertete_person  text not null,
      note              smallint not null,
      kommentar         text,
      constraint umfrage_bewertungen_art_check check (art in ('selbstbild', 'fremdbild')),
      constraint umfrage_bewertungen_note_check check (note >= 1 and note <= 5),
      constraint bewertungen_art_passt check (
        (art = 'selbstbild' and bewertete_person = bewertende_person)
        or (art = 'fremdbild' and bewertete_person <> bewertende_person)),
      constraint bewertungen_kommentar_ab_4 check (note < 4 or coalesce(btrim(kommentar), '') <> ''),
      constraint bewertungen_eindeutig unique (abgabe_id, verhalten_nr, bewertete_person)
    )
  $q$;
  execute $q$ comment on table public.umfrage_bewertungen is 'Eine Zeile pro Verhalten × bewertete Person (Selbst- und Fremdbild).' $q$;
  execute $q$ create index idx_bewertungen_abgabe on public.umfrage_bewertungen (abgabe_id) $q$;
  execute $q$ create index idx_bewertungen_person on public.umfrage_bewertungen (salon, monat, bewertete_person) $q$;
  execute $q$ create index idx_bewertungen_verhalten on public.umfrage_bewertungen (salon, monat, verhalten_nr) $q$;

  -- Kein direkter Zugriff über die API: alles läuft über Funktionen
  execute $q$ alter table public.umfrage_abgaben    enable row level security $q$;
  execute $q$ alter table public.umfrage_rituale    enable row level security $q$;
  execute $q$ alter table public.umfrage_bewertungen enable row level security $q$;
  execute $q$ revoke all on public.umfrage_abgaben, public.umfrage_rituale, public.umfrage_bewertungen
              from anon, authenticated $q$;

  -- Auswertungs-Views für das Supabase-Dashboard
  execute $q$
    create view public.v_abgabe_status as
    select salon, monat, feedbackgeber, abgeschickt_am,
           round(ausfuelldauer_sek::numeric / 60.0, 1) as ausfuelldauer_min
    from public.umfrage_abgaben
    order by salon, monat desc, feedbackgeber
  $q$;
  execute $q$
    create view public.v_ausfuelldauer as
    select salon, monat, feedbackgeber as person,
           round(ausfuelldauer_sek::numeric / 60.0, 1) as dauer_min,
           round(avg(ausfuelldauer_sek) over (partition by salon, monat) / 60.0, 1) as team_schnitt_min
    from public.umfrage_abgaben
    order by salon, monat desc, feedbackgeber
  $q$;
  execute $q$
    create view public.v_entwicklung_des_monats as
    select salon, monat, entwicklung_person as person, count(*) as nennungen,
           array_agg(feedbackgeber order by feedbackgeber) as genannt_von
    from public.umfrage_abgaben
    where entwicklung_person is not null
    group by salon, monat, entwicklung_person
  $q$;
  execute $q$
    create view public.v_person_saeule as
    select salon, monat, bewertete_person as person, grundpfeiler, saeule,
           round(avg(note) filter (where art = 'selbstbild'), 2) as selbstbild_schnitt,
           round(avg(note) filter (where art = 'fremdbild'), 2) as fremdbild_schnitt,
           count(*) filter (where art = 'fremdbild') as anzahl_fremdbewertungen
    from public.umfrage_bewertungen
    group by salon, monat, bewertete_person, grundpfeiler, saeule
  $q$;
  execute $q$
    create view public.v_rituale_phasen as
    select a.salon, a.monat, r.ritual, r.antwort_text as phase, count(*) as nennungen
    from public.umfrage_rituale r
    join public.umfrage_abgaben a on a.id = r.abgabe_id
    where r.typ = 'auswahl'
    group by a.salon, a.monat, r.ritual, r.antwort_text
  $q$;
  execute $q$
    create view public.v_rituale_skalen as
    select a.salon, a.monat, r.ritual, r.frage_nr, r.frage,
           round(avg(r.antwort_zahl), 2) as schnitt, count(*) as anzahl
    from public.umfrage_rituale r
    join public.umfrage_abgaben a on a.id = r.abgabe_id
    where r.typ = 'skala'
    group by a.salon, a.monat, r.ritual, r.frage_nr, r.frage
  $q$;
  execute $q$
    create view public.v_selbst_vs_fremdbild as
    select salon, monat, bewertete_person as person, verhalten_nr, grundpfeiler, saeule, verhalten,
           max(note) filter (where art = 'selbstbild') as selbstbild,
           round(avg(note) filter (where art = 'fremdbild'), 2) as fremdbild_schnitt,
           count(*) filter (where art = 'fremdbild') as anzahl_fremdbilder,
           round(max(note) filter (where art = 'selbstbild')::numeric
                 - avg(note) filter (where art = 'fremdbild'), 2) as abweichung_selbst_minus_fremd
    from public.umfrage_bewertungen
    group by salon, monat, bewertete_person, verhalten_nr, grundpfeiler, saeule, verhalten
  $q$;

  -- Alte Einreich-Funktion der HTML-Umfrage (anon-Key). Sie bleibt bis zum Umstieg
  -- auf die Plattform aktiv; danach wird anon das Ausführen entzogen.
  execute $q$
    create function public.umfrage_einreichen(payload jsonb)
    returns uuid
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
    declare
      v_id     uuid;
      v_salon  text := nullif(btrim(payload->>'salon'), '');
      v_geber  text := nullif(btrim(payload->>'feedbackgeber'), '');
      v_zeit   timestamptz;
      v_start  timestamptz;
      v_dauer  integer;
      v_monat  date;
      v_anz_bew int;
      v_constraint text;
    begin
      if v_salon is null then raise exception 'Salon fehlt' using errcode = '22023'; end if;
      if v_geber is null then raise exception 'Feedbackgeber fehlt' using errcode = '22023'; end if;
      if jsonb_typeof(payload->'bewertungen') is distinct from 'array'
         or jsonb_array_length(payload->'bewertungen') = 0 then
        raise exception 'Keine Bewertungen enthalten' using errcode = '22023';
      end if;

      v_zeit := coalesce((payload->>'zeitpunkt')::timestamptz, now());

      begin
        v_start := nullif(payload->>'gestartet_am', '')::timestamptz;
      exception when others then
        v_start := null;
      end;
      if v_start is not null and payload ? 'zeitpunkt' then
        v_dauer := extract(epoch from (v_zeit - v_start))::integer;
        if v_dauer not between 60 and 86400 then v_dauer := null; end if;
      end if;

      v_monat := case
        when payload ? 'monat' and nullif(payload->>'monat','') is not null
          then date_trunc('month', (left(payload->>'monat', 7) || '-01')::date)::date
        else date_trunc('month', (now() at time zone 'Europe/Berlin') - interval '1 month')::date
      end;

      insert into public.umfrage_abgaben
        (salon, monat, feedbackgeber, entwicklung_person, entwicklung_begruendung,
         zeitpunkt_client, gestartet_am, ausfuelldauer_sek, umfrage_version, rohdaten)
      values
        (v_salon, v_monat, v_geber,
         nullif(btrim(payload->'entwicklung'->>'person'), ''),
         nullif(btrim(payload->'entwicklung'->>'begruendung'), ''),
         v_zeit, v_start, v_dauer, payload->>'version', payload)
      returning id into v_id;

      insert into public.umfrage_rituale
        (abgabe_id, ritual, frage_nr, frage, typ, antwort_zahl, antwort_text)
      select
        v_id, r->>'ritual', (r->>'frage_nr')::smallint, r->>'frage', r->>'typ',
        case when r->>'typ' = 'skala' then (r->>'antwort')::smallint end,
        case when r->>'typ' <> 'skala' then nullif(btrim(r->>'antwort'), '') end
      from jsonb_array_elements(coalesce(payload->'rituale', '[]'::jsonb)) as r;

      insert into public.umfrage_bewertungen
        (abgabe_id, salon, monat, bewertende_person, verhalten_nr, grundpfeiler, saeule,
         verhalten, art, bewertete_person, note, kommentar)
      select
        v_id, v_salon, v_monat, v_geber,
        (b->>'verhalten_nr')::smallint,
        nullif(b->>'grundpfeiler', ''), nullif(b->>'saeule', ''),
        b->>'verhalten', b->>'art', b->>'bewertete_person',
        (b->>'note')::smallint, nullif(btrim(b->>'kommentar'), '')
      from jsonb_array_elements(payload->'bewertungen') as b;

      get diagnostics v_anz_bew = row_count;
      if v_anz_bew <> jsonb_array_length(payload->'bewertungen') then
        raise exception 'Nicht alle Bewertungen konnten gespeichert werden' using errcode = '22023';
      end if;

      return v_id;

    exception
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'abgaben_einmal_pro_monat' then
          raise exception 'Für % wurde die Umfrage für diesen Monat bereits abgegeben.', v_geber
            using errcode = '23505';
        end if;
        raise;
    end;
    $function$
  $q$;
end
$basis$;
