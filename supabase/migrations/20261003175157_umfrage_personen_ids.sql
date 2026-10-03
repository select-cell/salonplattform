-- ============================================================================
-- Phase 2 · §5.2: Umfrage-Tabellen bekommen Personen-IDs
--
-- Die Namens-Spalten (salon, feedbackgeber, bewertete_person …) bleiben als
-- Momentaufnahme erhalten. Für Auswertungen zählen ab jetzt die IDs.
-- Alle neuen Spalten sind optional, damit bestehende Zeilen und die alte
-- HTML-Umfrage unverändert weiterlaufen.
-- ============================================================================

alter table public.umfrage_abgaben
  add column if not exists salon_id          uuid references public.salons (id),
  add column if not exists feedbackgeber_id  uuid references public.personen (id);

alter table public.umfrage_bewertungen
  add column if not exists bewertende_person_id uuid references public.personen (id),
  add column if not exists bewertete_person_id  uuid references public.personen (id);

comment on column public.umfrage_abgaben.salon_id is
  'Salon laut Plattform. Null bei Abgaben der alten HTML-Umfrage, solange die Person nicht angelegt ist.';
comment on column public.umfrage_abgaben.feedbackgeber_id is
  'Person, die die Umfrage abgegeben hat (aus dem Login, nie aus dem Formular).';

-- Pro Salon, Monat und Person genau eine Abgabe (Plan §5.2).
-- Zeilen ohne IDs (Altdaten) sind davon ausgenommen; für sie gilt weiter die
-- Eindeutigkeit über die Namen (abgaben_einmal_pro_monat).
create unique index if not exists abgaben_einmal_pro_monat_id
  on public.umfrage_abgaben (salon_id, monat, feedbackgeber_id);

create index if not exists idx_abgaben_feedbackgeber_id
  on public.umfrage_abgaben (feedbackgeber_id);
create index if not exists idx_bewertungen_bewertete_person_id
  on public.umfrage_bewertungen (bewertete_person_id, monat);
create index if not exists idx_bewertungen_bewertende_person_id
  on public.umfrage_bewertungen (bewertende_person_id);

-- Selbstbild nur für sich selbst, Fremdbild nur für andere (wie bewertungen_art_passt, aber über IDs)
alter table public.umfrage_bewertungen
  add constraint bewertungen_art_passt_id check (
    bewertende_person_id is null
    or bewertete_person_id is null
    or ((art = 'selbstbild') = (bewertete_person_id = bewertende_person_id))
  );

-- ----------------------------------------------------------------------------
-- Backfill (Plan §5.2): Altdaten bekommen ihre IDs über den Namensabgleich mit
-- `personen`. Weil Personen erst nach dieser Migration angelegt werden, passiert
-- das automatisch, sobald eine Person mit passendem Namen und Salon entsteht.
-- ----------------------------------------------------------------------------
create or replace function private.umfrage_ids_nachtragen(p_person_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p public.personen%rowtype;
  v_salon text;
begin
  select * into p from public.personen where id = p_person_id;
  if not found or p.salon_id is null then
    return;
  end if;
  select s.name into v_salon from public.salons s where s.id = p.salon_id;

  update public.umfrage_abgaben a
     set salon_id = p.salon_id, feedbackgeber_id = p.id
   where a.salon = v_salon and a.feedbackgeber = p.name and a.feedbackgeber_id is null;

  update public.umfrage_bewertungen b
     set bewertende_person_id = p.id
   where b.salon = v_salon and b.bewertende_person = p.name and b.bewertende_person_id is null;

  update public.umfrage_bewertungen b
     set bewertete_person_id = p.id
   where b.salon = v_salon and b.bewertete_person = p.name and b.bewertete_person_id is null;
end
$$;

revoke all on function private.umfrage_ids_nachtragen(uuid) from public;

create or replace function private.person_alte_umfragen()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.umfrage_ids_nachtragen(new.id);
  return new;
end
$$;

create trigger personen_alte_umfragen
  after insert or update of name, salon_id on public.personen
  for each row execute function private.person_alte_umfragen();

-- Bereits vorhandene Personen einmalig nachziehen
select private.umfrage_ids_nachtragen(id) from public.personen;
