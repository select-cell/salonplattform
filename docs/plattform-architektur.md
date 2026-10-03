# Salon-Plattform – Strategie & Architektur

**Stand:** 3. Oktober 2026 · **Salon (Start):** Dawiid · **Zielgruppe dieses Dokuments:** Claude Code als Bauanleitung

---

## 0. Kurzfassung

Wir bauen eine Web-Plattform, auf der

- **Mitarbeiterinnen** sich einloggen, monatlich die Verhaltens-Umfrage ausfüllen und ihre eigenen Ergebnisse sowie die Team-Ergebnisse sehen,
- der **Verantwortliche** (Chef des Salons, nicht Teil des Teams) alle Ergebnisse jeder Mitarbeiterin sieht und erinnert wird, wenn jemand mit der Umfrage überfällig ist,
- der **Admin** (Betreiber der Plattform) alles sieht und die Zugänge in Supabase anlegt.

**Grundsatz:** Alles fußt auf den Antworten in Supabase. Die Plattform speichert jede Einzelantwort und rechnet alle Auswertungen selbst daraus (Selbstbild, Fremdbild, Abweichungen, Verläufe).

**Technik:** React-App (Vite + TypeScript), gehostet auf Netlify. Backend komplett in Supabase: Datenbank, Auth mit Magic Link, Row Level Security und Datenbank-Funktionen.

**Design:** Der Look der bestehenden Dawiid-Umfrage wird übernommen (siehe §7).

---

## 1. Ausgangslage

| Was | Stand |
|---|---|
| Monatsumfrage | Einzelne HTML-Seite (`index.html`, Netlify). Personen, Verhalten, Bewertungskriterien und Rituale stehen fest im `CONFIG`-Objekt. Die Feedbackgeberin wählt ihren Namen aus einer Liste. |
| Speicherung | Supabase-Projekt `hgtvlcucxzksvmvgvbgo`. Schema in `supabase/umfrage_schema.sql`: Tabellen `umfrage_abgaben`, `umfrage_rituale`, `umfrage_bewertungen`. Einreichen über RPC `umfrage_einreichen(payload)` mit anon-Key. Auswertungs-Views `v_*`. |
| Zugriffsschutz | Tabellen per RLS für `anon`/`authenticated` komplett gesperrt. Auswertung bisher nur im Supabase-Dashboard. |
| Daten | Eine Testabgabe. Die Daten der beiden anderen Mitarbeiterinnen folgen. |
| Personen | Oksana Serafyn, Shadi Falapoor, Tuana Aliji, nur als Freitext-Namen. |
| Altes Board | „Salon Performance Dashboard“ (einzelne HTML-Seite, Passwortschutz, Daten aus Google Sheets, Jarvis über n8n-Webhook). Dient nur als Vorlage für Funktionen und Darstellung, **die Altdaten werden nicht übernommen**. Liefert die Vorlage für die Auswertungen (§5.6). |

**Referenzdateien im Repo:**

- `referenz/dashboard-alt.html`: das alte Board. Vorlage für Auswertungs-Bausteine und Jarvis. Es wird nicht 1:1 übernommen: Google Sheets, Passwortschutz und Webhook-URL im Browser fallen weg.
- `referenz/umfrage-dawiid.html`: die bestehende Umfrage (`index.html` aus dem Netlify-Deploy). Sie ist die fachliche und gestalterische Vorlage für die Umfrage in der Plattform:

- Ablauf und Schritte
- Video-Pflicht vor der Bewertung
- aufklappbare Bewertungsstufen 1–5 mit Prozentangaben
- Kommentarpflicht ab Note 4
- Entwicklung des Monats
- Rituale
- Zusammenfassung

---

## 2. Rollen & Rechte

| Rolle | Wer | Nimmt an Teamumfrage teil | Sieht |
|---|---|---|---|
| `mitarbeiter` | Die 3 Mitarbeiterinnen | Ja: Selbstbild und Fremdbild der Kolleginnen | Eigene Ergebnisse (Selbstbild, Fremdbild-Schnitt, Kommentare **ohne** Namen der Absender) und Team-Ergebnisse (nur Schnitte, keine Einzelpersonen) |
| `verantwortlicher` | Chef des Salons („im Heißluftballon“) | **Nein**, wird nicht bewertet und bewertet nicht | Alles im Salon: Team, jede Mitarbeiterin im Detail inkl. Einzelbewertungen, Abgabe-Status, Reminder, später Chef- und Gästeumfrage |
| `admin` | Plattformbetreiber | Nein | Alles (gleiche Sicht wie Verantwortlicher, salonübergreifend). Pflegt Personen und Inhalte in Supabase. |

**Regeln**

- Wer an der Teamumfrage teilnimmt, steuert ein eigenes Feld (`nimmt_an_teamumfrage`), nicht die Rolle. So bleibt es später flexibel.
- Mitarbeiterinnen lesen **niemals** Rohdaten-Tabellen. Sie bekommen Ergebnisse nur über Datenbank-Funktionen, die die Absender-Namen weglassen (§5.3).
- Die Sichtbarkeit für Mitarbeiterinnen ist bewusst in einer Stelle gebündelt (diese Funktionen). Wenn sich die Regel ändert, wird nur dort angepasst.

