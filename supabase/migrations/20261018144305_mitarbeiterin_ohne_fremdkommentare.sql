-- ============================================================================
-- Mitarbeiterinnen sehen in "Meine Ergebnisse" keine Fremdbild-Kommentare der Kolleginnen mehr,
-- nur ihre eigenen Selbstbild-Antworten. Verantwortliche und Admins bleiben unverändert.
-- Nur private.person_auswertung ändert sich (Feld 'kommentare' ist für Mitarbeiterinnen leer).
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

    -- Kommentare der Kolleginnen zu mir (Fremdbild). Mitarbeiterinnen sehen sie nicht, nur ihre eigenen
    -- Selbstbild-Antworten (unten). Für Verantwortliche und Admins bleibt es wie bisher.
    'kommentare', case when p_mit_absender then coalesce((
      select jsonb_agg(jsonb_build_object('monat', to_char(b.monat, 'YYYY-MM'), 'nr', b.verhalten_nr,
                                          'kommentar', b.kommentar, 'note', b.note)
                       order by b.monat, b.verhalten_nr, md5(b.id::text))
      from public.umfrage_bewertungen b
      join public.umfrage_abgaben a on a.id = b.abgabe_id
      where a.salon_id = p_salon and b.bewertete_person_id = p_person and b.art = 'fremdbild'
        and b.kommentar is not null
        and (p_von is null or b.monat >= p_von) and (p_bis is null or b.monat <= p_bis)), '[]'::jsonb)
      else '[]'::jsonb end,

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
