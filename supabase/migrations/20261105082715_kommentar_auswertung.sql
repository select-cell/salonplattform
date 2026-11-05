-- ============================================================================
-- Phase D · Kommentar-Auswertung (Version 1.2, Erweiterung D)
--
-- Zeigt der Leitung, WER Kommentare schreibt, WIE ausführlich und WER keine schreibt.
--
--   v_kommentar_metriken        Kennzahlen je Salon, Monat und Absender (Ansicht, für Anmeldungen gesperrt)
--   kommentar_auswertung(monat) nur Verantwortliche und Admin; Kennzahlen je Person und gewichtetes Team
--
-- Kennzahlen (alle in SQL, nie im Frontend):
--   Kommentare, Quote        Kommentare ÷ Bewertungen in %
--   Pflicht                  Bewertungen ab 4 (Kommentar vorgeschrieben); „erfüllt“ = davon mit Kommentar
--   Freiwillig               Kommentare zu Bewertungen 1 bis 3; freiwillige Quote = Kommentare ÷ Bewertungen 1 bis 3
--   Ø Wörter                 Länge der Kommentare
--   Kurz                     Kommentare unter 5 Wörtern
--   Doppelt                  Wiederholungen desselben Textes (Groß-/Kleinschreibung und Leerzeichen egal)
--   Verhalten ohne Kommentar Verhalten, zu denen der Absender nirgends etwas geschrieben hat
--
-- Datenschutz: Kennzahlen je Person als Absender, aber NIE ein Kommentartext.
-- Schalter salons.eigene_analyse_nur_admin (Standard aus): ist er an, sieht ein Verantwortlicher seine eigenen
-- Werte nicht; der Admin sieht alles, Team-Summen bleiben vollständig.
--
-- Wiederholbar (if not exists, create or replace), ohne DROP und DELETE.
-- ============================================================================

alter table public.salons
  add column if not exists eigene_analyse_nur_admin boolean not null default false;

comment on column public.salons.eigene_analyse_nur_admin is
  'Datenschutz-Schalter: an = Verantwortliche sehen ihre eigenen Kommentar-Kennzahlen und Analysen nicht (nur der Admin).';

-- ----------------------------------------------------------------------------
-- Ansicht: eine Zeile je Salon, Monat und Absender (nur Bewertungen mit zugeordneter Person)
-- ----------------------------------------------------------------------------
create or replace view public.v_kommentar_metriken as
with b as (
  select a.salon_id, bw.monat, bw.bewertende_person_id as person_id, bw.verhalten_nr, bw.note,
         nullif(btrim(bw.kommentar), '') as text
  from public.umfrage_bewertungen bw
  join public.umfrage_abgaben a on a.id = bw.abgabe_id
  where bw.bewertende_person_id is not null and a.salon_id is not null
),
k as (
  select b.*,
         lower(regexp_replace(b.text, '\s+', ' ', 'g')) as norm,
         coalesce(array_length(regexp_split_to_array(b.text, '\s+'), 1), 0) as woerter
  from b
)
select k.salon_id, k.monat, k.person_id,
       count(*)::integer                                              as bewertungen,
       count(k.text)::integer                                         as kommentare,
       (count(*) filter (where k.note >= 4))::integer                 as pflicht,
       (count(k.text) filter (where k.note >= 4))::integer            as pflicht_erfuellt,
       (count(*) filter (where k.note < 4))::integer                  as freiwillig_bewertungen,
       (count(k.text) filter (where k.note < 4))::integer             as freiwillig_kommentare,
       coalesce(sum(k.woerter) filter (where k.text is not null), 0)::integer as woerter_summe,
       (count(*) filter (where k.text is not null and k.woerter < 5))::integer as kurz,
       (count(k.text) - count(distinct k.norm) filter (where k.text is not null))::integer as doppelt,
       (count(distinct k.verhalten_nr) - count(distinct k.verhalten_nr) filter (where k.text is not null))::integer as verhalten_ohne_kommentar
from k
group by k.salon_id, k.monat, k.person_id;

comment on view public.v_kommentar_metriken is
  'Kommentar-Kennzahlen je Salon, Monat und Absender. Nur über kommentar_auswertung() erreichbar, nie Kommentartexte.';

alter view public.v_kommentar_metriken owner to postgres;
revoke all on public.v_kommentar_metriken from anon, authenticated;