---

## 3. Seitenstruktur

```
/                         Startseite (öffentlich)
/login                    Login per Magic Link (E-Mail eingeben → Link kommt per Mail)
/auth/callback            Rücksprung aus dem Magic Link → Weiterleitung nach Rolle
/gaeste-umfrage           [Phase 5] Gästeumfrage, öffentlich ohne Login (Link / QR-Code im Salon)

/app                      Begrüßungsbereich (Inhalt je nach Rolle)

── Mitarbeiter ──────────────────────────────────────────────
/app                      Willkommen, Name · Karte „Deine Umfrage für <Monat>“ (offen/erledigt, Frist)
                          · Kurzüberblick eigene Entwicklung · Kacheln zu den Bereichen
/app/umfrage/:monat       Monatsumfrage (Teamumfrage), monat = YYYY-MM
/app/ergebnisse           Eigene Auswertung: Kennzahl-Kacheln, Top/Flop 4, Detailtabelle
                          (Selbstbild | Fremdbild | Rituale, sortierbar), Verlauf, Kommentare
/app/team                 Team-Ergebnisse (Schnitte, ohne Einzelpersonen)
/app/chefumfrage          [Phase 5 · Platzhalter] Chefumfrage ausfüllen, einmal im Quartal
/app/coaching             [Phase 6 · Platzhalter] Jarvis

── Verantwortlicher / Admin ────────────────────────────────
/app                      Willkommen · Reminder-Popup (§6) · Abgabe-Status des laufenden Monats
                          · Kacheln zu den Bereichen
/app/team                 Team-Dashboard: Ansicht-Umschalter Team ↔ Person, Kennzahl-Kacheln,
                          Rangliste, SB-vs.-FB-Diagramm, Differenz pro Person, Top/Flop 4,
                          Heatmap Verhalten × Person, Detailtabelle (Spalte je Person + Ø Team)
/app/mitglieder           Liste der Mitarbeiterinnen (mit Ø FB, Differenz, Abgabe-Status)
/app/mitglieder/:id       Individuelle Auswertung einer Mitarbeiterin: Verlauf über alle Monate,
                          Monats-Tabs, Score + Kommentar je Verhalten, inkl. wer wie bewertet hat
/app/chefumfrage          [Phase 5 · Platzhalter] Ergebnisse Chefumfrage
/app/gaeste               [Phase 5 · Platzhalter] Ergebnisse Gästeumfrage
/app/meine-umfrage        [Phase 5 · Platzhalter] Individueller Link: Umfrage für den Verantwortlichen (Inhalt folgt)
/app/coaching             [Phase 6 · Platzhalter] Jarvis
```

**Abgleich mit dem Mural-Board** (Stand 3. Okt. 2026):

| Mural-Kachel | Rolle | Umsetzung |
|---|---|---|
| Startseite → Login | alle | `/`, `/login` (Magic Link) |
| Individueller Begrüßungsbereich | beide | `/app`, Inhalt je nach Rolle |
| Team-Ergebnisse | Mitarbeiter | `/app/team` (nur Schnitte) |
| Individuelle Auswertungs-Ergebnisse | Mitarbeiter | `/app/ergebnisse` |
| Individueller Link zur monatlichen Umfrage | Mitarbeiter | `/app/umfrage/:monat` |
| Chefumfrage einmal im Quartal | Mitarbeiter | `/app/chefumfrage` (ausfüllen, Phase 5) |
| Eingebetteter Jarvis | Mitarbeiter | `/app/coaching`, nur eigene Daten (Phase 6) |
| Team-Ergebnisse | Verantwortlicher | `/app/team` (volles Team-Dashboard) |
| Individuelle Auswertungs-Ergebnisse von jedem Mitglied | Verantwortlicher | `/app/mitglieder`, `/app/mitglieder/:id` |
| Ergebnisse Chefumfrage | Verantwortlicher | `/app/chefumfrage` (Ergebnisse, Phase 5) |
| Ergebnisse Gästeumfrage | Verantwortlicher | `/app/gaeste` (Phase 5) |
| Reminder, wenn nicht jeder ausgefüllt hat | Verantwortlicher | Popup + Status-Karte in `/app` (§6, Phase 4) |
| Individueller Link Umfrage Verantwortlicher | Verantwortlicher | `/app/meine-umfrage` (Phase 5, Inhalt folgt) |
| Eingebetteter Jarvis | Verantwortlicher | `/app/coaching`, volles Team (Phase 6) |
| Umfragetypen: Team / Chef / Verantwortlicher / Gäste | – | Teamumfrage Phase 2, übrige Phase 5 |
| *(nicht im Board)* Admin | Admin | Sicht wie Verantwortlicher + Pflege in Supabase |

