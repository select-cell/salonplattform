-- ============================================================================
-- Phase 1 · Fundament
-- Salons, Personen, Verknüpfung mit dem Login (auth.users), Zugriffsschutz, ich()
--
-- Läuft über die Supabase-GitHub-Integration automatisch, sobald der Branch in
-- den Produktions-Branch gemerged wird (oder manuell im SQL-Editor).
-- Die Migration ändert KEINE bestehenden Tabellen der alten Umfrage.
-- ============================================================================

-- Hilfsschema für interne Funktionen. Es ist nicht über die REST-API erreichbar
-- (Supabase stellt nur `public` bereit), die Policies dürfen die Funktionen aber nutzen.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ----------------------------------------------------------------------------
-- Salons
-- ----------------------------------------------------------------------------
create table public.salons (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  -- Ab diesem Monat (1. des Monats) zählen Umfragen und Reminder.
  start_monat               date not null,
  -- Einstellungen statt Konstanten im Code (§5.5, §6)
  reminder_tage_nach_frist  smallint     not null default 3,
  schwelle_ausgewogen       numeric(3,1) not null default 0.3,
  schwelle_niveau_niedrig   numeric(3,1) not null default 2.5,
  schwelle_niveau_hoch      numeric(3,1) not null default 3.5,
  erstellt_am               timestamptz  not null default now(),
  constraint salons_start_monat_erster check (extract(day from start_monat) = 1),
  constraint salons_reminder_tage      check (reminder_tage_nach_frist >= 0),
  constraint salons_schwellen          check (schwelle_niveau_niedrig < schwelle_niveau_hoch)
);

comment on table public.salons is
  'Salons. Vorerst einer (Dawiid), aber von Anfang an mitgeführt.';

-- ----------------------------------------------------------------------------
-- Personen = Brücke zwischen Login und Fachlichkeit
-- ----------------------------------------------------------------------------
create table public.personen (
  id                    uuid primary key default gen_random_uuid(),
  salon_id              uuid references public.salons (id) on delete restrict,
  auth_user_id          uuid unique references auth.users (id) on delete set null,
  name                  text not null,
  email                 text not null unique,
  rolle                 text not null,
  nimmt_an_teamumfrage  boolean not null default false,
  aktiv                 boolean not null default true,
  -- Erster Monat, für den die Person abgeben muss (null = ab Salon-Start)
  aktiv_ab              date,
  erstellt_am           timestamptz not null default now(),
  constraint personen_rolle        check (rolle in ('mitarbeiter', 'verantwortlicher', 'admin')),
  -- Nur der Admin darf ohne Salon sein
  constraint personen_salon_pflicht check (rolle = 'admin' or salon_id is not null),
  constraint personen_email_klein  check (email = lower(email)),
  constraint personen_aktiv_ab_erster check (aktiv_ab is null or extract(day from aktiv_ab) = 1)
);

create index personen_salon_id_idx on public.personen (salon_id);

comment on table public.personen is
  'Personen des Salons. Neue Person anlegen, dann dieselbe E-Mail unter Authentication → Users einladen.';
comment on column public.personen.nimmt_an_teamumfrage is
  'Steuert die Teilnahme an der Teamumfrage, unabhängig von der Rolle.';

-- ----------------------------------------------------------------------------
-- Hilfsfunktionen: wer ist der Aufrufer?
-- security definer, damit Policies auf `personen` sich nicht selbst aufrufen
-- (sonst Endlosschleife). Gesperrte (aktiv = false) Personen gelten als niemand.
-- ----------------------------------------------------------------------------
create or replace function private.person_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id
  from public.personen p
  where p.auth_user_id = (select auth.uid())
    and p.aktiv
$$;

create or replace function private.rolle()
returns text
language sql stable security definer set search_path = ''
as $$
  select p.rolle
  from public.personen p
  where p.auth_user_id = (select auth.uid())
    and p.aktiv
$$;

create or replace function private.salon_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.salon_id
  from public.personen p
  where p.auth_user_id = (select auth.uid())
    and p.aktiv
$$;

