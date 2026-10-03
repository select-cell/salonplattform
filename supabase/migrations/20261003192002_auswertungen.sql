-- ============================================================================
-- Phase 3 · Auswertungen (Plan §5.3, §5.5, §5.6)
--
--   meine_ergebnisse(von, bis)       Teilnehmerinnen: eigene Ergebnisse, Kommentare OHNE Absender
--   team_ergebnisse(von, bis)        alle Eingeloggten: nur Schnitte, keine Einzelpersonen
--   person_ergebnisse(person, von, bis)  Verantwortlicher/Admin: wie oben, MIT Absender
--   team_dashboard(monat)            Verantwortlicher/Admin: alles zu einem Monat in einem Aufruf
--
-- Gerechnet wird ausschließlich hier (Plan §5.5), nie im Frontend:
--   Selbstbild  = eigene Note je Verhalten und Monat
--   Fremdbild   = Durchschnitt der Noten der Kolleginnen
--   Abweichung  = Selbstbild − Fremdbild
-- Grundlage sind die Personen-IDs. Altdaten zählen, sobald ihre Personen angelegt sind.
-- Die Sichtbarkeit für Mitarbeiterinnen ist an einer Stelle gebündelt: private.person_auswertung().
-- ============================================================================

-- Salon, dessen Daten die aufrufende Person auswerten darf. Admin ohne Salon: der erste Salon.
create or replace function private.auswertungs_salon()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.salon_id, (select s.id from public.salons s order by s.erstellt_am limit 1))
  from public.personen p
  where p.auth_user_id = (select auth.uid()) and p.aktiv
$$;

-- Wie oben, aber nur für Verantwortliche und Admins
create or replace function private.leitung_salon()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.salon_id, (select s.id from public.salons s order by s.erstellt_am limit 1))
  from public.personen p
  where p.auth_user_id = (select auth.uid()) and p.aktiv
    and p.rolle in ('verantwortlicher', 'admin')
$$;

revoke all on function private.auswertungs_salon(), private.leitung_salon() from public;

create or replace function private.schwellen(p_salon uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ausgewogen', s.schwelle_ausgewogen,
                            'niedrig', s.schwelle_niveau_niedrig,
                            'hoch', s.schwelle_niveau_hoch)
  from public.salons s where s.id = p_salon
$$;

-- Alle Monate, zu denen es Abgaben gibt (neuester zuerst), für die Monatsauswahl
create or replace function private.monate_mit_daten(p_salon uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_char(x.monat, 'YYYY-MM') order by x.monat desc), '[]'::jsonb)
  from (select distinct a.monat from public.umfrage_abgaben a where a.salon_id = p_salon) x
$$;

revoke all on function private.schwellen(uuid), private.monate_mit_daten(uuid) from public;