- Platzhalter-Seiten existieren ab Phase 1 als „Kommt bald“-Kacheln, damit die Navigation schon die volle Struktur zeigt.
- Routen werden per Rolle geschützt. Mitarbeiterinnen landen bei `/app/mitglieder/*` auf `/app`.
- Der Schutz im Frontend ist nur Komfort. Die eigentliche Sicherheit liegt in RLS und den Funktionen in Supabase.

---

## 4. Login & Zugänge

### 4.1 Ablauf für den Admin: Person anlegen

1. In Supabase in der Tabelle `personen` eine Zeile anlegen: Name, E-Mail, Rolle, `nimmt_an_teamumfrage`.
2. In Supabase unter **Authentication → Users → Invite user** dieselbe E-Mail einladen.
3. Ein Datenbank-Trigger verknüpft den Auth-Nutzer automatisch über die E-Mail mit der Person (`personen.auth_user_id`).

### 4.2 Login für alle

- Auf `/login` wird die E-Mail eingegeben. Aufgerufen wird `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: <site>/auth/callback } })`.
- `shouldCreateUser: false` sorgt dafür, dass sich niemand selbst registrieren kann. Nur vom Admin angelegte Personen kommen rein.
- Nach dem Klick auf den Link: Session aktiv → `/app`. Die Rolle wird aus `personen` geladen.
- Ist eine Person eingeloggt, aber nicht in `personen` oder `aktiv = false`, erscheint ein Hinweis plus Logout.

### 4.3 Supabase-Einstellungen

- Authentication → URL Configuration: **Site URL** = Netlify-Domain. **Redirect URLs** = Netlify-Domain + `http://localhost:5173` für die Entwicklung.
- Authentication → Providers: E-Mail aktiv, „Allow new users to sign up“ **aus**.
- E-Mail-Vorlage „Magic Link“ auf Deutsch und im Salon-Ton anpassen.
- **Eigener E-Mail-Versand (Custom SMTP) ist Pflicht.** Der eingebaute Supabase-Mailversand ist nur zum Testen gedacht. Er stellt nur an Mitglieder des Supabase-Teams zu und ist auf etwa 2 Mails pro Stunde begrenzt. Ohne eigenen Versand kommen die Magic Links bei den Mitarbeiterinnen nicht an.
  - Empfehlung: Resend (kostenloser Tarif reicht).
  - Absenderdomain verifizieren, dann unter Authentication → Emails → SMTP Settings eintragen.
  - Rate Limit für E-Mails unter Authentication → Rate Limits passend hochsetzen.

---

## 5. Datenmodell (Supabase)

Bestehende Tabellen bleiben erhalten und werden **erweitert**, nicht ersetzt. Alles als nummerierte Migrationen in `supabase/migrations/`.

### 5.1 Neue Tabellen

```sql
-- Salons (vorerst einer, aber von Anfang an mitgeführt)
salons (
  id            uuid pk default gen_random_uuid(),
  name          text not null,            -- 'Dawiid'
  start_monat   date not null,            -- ab diesem Monat zählen Umfragen/Reminder (1. des Monats)
  erstellt_am   timestamptz default now()
)

-- Personen = die Brücke zwischen Login und Fachlichkeit
personen (
  id                    uuid pk default gen_random_uuid(),
  salon_id              uuid references salons,      -- null erlaubt nur bei rolle='admin'
  auth_user_id          uuid unique references auth.users on delete set null,
  name                  text not null,               -- Anzeigename, z. B. 'Oksana Serafyn'
  email                 text not null unique,        -- lower-case
  rolle                 text not null check (rolle in ('mitarbeiter','verantwortlicher','admin')),
  nimmt_an_teamumfrage  boolean not null default false,
  aktiv                 boolean not null default true,
  aktiv_ab              date,                        -- erster Monat, für den die Person abgeben muss
  erstellt_am           timestamptz default now()
)
```

Inhalte der Umfrage wandern aus dem Code in die Datenbank, damit sie ohne Code-Änderung pflegbar sind:

```sql
verhalten (
  id            uuid pk, salon_id uuid references salons,
  nr            smallint not null,           -- Reihenfolge / verhalten_nr
  grundpfeiler  text, saeule text,
  titel         text not null,
  video_url     text,                        -- Vimeo-Player-URL oder .mp4, leer = Platzhalter
  aktiv         boolean default true,
  unique (salon_id, nr)
)

verhalten_kriterien (
  id            uuid pk, verhalten_id uuid references verhalten on delete cascade,
  stufe         smallint not null check (stufe between 1 and 5),
  bezeichnung   text,                        -- '1 – Bewusstsein'
  prozent       text,                        -- '0–25%'
  leitsatz      text,
  punkte        text[] not null default '{}',
  unique (verhalten_id, stufe)
)

rituale (
  id uuid pk, salon_id uuid references salons, nr smallint, titel text not null,
  video_url text, aktiv boolean default true
)

ritual_fragen (
  id uuid pk, ritual_id uuid references rituale on delete cascade,
  nr smallint not null,
  typ text not null check (typ in ('skala','auswahl','text')),
  frage text not null,
  optionen text[],        -- bei 'auswahl'
  labels text[],          -- optionale Skalen-Labels
  pflicht boolean default false
)
```

