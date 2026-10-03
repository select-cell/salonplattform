-- ============================================================================
-- Inhalte der Umfrage (§5.1): Verhalten, Bewertungskriterien, Rituale, Fragen.
-- Die Tabellen sind pflegbar im Dashboard statt im Code.
-- Befüllt werden sie in Phase 2 mit den Inhalten der Referenz-Umfrage.
-- ============================================================================

create table public.verhalten (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null references public.salons (id) on delete cascade,
  nr            smallint not null,
  grundpfeiler  text,
  saeule        text,
  titel         text not null,
  -- Vimeo-Player-URL oder .mp4, leer = Platzhalter
  video_url     text,
  aktiv         boolean not null default true,
  unique (salon_id, nr)
);

create table public.verhalten_kriterien (
  id            uuid primary key default gen_random_uuid(),
  verhalten_id  uuid not null references public.verhalten (id) on delete cascade,
  stufe         smallint not null check (stufe between 1 and 5),
  bezeichnung   text,
  prozent       text,
  leitsatz      text,
  punkte        text[] not null default '{}',
  unique (verhalten_id, stufe)
);

create table public.rituale (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references public.salons (id) on delete cascade,
  nr         smallint not null,
  titel      text not null,
  video_url  text,
  aktiv      boolean not null default true,
  unique (salon_id, nr)
);

create table public.ritual_fragen (
  id         uuid primary key default gen_random_uuid(),
  ritual_id  uuid not null references public.rituale (id) on delete cascade,
  nr         smallint not null,
  typ        text not null check (typ in ('skala', 'auswahl', 'text')),
  frage      text not null,
  optionen   text[],
  labels     text[],
  pflicht    boolean not null default false,
  unique (ritual_id, nr),
  constraint ritual_fragen_auswahl_braucht_optionen
    check (typ <> 'auswahl' or coalesce(cardinality(optionen), 0) > 0)
);

-- ----------------------------------------------------------------------------
-- Zugriff: lesen für eingeloggte Nutzer des Salons (und Admins), schreiben nur
-- im Dashboard.
-- ----------------------------------------------------------------------------
alter table public.verhalten           enable row level security;
alter table public.verhalten_kriterien enable row level security;
alter table public.rituale             enable row level security;
alter table public.ritual_fragen       enable row level security;

revoke all on public.verhalten, public.verhalten_kriterien,
              public.rituale,   public.ritual_fragen from anon, authenticated;
grant select on public.verhalten, public.verhalten_kriterien,
                public.rituale,   public.ritual_fragen to authenticated;

create policy verhalten_lesen on public.verhalten
  for select to authenticated
  using (private.darf_salon(salon_id));

create policy verhalten_kriterien_lesen on public.verhalten_kriterien
  for select to authenticated
  using (exists (
    select 1 from public.verhalten v
    where v.id = verhalten_id and private.darf_salon(v.salon_id)
  ));

create policy rituale_lesen on public.rituale
  for select to authenticated
  using (private.darf_salon(salon_id));

create policy ritual_fragen_lesen on public.ritual_fragen
  for select to authenticated
  using (exists (
    select 1 from public.rituale r
    where r.id = ritual_id and private.darf_salon(r.salon_id)
  ));