-- ----------------------------------------------------------------------------
-- Auswertung einer Person. mit_absender = false: Mitarbeiterin sieht sich selbst.
-- ----------------------------------------------------------------------------
create or replace function private.person_auswertung(
  p_salon uuid, p_person uuid, p_von date, p_bis date, p_mit_absender boolean
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_person jsonb;
begin
  select jsonb_build_object('id', p.id, 'name', p.name) into v_person
  from public.personen p where p.id = p_person and p.salon_id = p_salon;
  if v_person is null then
    raise exception 'Person nicht gefunden.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'person', v_person,
    'schwellen', private.schwellen(p_salon),
    'monate', private.monate_mit_daten(p_salon),

    -- je Monat × Verhalten: Selbstbild, Fremdbild-Schnitt, Anzahl Fremdbilder
    'verhalten', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monat, x.nr)
      from (
        select to_char(b.monat, 'YYYY-MM') as monat, b.verhalten_nr as nr,
               max(b.grundpfeiler) as grundpfeiler, max(b.saeule) as saeule, max(b.verhalten) as titel,
               max(b.note) filter (where b.art = 'selbstbild') as sb,
               round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb,
               count(*) filter (where b.art = 'fremdbild') as anzahl_fb
        from public.umfrage_bewertungen b
        join public.umfrage_abgaben a on a.id = b.abgabe_id
        where a.salon_id = p_salon and b.bewertete_person_id = p_person
          and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)
        group by b.monat, b.verhalten_nr
      ) x), '[]'::jsonb),

    -- Kommentare der Kolleginnen zu mir. Ohne Absender in zufälliger, aber stabiler Reihenfolge,
    -- damit die Reihenfolge nichts über den Absender verrät.
    'kommentare', coalesce((
      select jsonb_agg(jsonb_build_object('monat', to_char(b.monat, 'YYYY-MM'), 'nr', b.verhalten_nr,
                                          'kommentar', b.kommentar, 'note', b.note)
                       order by b.monat, b.verhalten_nr, md5(b.id::text))
      from public.umfrage_bewertungen b
      join public.umfrage_abgaben a on a.id = b.abgabe_id
      where a.salon_id = p_salon and b.bewertete_person_id = p_person and b.art = 'fremdbild'
        and b.kommentar is not null
        and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)), '[]'::jsonb),

    -- Eigene Antworten auf die Skalen-Fragen der Rituale
    'rituale', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monat, x.ritual, x.frage_nr)
      from (
        select to_char(a.monat, 'YYYY-MM') as monat, r.ritual, r.frage_nr, r.frage, r.antwort_zahl as antwort
        from public.umfrage_rituale r
        join public.umfrage_abgaben a on a.id = r.abgabe_id
        where a.salon_id = p_salon and a.feedbackgeber_id = p_person and r.typ = 'skala'
          and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
      ) x), '[]'::jsonb),

    -- Ausfülldauer in Minuten je Monat (Plan §5.5)
    'dauer', coalesce((
      select jsonb_agg(jsonb_build_object('monat', to_char(a.monat, 'YYYY-MM'),
                                          'minuten', round(a.ausfuelldauer_sek / 60.0, 1)) order by a.monat)
      from public.umfrage_abgaben a
      where a.salon_id = p_salon and a.feedbackgeber_id = p_person), '[]'::jsonb),

    -- Entwicklung des Monats: wie oft wurde die Person genannt (Absender nur für die Leitung)
    'entwicklung', coalesce((
      select jsonb_agg(
               case when p_mit_absender
                 then jsonb_build_object('monat', to_char(a.monat, 'YYYY-MM'), 'von', a.feedbackgeber,
                                         'begruendung', a.entwicklung_begruendung)
                 else jsonb_build_object('monat', to_char(a.monat, 'YYYY-MM')) end
               order by a.monat, md5(a.id::text))
      from public.umfrage_abgaben a
      join public.personen pe on pe.id = p_person
      where a.salon_id = p_salon and a.entwicklung_person = pe.name
        and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)), '[]'::jsonb),

    -- Einzelbewertungen der Kolleginnen mit Absender: nur für Verantwortliche und Admins
    'einzelwerte', case when p_mit_absender then coalesce((
      select jsonb_agg(jsonb_build_object('monat', to_char(b.monat, 'YYYY-MM'), 'nr', b.verhalten_nr,
                                          'von', b.bewertende_person, 'note', b.note, 'kommentar', b.kommentar)
                       order by b.monat, b.verhalten_nr, b.bewertende_person)
      from public.umfrage_bewertungen b
      join public.umfrage_abgaben a on a.id = b.abgabe_id
      where a.salon_id = p_salon and b.bewertete_person_id = p_person and b.art = 'fremdbild'
        and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)), '[]'::jsonb)
      else null end
  );
end
$$;

revoke all on function private.person_auswertung(uuid, uuid, date, date, boolean) from public;