Die heutigen Inhalte aus `CONFIG.verhalten` und `CONFIG.rituale` der Referenzdatei werden per Seed-Migration (`seed_dawiid_inhalte.sql`) eingespielt. Das sind 20 Verhalten mit Kriterien und 2 Rituale.

### 5.2 Erweiterung der bestehenden Tabellen

```sql
alter table umfrage_abgaben
  add column salon_id          uuid references salons,
  add column feedbackgeber_id  uuid references personen;

-- Bereits vorhanden seit supabase/ausfuelldauer.sql (Okt 2026):
--   gestartet_am      timestamptz  – Start der Umfrage laut Gerät
--   ausfuelldauer_sek integer      – Dauer bis zum Absenden, 60–86400 s, sonst null
--   Ansichten v_abgabe_status (mit ausfuelldauer_min) und v_ausfuelldauer

alter table umfrage_bewertungen
  add column bewertende_person_id uuid references personen,
  add column bewertete_person_id  uuid references personen;
```

- Die Namens-Spalten (`salon`, `feedbackgeber`, `bewertete_person` …) bleiben als **Momentaufnahme** erhalten. Für Auswertungen zählen ab jetzt die IDs.
- Fragetexte und Verhaltenstexte werden wie bisher pro Abgabe mitgespeichert. Alte Auswertungen bleiben dadurch stimmig, auch wenn Texte später geändert werden.
- `rohdaten` bleibt als Sicherung.
- Eindeutigkeit: neu `unique (salon_id, monat, feedbackgeber_id)`.
- **Migration der Testdaten:** Ein Backfill setzt die IDs über den Namensabgleich mit `personen`. Testabgaben dürfen danach gelöscht werden, wenn gewünscht.

### 5.3 Datenbank-Funktionen (die eigentliche Logik)

Alle mit `security definer`, `set search_path = public`. Jede prüft am Anfang die Rolle des Aufrufers über `auth.uid()` → `personen`.

| Funktion | Wer darf | Liefert |
|---|---|---|
| `ich()` | alle eingeloggten | eigene Zeile aus `personen` (id, name, rolle, salon) |
| `umfrage_inhalt()` | alle eingeloggten | aktive Verhalten inkl. Kriterien, Rituale inkl. Fragen, bewertbare Kolleginnen (alle aktiven Teamumfrage-Teilnehmerinnen außer mir) |
| `meine_offenen_monate()` | Teilnehmerinnen | Monate ab `max(start_monat, aktiv_ab)` bis einschließlich laufendem Monat ohne Abgabe, jeweils mit Frist |
| `umfrage_einreichen_v2(payload)` | Teilnehmerinnen | speichert eine Abgabe (siehe unten), gibt `abgabe_id` zurück |
| `meine_ergebnisse(von, bis)` | Teilnehmerinnen | pro Monat × Verhalten: Selbstbild, Fremdbild-Schnitt, Anzahl Fremdbilder, Abweichung; Kommentare zum Fremdbild **ohne Absender**; Säulen- und Grundpfeiler-Schnitte |
| `team_ergebnisse(von, bis)` | alle eingeloggten | pro Monat × Verhalten/Säule: Team-Schnitt Selbstbild, Team-Schnitt Fremdbild, Rituale-Schnitte, Entwicklung des Monats (nur Anzahl Nennungen pro Person) |
| `person_ergebnisse(person_id, von, bis)` | verantwortlicher, admin | wie `meine_ergebnisse`, aber **mit** Absender je Fremdbild und Kommentar |
| `abgabe_status(monat)` | verantwortlicher, admin | pro Teilnehmerin: abgegeben ja/nein, Zeitpunkt |
| `ueberfaellige_abgaben()` | verantwortlicher, admin | Reminder-Liste (§6) |

**`umfrage_einreichen_v2` – Regeln:**

- Der Feedbackgeber kommt aus `auth.uid()`, **nie** aus dem Payload. Dadurch kann niemand im Namen einer anderen Person abgeben.
- `monat` muss in `meine_offenen_monate()` enthalten sein. Keine Zukunft, kein doppeltes Abgeben.
- Bewertete Personen müssen genau die aktiven Teamumfrage-Teilnehmerinnen sein, über ihre IDs. Dazu kommt das eigene Selbstbild.
- Die bestehenden Prüfungen bleiben: Note 1–5, Kommentarpflicht ab Note 4, Entwicklung des Monats nicht an sich selbst.
- Alles in einer Transaktion, wie bisher.

**Grant:** `execute` nur an `authenticated`.

**Alte Funktion:** Die alte `umfrage_einreichen` verliert das `anon`-Recht, sobald die Umfrage in der Plattform live ist (Ende Phase 2). Bis dahin läuft die alte HTML-Umfrage parallel weiter.

### 5.4 Row Level Security

