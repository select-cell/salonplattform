# Dawiid · Team-Plattform

Web-Plattform für den Salon: Mitarbeiterinnen füllen monatlich die Verhaltens-Umfrage aus und sehen ihre Ergebnisse. Der Verantwortliche sieht alles im Detail. Der Admin pflegt Zugänge in Supabase.

Die vollständige Bauanleitung steht in [`docs/plattform-architektur.md`](docs/plattform-architektur.md).

**Technik:** React + Vite + TypeScript (Netlify), Backend komplett in Supabase (Datenbank, Magic-Link-Login, Row Level Security, Datenbank-Funktionen).

## Stand

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Fundament: Design, Login per Magic Link, Rollen, geschützte Routen, Dashboards, Platzhalter-Seiten, Tabellen `salons`/`personen`, Inhalts-Tabellen | **fertig** |
| 2 | Monatsumfrage in der Plattform | wartet auf Referenzdateien (siehe unten) |
| 3 | Auswertungen | folgt nach Phase 2 |
| 4 | Abgabe-Status und Reminder | folgt nach Phase 2 |
| 5 | Chef-, Gäste- und Verantwortlichen-Umfrage | Inhalte folgen |
| 6 | Jarvis | folgt |

**Für Phase 2 fehlt im Repo** (Plan §10.1), bitte ablegen:

- `referenz/umfrage-dawiid.html`: liefert die 20 Verhalten mit Bewertungsstufen und die 2 Rituale für den Seed sowie die Vorlage der Umfrage
- `supabase/umfrage_schema.sql` und `supabase/ausfuelldauer.sql`: der Ist-Stand der bestehenden Umfrage-Tabellen, damit sie korrekt erweitert werden
- `referenz/dashboard-alt.html`: Vorlage für die Auswertungen (Phase 3)

Außerdem zu klären (Plan §9): Fragetexte „in diesem Monat“ statt „im letzten Monat“, und der Start-Monat der Plattform. Aktuell steht `start_monat` auf **Oktober 2026**.

## Aufbau

```
src/                  React-App (pages, components, auth, lib, styles)
supabase/
  migrations/         SQL-Migrationen, werden von der GitHub-Integration angewendet
  tests/database/     pgTAP-Tests für Rechte und Verknüpfung (supabase test db)
  email-vorlagen/     Magic-Link- und Einladungs-Mail auf Deutsch
  config.toml         Supabase-CLI
docs/                 Architektur-Dokument
public/_redirects     SPA-Routing für Netlify
netlify.toml          Build-Einstellungen und Sicherheits-Header
```

Die Migrationen heißen `JJJJMMTThhmmss_name.sql`. Nur dieses Format wird von Supabase angewendet (die Nummerierung `001_…` aus dem Plan würde übersprungen).

## Lokal starten

```bash
npm install
cp .env.example .env     # VITE_SUPABASE_ANON_KEY eintragen (Supabase → Project Settings → API)
npm run dev              # http://localhost:5173
npm run build            # Produktions-Build nach dist/
```

In die `.env` gehört **nur** der öffentliche anon-/publishable-Key. Den `service_role`-/secret-Key niemals ins Frontend oder ins Repo. Die App weigert sich zu starten, wenn sie einen geheimen Schlüssel erkennt.

## Supabase einrichten

### 1. Tabellen über die GitHub-Integration anlegen

1. Supabase-Dashboard → **Project Settings → Integrations → GitHub**: Repo `select-cell/salonplattform` verbinden.
2. Als **Supabase directory** `supabase` eintragen und **Deploy to production** aktivieren. Als Produktions-Branch den Branch wählen, in den dieses Repo gemerged wird (üblicherweise `main`).
3. Sobald der Branch gemerged ist, wendet Supabase alle neuen Dateien aus `supabase/migrations/` automatisch an. Das sind aktuell:
   - `…_salons_personen.sql`: Salons, Personen, automatische Verknüpfung mit dem Login, Zugriffsschutz, Funktion `ich()`, Salon „Dawiid“
   - `…_inhalte_tabellen.sql`: Tabellen für Verhalten, Bewertungsstufen, Rituale und Ritual-Fragen (noch leer)

Die Migrationen fassen die bestehenden Umfrage-Tabellen (`umfrage_*`) nicht an. Die alte HTML-Umfrage läuft unverändert weiter.

