# Dawiid · Team-Plattform

Web-Plattform für den Salon: Mitarbeiterinnen füllen monatlich die Verhaltens-Umfrage aus und sehen ihre Ergebnisse. Der Verantwortliche sieht alles im Detail. Der Admin pflegt Zugänge in Supabase.

Die vollständige Bauanleitung steht in [`docs/plattform-architektur.md`](docs/plattform-architektur.md).

**Technik:** React + Vite + TypeScript (Netlify), Backend komplett in Supabase (Datenbank, Magic-Link-Login, Row Level Security, Datenbank-Funktionen).

## Stand

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Fundament: Design, Login per Magic Link, Rollen, geschützte Routen, Dashboards, Platzhalter-Seiten | **fertig** |
| 2 | Monatsumfrage in der Plattform | **fertig, Datenbank in Supabase installiert**. Bewertungsstufen, Videos und die Phasen-Frage fehlen noch (siehe unten) |
| 3 | Auswertungen: Kennzahlen, Diagramme, Rangliste, Heatmap, Top/Flop 4, Verlauf, Einzelbewertungen | **fertig, in Supabase installiert** |
| 4 | Abgabe-Status und Reminder-Popup | **fertig, in Supabase installiert** |
| 5 | Chef-, Gäste- und Verantwortlichen-Umfrage | offen: die Fragen fehlen noch (Seiten sind als „Kommt bald“ vorbereitet) |
| 6 | Jarvis | offen: braucht die n8n-Webhook-URL (Seite ist als „Kommt bald“ vorbereitet) |

### Was in der Umfrage noch fehlt

Die Umfrage läuft vollständig, sobald Personen angelegt sind. Diese Inhalte sind aus der bestehenden Abgabe nicht ablesbar und kommen aus `referenz/umfrage-dawiid.html`:

- **Bewertungsstufen 1 bis 5** je Verhalten (Bezeichnung, Prozent, Leitsatz, Punkte). Ohne sie gibt es nur die Noten.
- **Videos** je Verhalten und Ritual. Ohne Link zeigt die Umfrage „Das Video folgt“ und sperrt nichts.
- **Die Auswahl-Frage „Welche Phase war am wenigsten stabil?“** je Ritual mit ihren Optionen.

Das Nachtragen geht ohne Code, siehe „Inhalte der Umfrage pflegen“. Außerdem zu klären (Plan §9): Die Ritual-Fragen sagen noch „im vergangenen Monat“, obwohl die Umfrage für Monat M bis Ende M läuft. Aktuell steht `start_monat` auf **Oktober 2026**.

## Aufbau