- `personen`: Lesen der eigenen Zeile für alle. Lesen aller Zeilen des eigenen Salons für Verantwortlicher und Admin. Schreiben nur im Supabase-Dashboard.
- `verhalten`, `verhalten_kriterien`, `rituale`, `ritual_fragen`: Lesen für eingeloggte Nutzer des Salons.
- `umfrage_abgaben`, `umfrage_rituale`, `umfrage_bewertungen`: **kein direkter Zugriff** für `authenticated`. Alles läuft über die Funktionen aus §5.3.
- Bestehende Views `v_*` bleiben für die Auswertung im Supabase-Dashboard.

### 5.5 Kennzahlen (Version 1, wird verfeinert)

Rechenbasis für alle Auswertungen. Die Feinheiten zu Selbst- und Fremdbild folgen, sobald alle Daten da sind. Die Berechnungen deshalb an **einer** Stelle halten, also in SQL-Funktionen und nicht im Frontend.

- **Selbstbild** = eigene Note je Verhalten und Monat
- **Fremdbild** = Durchschnitt der Noten der Kolleginnen je Verhalten und Monat
- **Abweichung** = Selbstbild − Fremdbild
  - positiv = man schätzt sich besser ein, als andere einen sehen
  - negativ = man unterschätzt sich
- **Verdichtung** je Säule, Grundpfeiler und gesamt (Durchschnitt der Verhalten)
- **Verlauf** = Veränderung zum Vormonat und Zeitreihe über alle Monate
- **Team-Schnitt** = Durchschnitt über alle Teilnehmerinnen
- **Rituale** = Skalen-Schnitte, häufigste „am wenigsten stabile Phase“
- **Entwicklung des Monats** = Nennungen pro Person
- **Differenz-Einordnung** (aus dem alten Board):
  - |SB − FB| ≤ 0,3 → „Ausgewogen“ (grün)
  - SB − FB > 0,3 → „Selbstüberschätzung“, in der Team-Sicht „SB > FB“ (rot)
  - SB − FB < −0,3 → „Selbstunterschätzung“, in der Team-Sicht „FB > SB“ (rot)
- **Score-Niveau** für Farben in Tabellen und Heatmap: hoch ≥ 3,5 · mittel 2,5–3,5 · niedrig < 2,5
- **Ausfülldauer** = `ausfuelldauer_sek` in Minuten; Team-Ø = Durchschnitt der Personen
- Alle Schwellen (0,3 / 2,5 / 3,5) als Einstellungen in `salons` ablegen, nicht fest im Code.

### 5.6 Auswertungs-Bausteine (übernommen aus dem alten Board)

Alle Bausteine beziehen sich auf einen **gewählten Monat** (Monatsauswahl oben auf jeder Auswertungsseite, Standard: letzter abgeschlossener Monat). Der Verlauf zeigt alle Monate.

| Baustein | Inhalt | Mitarbeiterin (`/app/ergebnisse`, `/app/team`) | Verantwortlicher / Admin |
|---|---|---|---|
| **Ansicht-Umschalter** | Tabs „Team“ + je Mitarbeiterin; alle Bausteine darunter passen sich an | – | ✓ |
| **Kennzahl-Kacheln** | Ø Selbstbild · Ø Fremdbild · Differenz mit Einordnung · Ø Ausfülldauer | ✓ eigene Werte; Team-Kacheln nur mit Schnitten | ✓ Team oder Person |
| **Rangliste** | Mitarbeiterinnen nach Ø Fremdbild, Platz 1–3 hervorgehoben, gewählte Person markiert | – | ✓ |
| **Selbstbild vs. Fremdbild** | Gruppiertes Balkendiagramm (Kupfer = SB, Blau = FB); Team-Sicht: je Person, Personen-Sicht: je Säule | ✓ eigene, je Säule | ✓ |
| **Differenz pro Person** | Balken SB − FB je Person, grün/rot nach Einordnung | – | ✓ (Team-Sicht) |
| **Top 4 / Flop 4 Verhalten** | Höchste und niedrigste Verhalten nach Ø Fremdbild, mit Säule | ✓ eigene + Team | ✓ Team oder Person |
| **Heatmap (Segmentanalyse)** | Matrix Verhalten × Mitarbeiterin im Fremdbild, Farbe nach Score-Niveau, Zeilen nach Säule gruppiert | – | ✓ |
| **Detailtabelle** | Tabs Selbstbild / Fremdbild / Rituale. Team-Sicht: Spalte je Person + Ø Team. Personen-Sicht: SB · FB · Differenz. Sortierung „Standard“ (nach Säulen gruppiert) / „Höchste“ / „Niedrigste“ (ohne Gruppierung) | ✓ Personen-Sicht (eigene) | ✓ beide Sichten |
| **Verlauf** | Liniendiagramm Ø SB, Ø FB, Ø Rituale über alle Monate | ✓ eigener | ✓ je Person und Team |
| **Monats-Detail** | Monats-Tabs; je Verhalten Score + Kommentar(e) | ✓ Kommentare ohne Absender | ✓ mit Absender |

Datenbasis: Die Funktionen aus §5.3 liefern die Zahlen. Ergänzend:

- `team_dashboard(monat)` (verantwortlicher, admin): je Person Ø SB, Ø FB, Differenz, Ausfülldauer, Rang sowie die Matrix Verhalten × Person (für Heatmap und Detailtabelle) in **einem** Aufruf
- `meine_ergebnisse` und `person_ergebnisse` liefern zusätzlich die Ausfülldauer und die Monatsliste für den Verlauf

Diagramme mit Recharts, Farben wie im alten Board: SB `#C4845A`, FB `#4A7FA5`, Rituale `#4CAF50`.

---

## 6. Abgabefrist & Reminder

- Die Umfrage für Monat **M** bewertet Monat M und ist **bis zum letzten Tag von M** auszufüllen (Europe/Berlin).
- Nach der Frist kann weiterhin nachträglich für M abgegeben werden. Die Abgabe gilt dann als verspätet.
- **Überfällig** heißt: Für eine aktive Teilnehmerin fehlt die Abgabe für M, und heute ist mindestens 3 Tage nach Fristende.
  - Beispiel: Frist Oktober = 31.10. → Reminder ab **4. November**.
  - Die 3 Tage stehen als Einstellung (`reminder_tage_nach_frist`, Standard 3) in `salons`.
- `ueberfaellige_abgaben()` liefert je Teilnehmerin und offenem Monat: Name, Monat, Tage überfällig. Berechnet wird live beim Abruf, ein täglicher Job ist nicht nötig.
- **Anzeige:** Beim Öffnen von `/app` erscheint für Verantwortliche und Admin ein **Popup**, wenn die Liste nicht leer ist. Zum Beispiel: „Shadi Falapoor hat die Umfrage für Oktober noch nicht abgegeben (5 Tage überfällig).“
  - Das Popup lässt sich wegklicken und kommt beim nächsten Besuch wieder, solange noch etwas offen ist.
  - Zusätzlich gibt es eine dauerhafte Status-Karte im Dashboard.
- **Mitarbeiterinnen** sehen im eigenen Begrüßungsbereich die offene Umfrage mit Frist. Ist sie überfällig, ist sie farblich hervorgehoben.
- **Später optional:** tägliche E-Mail an den Verantwortlichen über `pg_cron` + Edge Function + Resend. Nicht Teil der ersten Version.

---

## 7. Frontend

### 7.1 Technik

