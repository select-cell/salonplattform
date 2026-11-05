-- ============================================================================
-- Phase C · PDF-Export (Version 1.2, Erweiterung C)
--
-- Monats- und Personenbericht als PDF, nur für Verantwortliche und Admin. Das PDF entsteht im Browser;
-- die Datenbank liefert die Zahlen und führt Protokoll:
--
--   pdf_monatsbericht(monat)            Beteiligung, Kennzahlen, Ergebnis je Verhalten, Kommentar- und Zeit-Kennzahlen.
--                                       Keine Rangliste einzelner Personen.
--   pdf_personenbericht(person, monat)  Ergebnisse einer Person; Kommentare der Kollegen OHNE Absender.
--   pdf_export_protokoll(limit)         nur Admin: wer hat was wann abgerufen
--
-- Die Zahlen kommen aus denselben Funktionen wie am Bildschirm (team_dashboard, kommentar_auswertung,
-- zeit_auswertung, person_auswertung). Ein Monat ohne Abgaben ergibt 22023. Jeder erfolgreiche Abruf schreibt einen
-- Protokolleintrag; abgelehnte Abrufe schreiben nichts.
--
-- Wiederholbar (if not exists, create or replace), ohne DROP und DELETE.
-- ============================================================================

create table if not exists public.pdf_export_log (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid        references public.salons (id)   on delete cascade,
  exportiert_von   uuid        references public.personen (id) on delete set null,
  von_name         text        not null,
  art              text        not null check (art in ('monatsbericht', 'personenbericht')),
  monat            date        not null,
  ziel_person_id   uuid        references public.personen (id) on delete set null,
  ziel_name        text,
  erstellt_am      timestamptz not null default now()
);

comment on table public.pdf_export_log is 'Protokoll der PDF-Abrufe (Erweiterung C). Nur der Admin liest es über pdf_export_protokoll().';

create index if not exists pdf_export_log_erstellt on public.pdf_export_log (erstellt_am desc);

alter table public.pdf_export_log enable row level security;
revoke all on table public.pdf_export_log from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Monatsbericht
-- ----------------------------------------------------------------------------
create or replace function public.pdf_monatsbericht(p_monat date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon uuid := private.leitung_salon();
  v_monat date;
  v_ich   record;
  v_dash  jsonb;
  v_komm  jsonb;
  v_zeit  jsonb;
  v_sb    numeric;
  v_fb    numeric;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if p_monat is null then
    raise exception 'Der Monat fehlt.' using errcode = '22023';
  end if;
  v_monat := p_monat - (extract(day from p_monat)::integer - 1);

  if not exists (select 1 from public.umfrage_abgaben a where a.salon_id = v_salon and a.monat = v_monat) then
    raise exception 'Für diesen Monat gibt es keine Auswertung.' using errcode = '22023';
  end if;

  select p.id, p.name into v_ich
  from public.personen p where p.auth_user_id = (select auth.uid()) and p.aktiv;

  v_dash := public.team_dashboard(v_monat);
  v_komm := public.kommentar_auswertung(v_monat);
  v_zeit := public.zeit_auswertung(v_monat);

  select round(avg((x->>'sb')::numeric), 2), round(avg((x->>'fb')::numeric), 2)
    into v_sb, v_fb
  from jsonb_array_elements(v_dash->'personen') x;

  insert into public.pdf_export_log (salon_id, exportiert_von, von_name, art, monat)
  values (v_salon, v_ich.id, coalesce(v_ich.name, 'unbekannt'), 'monatsbericht', v_monat);

  return jsonb_build_object(
    'salon', (select s.name from public.salons s where s.id = v_salon),
    'monat', to_char(v_monat, 'YYYY-MM'),
    'erstellt_am', now(),
    'schwellen', v_dash->'schwellen',
    'beteiligung', jsonb_build_object(
      'erwartet', v_komm->'team'->'erwartet',
      'abgegeben', v_komm->'team'->'abgegeben'),
    'kennzahlen', jsonb_build_object(
      'sb', v_sb, 'fb', v_fb,
      'differenz', case when v_sb is not null and v_fb is not null then round(v_sb - v_fb, 2) end),
    'verhalten', v_dash->'verhalten',
    'kommentare', jsonb_build_object('team', v_komm->'team', 'personen', v_komm->'personen'),
    'zeit', v_zeit->'zusammenfassung',
    'agenda', null
  );
end
$$;

-- ----------------------------------------------------------------------------
-- Personenbericht: Kommentare der Kollegen ohne Absender, Entwicklung des Monats ohne Absender
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
    'analyse', null
  );
end
$$;

-- ----------------------------------------------------------------------------
-- Protokoll: nur Admin
-- ----------------------------------------------------------------------------
create or replace function public.pdf_export_protokoll(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.rolle() is distinct from 'admin' then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'erstellt_am', x.erstellt_am, 'von', x.von_name, 'art', x.art,
             'monat', to_char(x.monat, 'YYYY-MM'), 'ziel', x.ziel_name) order by x.erstellt_am desc)
    from (
      select * from public.pdf_export_log l
      order by l.erstellt_am desc
      limit greatest(1, least(coalesce(p_limit, 50), 500))
    ) x), '[]'::jsonb);
end
$$;

revoke all on function public.pdf_monatsbericht(date), public.pdf_personenbericht(uuid, date),
                       public.pdf_export_protokoll(integer) from public, anon;
grant execute on function public.pdf_monatsbericht(date), public.pdf_personenbericht(uuid, date),
                          public.pdf_export_protokoll(integer) to authenticated;