```
src/                  React-App (pages, components, auth, lib, styles)
  components/umfrage/ Ablauf der Monatsumfrage (Schritte, Video-Pflicht, Notenskala)
  lib/umfrage.ts      Ablauf, Prüfungen und Payload der Umfrage (ohne Oberfläche)
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

### 1. Tabellen (bereits installiert)

Alle Migrationen aus `supabase/migrations/` sind am 3. Oktober 2026 im Projekt `hgtvlcucxzksvmvgvbgo` angewendet und dort unter denselben Versionsnummern verbucht wie die Dateinamen:

| Migration | Inhalt |
|---|---|
| `…_salons_personen` | Salons, Personen, automatische Verknüpfung mit dem Login, Zugriffsschutz, `ich()`, Salon „Dawiid“ |
| `…_inhalte_tabellen` | Verhalten, Bewertungsstufen, Rituale und Ritual-Fragen |
| `…_umfrage_basis` | Bildet die bestehenden Umfrage-Tabellen für frische Datenbanken ab. Im Projekt ohne Wirkung |
| `…_umfrage_personen_ids` | Personen-IDs an den Umfrage-Tabellen, Nachtragen der Altdaten |
| `…_umfrage_funktionen` | `umfrage_inhalt`, `meine_monate`, `meine_offenen_monate`, `umfrage_einreichen_v2` |
| `…_seed_dawiid_inhalte` | 20 Verhalten und 2 Rituale mit 9 Fragen |
| `…_auswertungen` | `meine_ergebnisse`, `team_ergebnisse`, `person_ergebnisse`, `team_dashboard` |
| `…_abgabe_status_reminder` | `abgabe_status`, `ueberfaellige_abgaben` (Reminder ab dem 4. Tag nach Fristende) |

Die Dateinamen entsprechen den verbuchten Versionen. Das ist wichtig: Die GitHub-Integration (Supabase → **Project Settings → Integrations → GitHub**, Supabase directory `supabase`, **Deploy to production**) vergleicht Versionen und führt nur neue Dateien aus. Würden Datei und Datenbank abweichen, liefe dieselbe Migration ein zweites Mal und scheiterte an „already exists“.

Für künftige Änderungen: neue Datei mit neuerem Zeitstempel in `supabase/migrations/` anlegen und pushen. Die Integration wendet sie nach dem Merge in den Produktions-Branch an. Wird eine Migration stattdessen direkt angewendet, muss der Dateiname danach zur verbuchten Version passen (`list_migrations` bzw. Tabelle `supabase_migrations.schema_migrations`).

Die bestehenden Umfrage-Tabellen (`umfrage_*`) wurden nur um optionale ID-Spalten ergänzt, die alte HTML-Umfrage läuft unverändert weiter.

### 2. Auth-Einstellungen (Plan §4.3)

> Die Menünamen im Supabase-Dashboard ändern sich gelegentlich. Gemeint sind jeweils die Bereiche für URL, Sign-up, E-Mail-Vorlagen und SMTP unter *Authentication*.

Supabase → **Authentication**:

- **URL Configuration:** Site URL = die Netlify-Domain. Redirect URLs = Netlify-Domain (mit `/auth/callback`) und `http://localhost:5173/auth/callback`.
- **Sign In / Providers → Email:** aktiv. **„Allow new users to sign up“ ausschalten**, damit sich niemand selbst registriert.
- **Emails → Templates:** Inhalt aus [`supabase/email-vorlagen/`](supabase/email-vorlagen) einfügen (Magic link und Invite user). Die Betreffzeilen stehen jeweils im Kommentar am Dateianfang.

### 3. Eigener E-Mail-Versand (nur für den Login per E-Mail-Link)

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

**b) Zugang mit Passwort anlegen:** Supabase → **Authentication → Users → Add user → Create new user**. Dieselbe E-Mail-Adresse, ein Passwort, und **Auto Confirm User** ankreuzen. Es wird keine Mail verschickt, das Passwort gibst du der Person direkt weiter.

Danach meldet sich die Person auf der Startseite mit E-Mail und Passwort an. Der Login per E-Mail-Link bleibt als Alternative, braucht aber den eigenen Mail-Versand (Schritt 3).

Zugang pausieren: `update public.personen set aktiv = false where email = '…';`

### Inhalte der Umfrage pflegen

Alle Inhalte stehen in Tabellen und lassen sich im SQL-Editor oder Table Editor ändern, ohne neuen Build.

```sql
-- Video zu einem Verhalten (Vimeo-Link oder .mp4)
update public.verhalten set video_url = 'https://vimeo.com/123456789'
where nr = 1 and salon_id = (select id from public.salons where name = 'Dawiid');

-- Bewertungsstufe zu einem Verhalten
insert into public.verhalten_kriterien (verhalten_id, stufe, bezeichnung, prozent, leitsatz, punkte)
select v.id, 1, '1 – Bewusstsein', '0–25%', 'Leitsatz …', array['Punkt A', 'Punkt B']
from public.verhalten v
where v.nr = 1 and v.salon_id = (select id from public.salons where name = 'Dawiid');

-- Auswahl-Frage in einem Ritual
insert into public.ritual_fragen (ritual_id, nr, typ, frage, optionen, pflicht)
select r.id, 3, 'auswahl', 'Welche Phase war am wenigsten stabil?', array['Phase 1', 'Phase 2'], false
from public.rituale r
where r.nr = 1 and r.salon_id = (select id from public.salons where name = 'Dawiid');
```