-- Darf der Aufrufer Daten dieses Salons sehen? Mitglieder des Salons und Admins.
create or replace function private.darf_salon(p_salon_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.rolle = 'admin' or p.salon_id = p_salon_id
     from public.personen p
     where p.auth_user_id = (select auth.uid())
       and p.aktiv),
    false)
$$;

revoke all on function private.person_id(), private.rolle(), private.salon_id(),
                       private.darf_salon(uuid) from public;
grant execute on function private.person_id(), private.rolle(), private.salon_id(),
                          private.darf_salon(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Verknüpfung Person ↔ Login, in beiden Reihenfolgen
--  a) Person zuerst angelegt, dann der Nutzer eingeladen  → Trigger auf auth.users
--  b) Nutzer zuerst eingeladen, dann die Person angelegt  → Trigger auf personen
-- ----------------------------------------------------------------------------
create or replace function private.person_vorbereiten()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  new.name  := btrim(new.name);

  if new.auth_user_id is null then
    select u.id
      into new.auth_user_id
    from auth.users u
    where lower(u.email) = new.email
      and not exists (
        select 1 from public.personen p
        where p.auth_user_id = u.id and p.id <> new.id
      )
    limit 1;
  end if;

  return new;
end
$$;

create trigger personen_vorbereiten
  before insert or update of email on public.personen
  for each row execute function private.person_vorbereiten();

create or replace function private.auth_user_verknuepfen()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is not null then
    update public.personen p
       set auth_user_id = new.id
     where p.email = lower(new.email)
       and p.auth_user_id is null
       and not exists (
         select 1 from public.personen q where q.auth_user_id = new.id
       );
  end if;
  return new;
end
$$;

create trigger auth_user_verknuepfen
  after insert or update of email on auth.users
  for each row execute function private.auth_user_verknuepfen();

-- ----------------------------------------------------------------------------
-- Row Level Security: `personen` und `salons` sind nur lesbar, nie schreibbar.
-- Schreiben passiert ausschließlich im Supabase-Dashboard (Rolle postgres).
-- ----------------------------------------------------------------------------
alter table public.salons   enable row level security;
alter table public.personen enable row level security;

revoke all on public.salons, public.personen from anon, authenticated;
grant select on public.salons, public.personen to authenticated;

create policy salons_lesen on public.salons
  for select to authenticated
  using (private.darf_salon(id));

create policy personen_eigene_zeile on public.personen
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy personen_leitung_liest_salon on public.personen
  for select to authenticated
  using (
    private.rolle() in ('verantwortlicher', 'admin')
    and private.darf_salon(salon_id)
  );

-- ----------------------------------------------------------------------------
-- ich(): eigene Zeile für das Frontend (Rolle, Salon, Teilnahme).
-- Liefert die Zeile auch für gesperrte Personen (aktiv = false), damit die App
-- einen passenden Hinweis zeigen kann. Keine Zeile = Login ohne Person.
-- ----------------------------------------------------------------------------
create or replace function public.ich()
returns table (
  id                    uuid,
  name                  text,
  email                 text,
  rolle                 text,
  salon_id              uuid,
  salon_name            text,
  nimmt_an_teamumfrage  boolean,
  aktiv                 boolean,
  aktiv_ab              date
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.email, p.rolle, p.salon_id, s.name,
         p.nimmt_an_teamumfrage, p.aktiv, p.aktiv_ab
  from public.personen p
  left join public.salons s on s.id = p.salon_id
  where p.auth_user_id = (select auth.uid())
$$;

revoke all on function public.ich() from public, anon;
grant execute on function public.ich() to authenticated;

-- ----------------------------------------------------------------------------
-- Start-Salon
-- start_monat ist offener Punkt 3 im Plan (§9) und kann jederzeit angepasst werden:
--   update public.salons set start_monat = '2026-11-01' where name = 'Dawiid';
-- ----------------------------------------------------------------------------
insert into public.salons (name, start_monat)
select 'Dawiid', date '2026-10-01'
where not exists (select 1 from public.salons where name = 'Dawiid');