> Entweder die Integration **oder** den SQL-Editor verwenden, nicht beides. Hat jemand die Dateien von Hand im SQL-Editor ausgeführt, schlägt dieselbe Migration über die Integration mit „already exists“ fehl.

### 2. Auth-Einstellungen (Plan §4.3)

> Die Menünamen im Supabase-Dashboard ändern sich gelegentlich. Gemeint sind jeweils die Bereiche für URL, Sign-up, E-Mail-Vorlagen und SMTP unter *Authentication*.

Supabase → **Authentication**:

- **URL Configuration:** Site URL = die Netlify-Domain. Redirect URLs = Netlify-Domain (mit `/auth/callback`) und `http://localhost:5173/auth/callback`.
- **Sign In / Providers → Email:** aktiv. **„Allow new users to sign up“ ausschalten**, damit sich niemand selbst registriert.
- **Emails → Templates:** Inhalt aus [`supabase/email-vorlagen/`](supabase/email-vorlagen) einfügen (Magic link und Invite user). Die Betreffzeilen stehen jeweils im Kommentar am Dateianfang.

### 3. Eigener E-Mail-Versand (Pflicht)

Der eingebaute Supabase-Versand stellt nur an Mitglieder des Supabase-Teams zu und ist auf etwa 2 Mails pro Stunde begrenzt. Ohne eigenen Versand kommen die Magic Links bei den Mitarbeiterinnen nicht an.

1. Konto bei [Resend](https://resend.com) anlegen (kostenloser Tarif reicht) und die Absender-Domain verifizieren.
2. Supabase → **Authentication → Emails → SMTP Settings**: Custom SMTP aktivieren und die Resend-Zugangsdaten eintragen.
3. Supabase → **Authentication → Rate Limits**: das E-Mail-Limit passend hochsetzen.

### 4. Person anlegen

Für jede Person zwei Schritte, die Reihenfolge ist egal. Ein Trigger verknüpft Login und Person über die E-Mail-Adresse.

**a) Person eintragen** (SQL-Editor oder Table Editor, Tabelle `personen`):

```sql
-- Mitarbeiterin, nimmt an der Teamumfrage teil
insert into public.personen (salon_id, name, email, rolle, nimmt_an_teamumfrage)
select id, 'Oksana Serafyn', 'oksana@beispiel.de', 'mitarbeiter', true
from public.salons where name = 'Dawiid';

-- Verantwortlicher (Chef), nimmt nicht teil
insert into public.personen (salon_id, name, email, rolle, nimmt_an_teamumfrage)
select id, 'Name Chef', 'chef@beispiel.de', 'verantwortlicher', false
from public.salons where name = 'Dawiid';

-- Admin (ohne Salon)
insert into public.personen (salon_id, name, email, rolle, nimmt_an_teamumfrage)
values (null, 'Name Admin', 'admin@beispiel.de', 'admin', false);
```

**b) Einladen:** Supabase → **Authentication → Users → Invite user** mit derselben E-Mail-Adresse.

Danach öffnet die Person den Einladungslink oder meldet sich unter `/login` an und landet im passenden Bereich.

Zugang pausieren: `update public.personen set aktiv = false where email = '…';`

### Wer sieht was?

| Rolle | Rechte |
|---|---|
| `mitarbeiter` | eigene Ergebnisse, Team nur als Schnitt, keine Rohdaten |
| `verantwortlicher` | alles im eigenen Salon, nimmt nicht an der Teamumfrage teil |
| `admin` | alles, salonübergreifend |

Die Rechte stecken in Row Level Security und Datenbank-Funktionen. Die Routen-Sperren im Frontend sind nur Komfort.

## Tests

Die Datenbank-Rechte sind mit pgTAP getestet (Verknüpfung, Constraints, wer was lesen darf):

```bash
supabase start && supabase test db
```

## Deploy (Netlify)

- **Weg A:** lokal `npm run build`, dann den Ordner `dist/` per Drag & Drop hochladen. Die `.env` wird beim Bauen eingebacken.
- **Weg B (empfohlen):** Repo mit Netlify verbinden. `netlify.toml` enthält Build-Befehl und Header. Die Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` kommen in die Netlify-Einstellungen.

Die Netlify-Domain danach in den Supabase-Redirect-URLs eintragen (siehe oben).
