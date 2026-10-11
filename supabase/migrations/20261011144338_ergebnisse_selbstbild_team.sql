-- ============================================================================
-- Rückmeldungen aus Wunschliste des Auftraggebers:
--  * person_auswertung liefert zusätzlich 'selbst_kommentare' (Selbstbild-Antworten der Person),
--    sichtbar bei Admin, Verantwortlichen und der Mitarbeiterin selbst.
--  * team_dashboard steht jetzt auch Mitarbeiterinnen offen (Rangliste und Heatmap mit Namen).
--    Für sie bleiben Ausfülldauer je Person und die Absender der Entwicklungs-Nennungen leer.
-- ============================================================================

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

    -- Eigene Antworten im Selbstbild (Note und Kommentar der Person über sich selbst)
    'selbst_kommentare', coalesce((
      select jsonb_agg(jsonb_build_object('monat', to_char(b.monat, 'YYYY-MM'), 'nr', b.verhalten_nr,
                                          'kommentar', b.kommentar, 'note', b.note)
                       order by b.monat, b.verhalten_nr)
      from public.umfrage_bewertungen b
      join public.umfrage_abgaben a on a.id = b.abgabe_id
      where a.salon_id = p_salon and b.bewertete_person_id = p_person and b.art = 'selbstbild'
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

create or replace function public.team_dashboard(p_monat date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.auswertungs_salon();
  v_leitung boolean := private.leitung_salon() is not null;
  v_monat  date;
begin
  if v_salon is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
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
               case when v_leitung then d.minuten end as minuten,
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
               case when v_leitung then jsonb_agg(jsonb_build_object('von', a.feedbackgeber, 'begruendung', a.entwicklung_begruendung)
                         order by a.feedbackgeber) else '[]'::jsonb end as nennungen_von
        from public.umfrage_abgaben a
        where a.salon_id = v_salon and a.monat = v_monat and a.entwicklung_person is not null
        group by a.entwicklung_person
      ) x), '[]'::jsonb)
  );
end
$$;

revoke all on function public.team_dashboard(date) from public, anon;
grant execute on function public.team_dashboard(date) to authenticated;