-- ----------------------------------------------------------------------------
-- meine_ergebnisse: Teilnehmerinnen, nur die eigenen Daten, ohne Absender
-- ----------------------------------------------------------------------------
create or replace function public.meine_ergebnisse(p_von date default null, p_bis date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t record;
begin
  select * into t from private.teilnehmerin();
  if not found then
    raise exception 'Du nimmst nicht an der Teamumfrage teil.' using errcode = '42501';
  end if;
  return private.person_auswertung(t.salon_id, t.id, p_von, p_bis, false);
end
$$;

-- ----------------------------------------------------------------------------
-- person_ergebnisse: Verantwortlicher und Admin, mit Absender
-- ----------------------------------------------------------------------------
create or replace function public.person_ergebnisse(p_person uuid, p_von date default null, p_bis date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  return private.person_auswertung(v_salon, p_person, p_von, p_bis, true);
end
$$;

-- ----------------------------------------------------------------------------
-- team_ergebnisse: nur Schnitte, keine Einzelpersonen (außer Anzahl Nennungen)
-- ----------------------------------------------------------------------------
create or replace function public.team_ergebnisse(p_von date default null, p_bis date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.auswertungs_salon();
begin
  if v_salon is null then
    raise exception 'Kein Zugang.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'schwellen', private.schwellen(v_salon),
    'monate', private.monate_mit_daten(v_salon),

    'verhalten', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monat, x.nr)
      from (
        select to_char(b.monat, 'YYYY-MM') as monat, b.verhalten_nr as nr,
               max(b.grundpfeiler) as grundpfeiler, max(b.saeule) as saeule, max(b.verhalten) as titel,
               round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb,
               round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
        from public.umfrage_bewertungen b
        join public.umfrage_abgaben a on a.id = b.abgabe_id
        where a.salon_id = v_salon
          and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)
        group by b.monat, b.verhalten_nr
      ) x), '[]'::jsonb),

    'rituale_skalen', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monat, x.ritual, x.frage_nr)
      from (
        select to_char(a.monat, 'YYYY-MM') as monat, r.ritual, r.frage_nr, max(r.frage) as frage,
               round(avg(r.antwort_zahl), 2) as schnitt, count(*) as anzahl
        from public.umfrage_rituale r
        join public.umfrage_abgaben a on a.id = r.abgabe_id
        where a.salon_id = v_salon and r.typ = 'skala'
          and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
        group by a.monat, r.ritual, r.frage_nr
      ) x), '[]'::jsonb),

    'rituale_phasen', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monat, x.ritual, x.nennungen desc)
      from (
        select to_char(a.monat, 'YYYY-MM') as monat, r.ritual, r.antwort_text as phase, count(*) as nennungen
        from public.umfrage_rituale r
        join public.umfrage_abgaben a on a.id = r.abgabe_id
        where a.salon_id = v_salon and r.typ = 'auswahl' and r.antwort_text is not null
          and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
        group by a.monat, r.ritual, r.antwort_text
      ) x), '[]'::jsonb),

    -- nur die Anzahl der Nennungen pro Person, ohne Absender und Begründung
    'entwicklung', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monat, x.nennungen desc, x.person)
      from (
        select to_char(a.monat, 'YYYY-MM') as monat, a.entwicklung_person as person, count(*) as nennungen
        from public.umfrage_abgaben a
        where a.salon_id = v_salon and a.entwicklung_person is not null
          and (p_von is null or a.monat >= p_von) and (p_bis is null or a.monat <= p_bis)
        group by a.monat, a.entwicklung_person
      ) x), '[]'::jsonb),

    'dauer', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.monat)
      from (
        select to_char(a.monat, 'YYYY-MM') as monat,
               round(avg(a.ausfuelldauer_sek) / 60.0, 1) as minuten, count(*) as abgaben
        from public.umfrage_abgaben a
        where a.salon_id = v_salon
        group by a.monat
      ) x), '[]'::jsonb)
  );
end
$$;