Ein Verhalten ausblenden: `update public.verhalten set aktiv = false where nr = …;`. Die Umfrage verlangt immer genau die aktiven Verhalten, für jede aktive Teilnehmerin.

**Video-Pflicht:** Mit Video-Link wird die Bewertung erst frei, wenn das Video bis zum Ende gelaufen ist. Das erkennt die Umfrage bei Vimeo-Links und direkten Videodateien (`.mp4`, `.webm`). Bei anderen Links bestätigt die Person selbst. Läuft ein Video nicht, erscheint nach 20 Sekunden ein Ausweg, damit niemand feststeckt.

### Alte Abgaben und der Umstieg

Die bisherigen Abgaben der HTML-Umfrage bekommen ihre Personen-IDs automatisch, sobald eine Person mit **genau demselben Namen** und Salon in `personen` angelegt wird. Die Schreibweise der Namen in `personen` muss also zu den bisherigen Abgaben passen („Oksana Serafyn“).

Die alte HTML-Umfrage läuft parallel weiter, weil `anon` die Funktion `umfrage_einreichen` noch ausführen darf. **Erst wenn** die Plattform-Umfrage mit allen Personen getestet ist und die Inhalte vollständig sind, schaltest du sie ab:

```sql
revoke execute on function public.umfrage_einreichen(jsonb) from anon, authenticated;
```

Danach ist nur noch `umfrage_einreichen_v2` (nur eingeloggt) erreichbar. Der Test `02_umfrage.test.sql` prüft bis dahin bewusst, dass die alte Funktion offen ist. Beim Abschalten die Zeile „Alte HTML-Umfrage“ am Ende der Datei anpassen.

### Wer sieht was in den Auswertungen?

- **Mitarbeiterin:** eigenes Selbstbild und Fremdbild, Kommentare der Kolleginnen **ohne Absender**, das Team nur als Durchschnitt.
- **Verantwortlicher und Admin:** Rangliste, Heatmap, jede Person im Detail, Einzelbewertungen **mit Absender**, Abgabe-Status und das Reminder-Popup.
- Alle Kennzahlen werden in der Datenbank gerechnet (Selbstbild = eigene Note, Fremdbild = Schnitt der Kolleginnen, Differenz = Selbstbild − Fremdbild). Die Schwellen (0,3 / 2,5 / 3,5) stehen in der Tabelle `salons`.

### Wer sieht was?

| Rolle | Rechte |
|---|---|
| `mitarbeiter` | eigene Ergebnisse, Team nur als Schnitt, keine Rohdaten |
| `verantwortlicher` | alles im eigenen Salon, nimmt nicht an der Teamumfrage teil |
| `admin` | alles, salonübergreifend |

Die Rechte stecken in Row Level Security und Datenbank-Funktionen. Die Routen-Sperren im Frontend sind nur Komfort.

## Tests

Die Datenbank ist mit pgTAP getestet (151 Tests): Verknüpfung von Login und Person, Constraints, wer was lesen darf, und die komplette Monatsumfrage (Monate, Fristen, Abgabe, alle Ablehnungsfälle, Nachtragen der Altdaten), die Auswertungen (inklusive Abgleich mit den Views und Anonymität der Kommentare) und der Reminder:

```bash
supabase start && supabase test db
```

## Deploy (Netlify)

- **Weg A:** lokal `npm run build`, dann den Ordner `dist/` per Drag & Drop hochladen. Die `.env` wird beim Bauen eingebacken.
- **Weg B (empfohlen):** Repo mit Netlify verbinden. `netlify.toml` enthält Build-Befehl und Header. Die Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` kommen in die Netlify-Einstellungen.

Die Netlify-Domain danach in den Supabase-Redirect-URLs eintragen (siehe oben).
