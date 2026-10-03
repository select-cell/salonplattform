-- ============================================================================
-- Phase 4 · Abgabe-Status und Reminder (Plan §5.3, §6)
--
--   abgabe_status(monat)         pro Teilnehmerin: abgegeben ja/nein, Zeitpunkt
--   ueberfaellige_abgaben(heute) Reminder-Liste für Verantwortliche und Admins
--
-- Frist: letzter Tag des Monats M (Europe/Berlin). Überfällig ist eine fehlende Abgabe, sobald
-- seit Fristende mehr als `reminder_tage_nach_frist` Tage vergangen sind (Standard 3):
-- Frist 31.10. → Reminder ab 4.11. Berechnet wird live, ein täglicher Job ist nicht nötig.
-- `p_heute` erlaubt, die Regel mit einem simulierten Datum zu testen.
-- ============================================================================

create or replace function public.abgabe_status(p_monat date default null)
returns table (
  person_id    uuid,
  name         text,
  abgegeben    boolean,
  abgegeben_am timestamptz,
  frist        date
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_monat date;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;

  v_monat := coalesce(p_monat, (now() at time zone 'Europe/Berlin')::date);
  v_monat := v_monat - (extract(day from v_monat)::int - 1);

  return query
  select p.id, p.name, a.id is not null, a.abgeschickt_am,
         (v_monat + interval '1 month' - interval '1 day')::date
  from public.personen p
  join public.salons s on s.id = p.salon_id
  left join public.umfrage_abgaben a
         on a.salon_id = p.salon_id and a.feedbackgeber_id = p.id and a.monat = v_monat
  where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage
    and greatest(s.start_monat, coalesce(p.aktiv_ab, s.start_monat)) <= v_monat
  order by p.name;
end
$$;

create or replace function public.ueberfaellige_abgaben(p_heute date default null)
returns table (
  person_id        uuid,
  name             text,
  monat_key        text,
  frist            date,
  tage_ueberfaellig integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_heute date := coalesce(p_heute, (now() at time zone 'Europe/Berlin')::date);
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, to_char(m.monat, 'YYYY-MM'),
         m.frist, v_heute - m.frist
  from public.personen p
  join public.salons s on s.id = p.salon_id
  cross join lateral (
    select g::date as monat, (g + interval '1 month' - interval '1 day')::date as frist
    from generate_series(
           greatest(s.start_monat, coalesce(p.aktiv_ab, s.start_monat))::timestamp,
           (v_heute - (extract(day from v_heute)::int - 1))::timestamp,
           interval '1 month') g
  ) m
  where p.salon_id = v_salon and p.aktiv and p.nimmt_an_teamumfrage
    and v_heute - m.frist > s.reminder_tage_nach_frist
    and not exists (
      select 1 from public.umfrage_abgaben a
      where a.salon_id = p.salon_id and a.feedbackgeber_id = p.id and a.monat = m.monat)
  order by v_heute - m.frist desc, p.name;
end
$$;

revoke all on function public.abgabe_status(date), public.ueberfaellige_abgaben(date) from public, anon;
grant execute on function public.abgabe_status(date), public.ueberfaellige_abgaben(date) to authenticated;