-- ----------------------------------------------------------------------------
-- kommentar_auswertung: Kennzahlen je Person und Team (gewichtet: Summe ÷ Summe)
-- „Nicht abgegeben“ zählt nur, wer für den Monat erwartet wird (aktiv_ab und Salon-Start zählen).
-- ----------------------------------------------------------------------------
create or replace function public.kommentar_auswertung(p_monat date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon     uuid := private.leitung_salon();
  v_monat     date;
  v_ich       uuid;
  v_ich_rolle text;
  v_versteckt boolean;
  v_start     date;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;

  select p.id, p.rolle into v_ich, v_ich_rolle
  from public.personen p
  where p.auth_user_id = (select auth.uid()) and p.aktiv;

  select s.start_monat, (s.eigene_analyse_nur_admin and v_ich_rolle = 'verantwortlicher')
    into v_start, v_versteckt
  from public.salons s where s.id = v_salon;

  v_monat := coalesce(
    p_monat - (extract(day from p_monat)::integer - 1),
    (select max(a.monat) from public.umfrage_abgaben a where a.salon_id = v_salon));

  return (
    with m as (
      select x.person_id, x.bewertungen, x.kommentare, x.pflicht, x.pflicht_erfuellt,
             x.freiwillig_bewertungen, x.freiwillig_kommentare, x.woerter_summe, x.kurz, x.doppelt,
             x.verhalten_ohne_kommentar
      from public.v_kommentar_metriken x
      where x.salon_id = v_salon and x.monat = v_monat
    ),
    erwartet as (
      select p.id, p.name
      from public.personen p
      where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage
        and greatest(v_start, coalesce(p.aktiv_ab, v_start)) <= v_monat
    ),
    zeilen as (
      select p.id, p.name, m.*
      from m join public.personen p on p.id = m.person_id
    ),
    team as (
      select count(*)::integer as abgegeben,
             coalesce(sum(bewertungen), 0)::integer as bewertungen,
             coalesce(sum(kommentare), 0)::integer as kommentare,
             coalesce(sum(pflicht), 0)::integer as pflicht,
             coalesce(sum(pflicht_erfuellt), 0)::integer as pflicht_erfuellt,
             coalesce(sum(freiwillig_bewertungen), 0)::integer as freiwillig_bewertungen,
             coalesce(sum(freiwillig_kommentare), 0)::integer as freiwillig_kommentare,
             coalesce(sum(woerter_summe), 0)::integer as woerter_summe,
             coalesce(sum(kurz), 0)::integer as kurz,
             coalesce(sum(doppelt), 0)::integer as doppelt,
             coalesce(sum(verhalten_ohne_kommentar), 0)::integer as verhalten_ohne_kommentar
      from m
    )
    select jsonb_build_object(
      'monat', to_char(v_monat, 'YYYY-MM'),
      'monate', private.monate_mit_daten(v_salon),
      'schwelle_pflicht', 4,
      'kurz_unter_woerter', 5,
      'eigene_analyse_nur_admin', (select s.eigene_analyse_nur_admin from public.salons s where s.id = v_salon),
      'team', (
        select jsonb_build_object(
          'erwartet', (select count(*) from erwartet),
          'abgegeben', t.abgegeben,
          'nicht_abgegeben', (select count(*) from erwartet e where not exists (select 1 from m where m.person_id = e.id)),
          'bewertungen', t.bewertungen,
          'kommentare', t.kommentare,
          'quote', case when t.bewertungen > 0 then round(100.0 * t.kommentare / t.bewertungen, 1) end,
          'pflicht', t.pflicht,
          'pflicht_erfuellt', t.pflicht_erfuellt,
          'freiwillig_bewertungen', t.freiwillig_bewertungen,
          'freiwillig_kommentare', t.freiwillig_kommentare,
          'freiwillige_quote', case when t.freiwillig_bewertungen > 0 then round(100.0 * t.freiwillig_kommentare / t.freiwillig_bewertungen, 1) end,
          'woerter_schnitt', case when t.kommentare > 0 then round(t.woerter_summe::numeric / t.kommentare, 1) end,
          'kurz', t.kurz,
          'kurz_anteil', case when t.kommentare > 0 then round(100.0 * t.kurz / t.kommentare, 1) end,
          'doppelt', t.doppelt,
          'verhalten_ohne_kommentar', t.verhalten_ohne_kommentar)
        from team t),
      'personen', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', z.id, 'name', z.name,
          'bewertungen', z.bewertungen,
          'kommentare', z.kommentare,
          'quote', case when z.bewertungen > 0 then round(100.0 * z.kommentare / z.bewertungen, 1) end,
          'pflicht', z.pflicht,
          'pflicht_erfuellt', z.pflicht_erfuellt,
          'freiwillig_bewertungen', z.freiwillig_bewertungen,
          'freiwillig_kommentare', z.freiwillig_kommentare,
          'freiwillige_quote', case when z.freiwillig_bewertungen > 0 then round(100.0 * z.freiwillig_kommentare / z.freiwillig_bewertungen, 1) end,
          'woerter_schnitt', case when z.kommentare > 0 then round(z.woerter_summe::numeric / z.kommentare, 1) end,
          'kurz', z.kurz,
          'doppelt', z.doppelt,
          'verhalten_ohne_kommentar', z.verhalten_ohne_kommentar) order by z.name)
        from zeilen z
        where not (v_versteckt and z.id = v_ich)), '[]'::jsonb),
      'nicht_abgegeben', coalesce((
        select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name)
        from erwartet e
        where not exists (select 1 from m where m.person_id = e.id)
          and not (v_versteckt and e.id = v_ich)), '[]'::jsonb)
    )
  );
end
$$;

revoke all on function public.kommentar_auswertung(date) from public, anon;
grant execute on function public.kommentar_auswertung(date) to authenticated;