-- ----------------------------------------------------------------------------
-- team_dashboard(monat): Verantwortlicher und Admin, alles zu einem Monat
-- ----------------------------------------------------------------------------
create or replace function public.team_dashboard(p_monat date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.leitung_salon();
  v_monat  date;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;

  -- Standard: der neueste Monat mit Daten
  v_monat := coalesce(
    p_monat - (extract(day from p_monat)::int - 1),
    (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));

  return jsonb_build_object(
    'schwellen', private.schwellen(v_salon),
    'monate', private.monate_mit_daten(v_salon),
    'monat', to_char(v_monat, 'YYYY-MM'),

    -- je Person: Selbstbild, Fremdbild, Ausfülldauer, Rang nach Fremdbild
    'personen', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.rang, x.name)
      from (
        select p.id, p.name, y.sb, y.fb,
               round(y.sb - y.fb, 2) as differenz,
               d.minuten,
               case when y.fb is null then null else rank() over (order by y.fb desc nulls last) end as rang
        from public.personen p
        join (
          select b.bewertete_person_id as pid,
                 round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb,
                 round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
          from public.umfrage_bewertungen b
          join public.umfrage_abgaben a on a.id = b.abgabe_id
          where a.salon_id = v_salon and b.monat = v_monat and b.bewertete_person_id is not null
          group by b.bewertete_person_id
        ) y on y.pid = p.id
        left join (
          select a.feedbackgeber_id as pid, round(a.ausfuelldauer_sek / 60.0, 1) as minuten
          from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat
        ) d on d.pid = p.id
      ) x), '[]'::jsonb),

    -- Team-Schnitte je Verhalten
    'verhalten', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.nr)
      from (
        select b.verhalten_nr as nr, max(b.grundpfeiler) as grundpfeiler, max(b.saeule) as saeule,
               max(b.verhalten) as titel,
               round(avg(b.note) filter (where b.art = 'selbstbild'), 2) as sb,
               round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
        from public.umfrage_bewertungen b
        join public.umfrage_abgaben a on a.id = b.abgabe_id
        where a.salon_id = v_salon and b.monat = v_monat
        group by b.verhalten_nr
      ) x), '[]'::jsonb),

    -- Matrix Verhalten × Person (Heatmap und Detailtabelle)
    'matrix', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.nr, x.person_id)
      from (
        select b.verhalten_nr as nr, b.bewertete_person_id as person_id,
               max(b.note) filter (where b.art = 'selbstbild') as sb,
               round(avg(b.note) filter (where b.art = 'fremdbild'), 2) as fb
        from public.umfrage_bewertungen b
        join public.umfrage_abgaben a on a.id = b.abgabe_id
        where a.salon_id = v_salon and b.monat = v_monat and b.bewertete_person_id is not null
        group by b.verhalten_nr, b.bewertete_person_id
      ) x), '[]'::jsonb),

    'rituale_skalen', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ritual, x.frage_nr)
      from (
        select r.ritual, r.frage_nr, max(r.frage) as frage, round(avg(r.antwort_zahl), 2) as schnitt, count(*) as anzahl
        from public.umfrage_rituale r
        join public.umfrage_abgaben a on a.id = r.abgabe_id
        where a.salon_id = v_salon and a.monat = v_monat and r.typ = 'skala'
        group by r.ritual, r.frage_nr
      ) x), '[]'::jsonb),

    'rituale_phasen', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ritual, x.nennungen desc)
      from (
        select r.ritual, r.antwort_text as phase, count(*) as nennungen
        from public.umfrage_rituale r
        join public.umfrage_abgaben a on a.id = r.abgabe_id
        where a.salon_id = v_salon and a.monat = v_monat and r.typ = 'auswahl' and r.antwort_text is not null
        group by r.ritual, r.antwort_text
      ) x), '[]'::jsonb),

    'entwicklung', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.nennungen desc, x.person)
      from (
        select a.entwicklung_person as person, count(*) as nennungen,
               jsonb_agg(jsonb_build_object('von', a.feedbackgeber, 'begruendung', a.entwicklung_begruendung)
                         order by a.feedbackgeber) as nennungen_von
        from public.umfrage_abgaben a
        where a.salon_id = v_salon and a.monat = v_monat and a.entwicklung_person is not null
        group by a.entwicklung_person
      ) x), '[]'::jsonb)
  );
end
$$;

-- Nur für eingeloggte Nutzer
revoke all on function public.meine_ergebnisse(date, date), public.person_ergebnisse(uuid, date, date),
                       public.team_ergebnisse(date, date), public.team_dashboard(date)
  from public, anon;
grant execute on function public.meine_ergebnisse(date, date), public.person_ergebnisse(uuid, date, date),
                          public.team_ergebnisse(date, date), public.team_dashboard(date)
  to authenticated;