- **Vite + React + TypeScript**, React Router, `@supabase/supabase-js`
- Charts: Recharts
- Kein UI-Framework. Eigenes, schlankes CSS mit den Design-Tokens aus der Referenzdatei.
- Konfiguration über `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Niemals den `service_role`-Key ins Frontend.
- Datenzugriff gebündelt in `src/lib/api.ts`, als dünne Wrapper um `supabase.rpc(...)`.

### 7.2 Design (aus der Dawiid-Umfrage übernehmen)

```css
--cream:#FAF8F3; --cream-mid:#F0EBE0; --cream-deep:#E2D9C8;
--accent:#C4845A; --accent-h:#A86840;
--text:#1A1208; --text2:#6B5B45; --muted:#9B8E7E;
--green:#3B6D11; --gbg:#EAF3DE; --red:#A32D2D; --rbg:#FCEBEB;
--yel:#854F0B; --ybg:#FAEEDA; --fb:#4A7FA5;
Schriften: DM Serif Display (Überschriften), DM Sans (Text)
Radien 8/12/16/20px, weicher Schatten, Karten auf Creme-Hintergrund
```

- Farbcode Selbstbild = Akzent (Kupfer), Fremdbild = Blau (`--fb`), wie in der Umfrage.
- Mobil zuerst: Die Mitarbeiterinnen nutzen die Plattform vor allem am Handy.

### 7.3 Umfrage in der Plattform

Fachlich 1:1 wie die Referenzdatei. Unterschiede:

- **Keine Namensauswahl** mehr. Die Feedbackgeberin ist die eingeloggte Person.
- Inhalte kommen aus `umfrage_inhalt()` statt aus `CONFIG`.
- Monat kommt aus der Route und wird angezeigt („Umfrage Oktober 2026“).
- Einreichen über `umfrage_einreichen_v2`.
- **Ausfülldauer:** Beim Öffnen der Umfrage wird der Startzeitpunkt festgehalten und mitgeschickt (`gestartet_am`). Die Funktion berechnet daraus `ausfuelldauer_sek`. Unplausible Werte (unter 1 Minute oder über 24 Stunden, z. B. Umfrage über Nacht offen) werden als `null` gespeichert und fließen nicht in die Schnitte ein.
- Zwischenstand optional in `localStorage` sichern, damit beim versehentlichen Schließen nichts verloren geht.

### 7.4 Ordnerstruktur

```
/
├─ referenz/
│  ├─ umfrage-dawiid.html            bestehende Umfrage (Vorlage)
│  └─ dashboard-alt.html             altes Board (Vorlage Auswertungen + Jarvis)
├─ supabase/
│  ├─ umfrage_schema.sql             bestehend (Ausgangsstand)
│  ├─ ausfuelldauer.sql              bestehend (Ergänzung Ausfülldauer, bereits ausgeführt)
│  └─ migrations/                    001_salons_personen.sql, 002_inhalte.sql, …
├─ src/
│  ├─ lib/ (supabase.ts, api.ts, monat.ts)
│  ├─ auth/ (AuthProvider, RequireRole)
│  ├─ pages/ (Start, Login, Callback, app/…)
│  ├─ components/ (Layout, Karte, Popup, Charts, Umfrage/…)
│  └─ styles/ (tokens.css, base.css)
├─ public/_redirects                 „/*  /index.html  200“ für Netlify (SPA-Routing)
└─ README.md                         Setup, Deploy, Person anlegen
```

### 7.5 Deploy (Netlify)

- **Weg A, wie bisher:** lokal `npm run build`, dann den Ordner `dist/` per Drag & Drop auf Netlify hochladen. Die `.env` wird dabei beim Bauen eingebacken.
- **Weg B, empfohlen für später:** Git-Repo mit Netlify verbinden. Dann wird bei jedem Push automatisch gebaut, und die Env-Variablen stehen in den Netlify-Einstellungen.
- In beiden Fällen: Netlify-Domain in den Supabase Redirect URLs eintragen (§4.3).

---

## 8. Bauphasen

Jede Phase ist für sich nutzbar und wird vor der nächsten getestet.

### Phase 1 – Fundament
- Vite-Projekt, Design-Tokens, Layout, Startseite
- Migration: `salons`, `personen`, Trigger zur Verknüpfung mit `auth.users`, RLS, `ich()`
- Custom SMTP (Resend) in Supabase einrichten (§4.3)
- Login per Magic Link, Callback, Rollen-Routing, geschützte Routen
- Begrüßungsbereiche für Mitarbeiter und Verantwortlichen mit Kacheln, alle Zielseiten zunächst als Platzhalter
- **Fertig, wenn:** Admin legt 3 Mitarbeiterinnen und 1 Verantwortlichen an, alle loggen sich per Magic Link ein und landen im passenden Bereich.

### Phase 2 – Monatsumfrage in der Plattform
- Migration: Inhalts-Tabellen + Seed aus der Referenzdatei; Erweiterung der Abgabe-Tabellen um IDs; Backfill der Testdaten
- Funktionen `umfrage_inhalt()`, `meine_offenen_monate()`, `umfrage_einreichen_v2()`
- Umfrage-Seite als Port der Referenzdatei
- Karte „Deine Umfrage für <Monat>“ im Mitarbeiter-Dashboard
- Danach: `anon`-Recht auf alter Funktion entziehen, alte HTML-Umfrage abschalten
- **Fertig, wenn:** Eine Mitarbeiterin füllt eingeloggt die Umfrage aus, alles landet mit IDs in der Datenbank, und eine zweite Abgabe für denselben Monat wird abgelehnt.

### Phase 3 – Auswertungen
- Funktionen `meine_ergebnisse`, `team_ergebnisse`, `person_ergebnisse`, `team_dashboard`
- Seiten `/app/ergebnisse`, `/app/team`, `/app/mitglieder`, `/app/mitglieder/:id`
- Alle Bausteine aus §5.6, in dieser Reihenfolge bauen:
  1. Monatsauswahl, Kennzahl-Kacheln, Detailtabelle mit Tabs und Sortierung
  2. SB-vs.-FB-Diagramm, Differenz pro Person, Top/Flop 4
  3. Rangliste, Heatmap, Ansicht-Umschalter Team ↔ Person
  4. Verlauf und Monats-Detail mit Kommentaren
- **Fertig, wenn:**
  - Eine Mitarbeiterin sieht ihre Ergebnisse ohne Absender-Namen und das Team nur als Schnitt.
  - Der Verantwortliche sieht alles im Detail.
  - Die Zahlen stimmen mit den Views `v_selbst_vs_fremdbild` und `v_person_saeule` überein.

### Phase 4 – Abgabe-Status & Reminder
- `abgabe_status()`, `ueberfaellige_abgaben()`, Einstellung `reminder_tage_nach_frist`
- Popup und Status-Karte im Verantwortlichen-Dashboard
- **Fertig, wenn:** Bei fehlender Abgabe erscheint ab Tag 3 nach Fristende das Popup. Testen mit simuliertem Datum über einen Parameter in der Funktion.

### Phase 5 – Weitere Umfragetypen (Inhalte folgen)
- **Chefumfrage:** Die Mitarbeiterinnen bewerten den Verantwortlichen einmal im Quartal. Die Ergebnisse sieht nur der Verantwortliche bzw. der Admin.
- **Gästeumfrage:** öffentlicher Link oder QR-Code ohne Login, Spam-Schutz über eine Rate-Limit-Funktion. Ergebnisse nur für Verantwortlichen und Admin.
- **Umfrage für den Verantwortlichen:** Inhalt wird nachgereicht.
- Datenmodell: Tabellen nach demselben Muster (Abgabe → Antworten) mit Spalte `umfrage_typ` und `zeitraum` (Monat oder Quartal). Die Details werden geplant, sobald die Fragen feststehen.

### Phase 6 – Jarvis (die Kirsche auf der Torte)
Vorbild ist der Jarvis aus dem alten Board, aber sicher umgebaut.

**Oberfläche** (wie im alten Board):
- schwebender Button unten rechts, öffnet ein Chatfenster
- Status „Bereit“ / „Denkt nach…“, Tipp-Animation
- Badge bei neuer Antwort, während das Fenster geschlossen ist
- Chatverlauf innerhalb der Sitzung

**Ablauf:**
- Frontend → Supabase Edge Function `jarvis` → n8n-Webhook → Antwort zurück.
- Die **Webhook-URL** liegt als Secret in der Edge Function. Sie steht nicht mehr im Browser und ist nicht mehr per Zahnrad einstellbar.
- Die Edge Function baut den **Kontext** serverseitig aus den Ergebnis-Funktionen, mit der Session des Nutzers. Jarvis bekommt dadurch ausschließlich, was die Person ohnehin sehen darf:
  - **Mitarbeiterin:** nur eigene Ergebnisse (SB, FB, Differenz, Top/Flop 5, Verlauf, Kommentare ohne Absender, Ausfülldauer) plus Team-Schnitte
  - **Verantwortlicher / Admin:** der volle Kontext wie im alten Board, mit `meta` (Skala, Datenstart, Verhaltens-Liste), `overview` (Monat, Rangliste, Team-Schnitte, Ausfülldauern), `personSummaries` (je Person SB/FB/Differenz, alle Verhalten, Top/Flop 5) und `personDetail` (je Monat Schnitt, Einzelwerte, Kommentare)
  - zusätzlich die aktuelle Ansicht (welche Seite, welche Person, welcher Monat), damit Jarvis weiß, worüber gerade gesprochen wird
- Format an n8n wie bisher: `{ message, context }`. Antwort aus `output` / `message` / `text`. Der bestehende n8n-Workflow kann so weiterverwendet werden.

---

## 9. Offene Punkte

| # | Punkt | Wann zu klären |
|---|---|---|
| 1 | Feinheiten der Selbst-/Fremdbild-Auswertung (Gewichtung, Schwellen, Hervorhebungen) | wenn alle 3 Testabgaben da sind, vor Phase 3 |
| 2 | **Fragetexte:** Rituale und „Entwicklung des Monats“ sprechen vom „vergangenen/letzten Monat“. Mit der Frist „bis Ende des Monats“ wird aber der laufende Monat bewertet. Texte auf „in diesem Monat“ anpassen? | vor Phase 2 |
| 3 | Ab welchem Monat zählt die Plattform (`salons.start_monat`)? | vor Phase 2 |
| 4 | Sichtbarkeit für Mitarbeiterinnen ggf. anpassen (z. B. Absender sichtbar oder nicht) | jederzeit, betrifft nur die Funktionen aus §5.3 |
| 5 | Inhalte Chefumfrage, Gästeumfrage, Umfrage für den Verantwortlichen | vor Phase 5 |
| 6 | Tägliche E-Mail zusätzlich zum Popup? | optional, nach Phase 4 |
| 7 | Sieht die Mitarbeiterin ihren eigenen Rang in der Rangliste? Aktuell nein, die Rangliste ist nur für Verantwortlichen und Admin. | jederzeit |
| 8 | Den bestehenden n8n-Workflow für Jarvis prüfen: Erwartet er das Kontext-Format des alten Boards? | vor Phase 6 |

---

## 10. Arbeitsweise mit Claude Code

### 10.1 Vorbereitung (Checkliste vor Phase 1)

- [ ] Projektordner / Repo mit:
  - `docs/plattform-architektur.md` (dieses Dokument)
  - `referenz/umfrage-dawiid.html` (aktuelle Umfrage inkl. Ausfülldauer)
  - `referenz/dashboard-alt.html` (altes Board)
  - `supabase/umfrage_schema.sql` und `supabase/ausfuelldauer.sql`
- [ ] Supabase-URL und anon-Key bereit (für `.env`). Den **service_role-Key nie** an Claude Code geben oder ins Frontend schreiben.
- [ ] Resend-Konto angelegt, Absenderdomain verifiziert (für Custom SMTP, §4.3)
- [ ] E-Mail-Adressen aller Personen: 3 Mitarbeiterinnen, Verantwortlicher, Admin
- [ ] Netlify-Domain bekannt (für Site URL / Redirect URLs, §4.3)
- [ ] Node.js (LTS) lokal installiert, damit `npm run build` läuft

### 10.2 Ablauf

1. Repo wie in 10.1 vorbereiten.
2. Claude Code phasenweise beauftragen, z. B.: „Setze Phase 1 aus docs/plattform-architektur.md um.“
3. SQL-Migrationen im Supabase SQL-Editor ausführen (in Reihenfolge) und im Repo versionieren.
4. Nach jeder Phase die „Fertig, wenn“-Kriterien durchtesten, dann deployen.
