-- ============================================================================
-- Bestellsystem „Jetzt anfordern“ (Phase 1) · docs/bestellsystem.md
--
-- Gäste fordern am Platz etwas an (Wasser, Apfelschorle …). Die Anfrage geht an
-- einen n8n-Webhook, der sie an Telegram schickt und hier speichert.
--
--   plaetze             Welche Plätze es gibt        Frontend liest, n8n prüft
--   artikel             Speisekarte                  Frontend liest, n8n prüft
--   anfragen            Eine Zeile je Anfrage        nur n8n (Service-Key)
--   anfrage_positionen  Artikel einer Anfrage        nur n8n (Service-Key)
--
-- Das Frontend nutzt den öffentlichen Key und darf nur `plaetze` und `artikel`
-- lesen, nie schreiben. `anfragen` und `anfrage_positionen` sind für anon und
-- eingeloggte Nutzer komplett gesperrt (RLS ohne Policy, dazu entzogene Rechte).
-- Keine personenbezogenen Daten.
--
-- Die Migration ändert KEINE bestehenden Tabellen. Sie ist wiederholbar im
-- Seed-Teil (on conflict do nothing).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Plätze
-- `platz` ist der Schlüssel, weil er im QR-Link steht (/p/4). Das gilt je Domain,
-- also je Salon. Kommt ein zweiter Salon mit eigener Domain dazu, genügt das;
-- sollen mehrere Salons dieselbe Domain teilen, muss der Schlüssel erweitert werden.
-- ----------------------------------------------------------------------------
create table public.plaetze (
  platz        int primary key,
  salon_id     uuid not null references public.salons (id) on delete restrict,
  bezeichnung  text,
  aktiv        boolean not null default true,
  constraint plaetze_platz_positiv check (platz > 0)
);

create index plaetze_salon_id_idx on public.plaetze (salon_id);

comment on table public.plaetze is
  'Plätze des Salons mit QR-Link /p/<platz>. Inaktive Plätze sind für Gäste unsichtbar.';

-- ----------------------------------------------------------------------------
-- Artikel = Speisekarte. Neuer Artikel: eine Zeile ergänzen, kein Code-Umbau.
-- Kategorien (getraenk, decke, essen …) steuern die Gruppierung der Telegram-Nachricht.
-- ----------------------------------------------------------------------------
create table public.artikel (
  id          text primary key,
  salon_id    uuid not null references public.salons (id) on delete restrict,
  name        text not null,
  kategorie   text not null default 'getraenk',
  aktiv       boolean not null default true,
  sortierung  int not null default 0,
  constraint artikel_id_format check (id ~ '^[a-z0-9_]+$'),
  constraint artikel_name_nicht_leer check (btrim(name) <> '')
);

create index artikel_salon_id_idx on public.artikel (salon_id);

comment on table public.artikel is
  'Speisekarte. Auslaufende Artikel mit aktiv = false ausblenden, nicht löschen (alte Anfragen verweisen darauf).';

-- ----------------------------------------------------------------------------
-- Anfragen
-- `id` kommt vom Frontend (anfrage_id) und verhindert Doppelungen: eine zweite
-- Zeile mit derselben ID scheitert am Primärschlüssel.
-- ----------------------------------------------------------------------------
create table public.anfragen (
  id           uuid primary key,
  erstellt_am  timestamptz not null default now(),
  platz        int not null references public.plaetze (platz),
  typ          text not null default 'anfrage'
);

-- Sperre pro Platz: „gibt es in den letzten N Sekunden eine Anfrage an diesem Platz?“
create index anfragen_platz_erstellt_idx on public.anfragen (platz, erstellt_am desc);

comment on table public.anfragen is
  'Eine Zeile je abgeschickter Anfrage (anonym). Schreiben und Lesen nur über n8n.';

create table public.anfrage_positionen (
  id          uuid primary key default gen_random_uuid(),
  anfrage_id  uuid not null references public.anfragen (id) on delete cascade,
  artikel_id  text not null references public.artikel (id),
  menge       int not null,
  constraint anfrage_positionen_menge check (menge between 1 and 10),
  -- Gleiche Artikel werden vor dem Speichern zu einer Position zusammengeführt
  unique (anfrage_id, artikel_id)
);

-- Auswertung „meistangefragte Artikel“; der Index auf anfrage_id steckt im Unique-Constraint.
create index anfrage_positionen_artikel_id_idx on public.anfrage_positionen (artikel_id);

-- ----------------------------------------------------------------------------
-- Zugriff
-- Supabase vergibt auf neue Tabellen standardmäßig alle Rechte an anon und
-- authenticated. Das wird zuerst entzogen, danach nur Lesen auf die Speisekarte.
-- Eingeloggte Teammitglieder lesen sie ebenfalls (sie scannen auch mal einen QR-Code).
-- ----------------------------------------------------------------------------
alter table public.plaetze            enable row level security;
alter table public.artikel            enable row level security;
alter table public.anfragen           enable row level security;
alter table public.anfrage_positionen enable row level security;

revoke all on public.plaetze, public.artikel,
              public.anfragen, public.anfrage_positionen from anon, authenticated;
grant select on public.plaetze, public.artikel to anon, authenticated;

create policy plaetze_lesen on public.plaetze
  for select to anon, authenticated
  using (aktiv);

create policy artikel_lesen on public.artikel
  for select to anon, authenticated
  using (aktiv);

-- anfragen und anfrage_positionen: bewusst keine Policy = kein Zugriff für anon und
-- authenticated. n8n nutzt den Service-Key und umgeht RLS.

-- ----------------------------------------------------------------------------
-- Startdaten: 7 Plätze und die zwei Artikel von Phase 1 für den Salon Dawiid
-- ----------------------------------------------------------------------------
insert into public.plaetze (platz, salon_id)
select p.platz, s.id
from public.salons s
cross join generate_series(1, 7) as p (platz)
where s.name = 'Dawiid'
on conflict (platz) do nothing;

insert into public.artikel (id, salon_id, name, kategorie, sortierung)
select a.id, s.id, a.name, 'getraenk', a.sortierung
from public.salons s
cross join (values
  ('wasser',       'Wasser',       1),
  ('apfelschorle', 'Apfelschorle', 2)
) as a (id, name, sortierung)
where s.name = 'Dawiid'
on conflict (id) do nothing;
