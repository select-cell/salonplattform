# Salon-Anfragesystem "Jetzt anfordern"

Ursprünglich die Master-MD, jetzt die Beschreibung des Systems im Repo. Abschnitt 0 sagt, was davon wie umgesetzt ist und wo es vom Master abweicht. Die übrigen Abschnitte sind der Master, an den betroffenen Stellen angepasst.

## 0. Umsetzung im Repo (Stand 24. Oktober 2026)

Das System läuft **im selben Repo und im selben Supabase-Projekt** wie die Team-Plattform. Gründe: Die Gästeumfrage ist dort schon als Phase 5 eingeplant (öffentlicher Link ohne Login, Ergebnisse unter `/app/gaeste`), Domain, Design, Nachtmodus und Rollen sind vorhanden, und die Auswertungen für den Verantwortlichen können im bestehenden Login-Bereich entstehen.

| Teil | Wo | Stand |
|---|---|---|
| Datenbank | `supabase/migrations/20261024193000_bestellsystem.sql`, Tests in `supabase/tests/database/04_bestellsystem.test.sql` | geschrieben und lokal getestet, **noch nicht in Supabase** (läuft nach dem Merge über die GitHub-Integration) |
| Gäste-Seite | `src/pages/Bestellen.tsx`, `src/components/bestellung/`, `src/lib/bestellung.ts`, `src/lib/bestellApi.ts`, `src/styles/bestellung.css` | fertig, im Browser gegen ein simuliertes Backend getestet |
| QR-Codes | `tools/qr-codes/` (eigene `package.json`) | fertig, Lesbarkeit mit einem unabhängigen Dekoder geprüft; **erst mit der endgültigen Domain erzeugen** |
| n8n | `n8n/README.md`, Code-Node `n8n/anfrage-entscheiden.cjs` mit 47 Tests | Anleitung und getestete Logik; **der Workflow selbst ist in n8n noch zu bauen** |

**Entscheidungen und Abweichungen vom Master**

- **Service-Key in n8n** ist bewusst akzeptiert (Supabase-Node, Key nur als n8n-Credential). Er öffnet das ganze Projekt, auch die Mitarbeiter-Auswertungen. Deshalb ein eigener Secret-Key nur für n8n, der sich einzeln widerrufen lässt. **Neu bewerten**, sobald jemand anderes Workflows in n8n bearbeiten darf oder Jarvis (Phase 6) dazukommt: Dann eine eigene Datenbank-Rolle nur für die vier Bestell-Tabellen und der Postgres-Node statt des Supabase-Nodes.
- **`salon_id`** an `plaetze` und `artikel`, wie überall in der Plattform. `platz` bleibt der Schlüssel, weil er im QR-Link steht. Das gilt je Domain; teilen sich mehrere Salons eine Domain, muss der Schlüssel erweitert werden.
- **Frontend in React** (wie die Plattform) statt reinem HTML. Die Gäste-Seite ist ein eigener, nachgeladener Chunk (rund 3 KB gzip), die Plattform lädt davon nichts mit. Insgesamt lädt ein Gast rund 160 KB JavaScript (gzip), das meiste davon React und der Supabase-Client.
- **Design:** keine zweite Farbpalette. Die Hex-Werte aus dem Master (§5a) sind durch die Tokens der Plattform ersetzt, Hell und Nachtmodus kommen von dort.
- **Routing:** `/p/:platz` ist eine Route der App, der vorhandene Netlify-Fallback genügt.
- **Webhook:** Die Erfolgsantwort enthält zusätzlich `sperre_sekunden`, damit der Zähler im Frontend zur n8n-Einstellung passt. Sperre antwortet mit Status 200 und `ok: false`.
- **Doppelung wird vor der Sperre geprüft:** Kam die Antwort auf eine erste Anfrage nie an, sieht der Gast beim Wiederholen die Bestätigung statt „gesperrt“.
- **Notkarte in n8n:** Fällt Supabase aus, gelten Artikel und Plätze aus dem Code-Node, damit die Nachricht trotzdem rausgeht. Sie muss zur Notkarte im Frontend passen.
- **Fehler-Workflow:** Supabase-Nodes mit „Continue On Fail“ lösen ihn nicht aus. Ein Code-Node am Ende des Speicher-Zweigs wirft deshalb den Fehler, nachdem die Telegram-Nachricht schon raus ist.
- `anfragen` und `anfrage_positionen` bleiben für Frontend und eingeloggte Nutzer gesperrt. Auswertungen dafür kommen später über Datenbank-Funktionen für Verantwortliche und Admin.

## 1. Ziel

Gäste im Friseursalon fordern während ihres Besuchs etwas an (z. B. Wasser, Apfelschorle), ohne etwas sagen zu müssen. Sie scannen den QR-Code an ihrem Platz, wählen aus und senden einmal ab.
Die Anfrage landet als Nachricht in einer Telegram-Gruppe, die das Team über iPhone und Apple Watch erhält.

**Kein Kauf:** Es gibt keine Preise, keine Summe und keine Zahlung. Der Gast fordert nur an. Merch (echter Kauf) ist später ein eigenes Modul.

**Wichtigste Regel:** Alle Daten gehen an denselben n8n-Webhook, und dieser ist universell mit dem Telegram-Bot verbunden. Neue Funktionen sind später nur neue Zweige oder neue Artikel, keine neue Anbindung.

## 2. Architektur

```
QR-Code (pro Platz) → Frontend (Netlify) → n8n-Webhook → Telegram-Bot → Team-Gruppe → Apple Watches
                                                      ↘ Supabase (speichern)
```

| Baustein | Aufgabe |
|---|---|
| Frontend | Anfrageseite mit Auswahl, liest die Platznummer aus der URL |
| n8n | Ein Webhook: Validierung, Sperre, Speichern, Nachricht bauen, an Telegram senden |
| Supabase | Speisekarte und gespeicherte Anfragen (anonym) |
| Telegram-Bot | Postet die Nachricht in die Team-Gruppe |

Das Frontend schickt Anfragen **nur** an den n8n-Webhook. Zusätzlich liest es die Speisekarte (Tabellen `artikel` und `plaetze`) rein lesend aus Supabase mit dem öffentlichen Anon-Key. Telegram wird nie vom Frontend angesprochen.

**Priorität:** Die Telegram-Nachricht an das Team ist das Wichtigste. Fällt Supabase aus, muss die Nachricht trotzdem rausgehen. Dafür teilt sich der n8n-Workflow nach dem Edit-Fields-Node in einen Telegram-Zweig und einen Speicher-Zweig (siehe Abschnitt 7).

## 3. Umfang Phase 1

**Enthalten:**
- 7 Plätze (Platz 1 bis 7)
- Artikel: Wasser, Apfelschorle
- Auswahl im Stil von Burger King: Artikel auswählen, Menge anpassen, alles zusammenfassen, einmal abschicken
- Anfrage per Webhook → Telegram + Supabase
- Anonym, ohne Login, ohne Mitgliedsdaten

**Nicht enthalten (bewusst raus):**
- NFC-Tags (nur QR-Codes)
- Mitglieder, Login, Präferenzen
- iMessage-Anbindung
- Stimmungs- oder Gesundheitsabfragen
- Preise, Zahlung, Merch
- Weitere Artikel und Module (siehe Roadmap)

## 4. Platznummer über URL

Jeder Platz hat einen eigenen, kurzen Link:

```
https://<DOMAIN>/p/1
...
https://<DOMAIN>/p/7
```

- Das Frontend liest die Platznummer aus dem Pfad. Zusätzlich funktioniert `?platz=N` als Fallback. Der Gast tippt nichts ein.
- Routing: `/p/:platz` ist eine Route der React-App. Der vorhandene Netlify-Fallback `/*  /index.html  200` genügt, eine zusätzliche Zeile in `_redirects` ist nicht nötig.
- Gültig sind nur Plätze aus der Tabelle `plaetze`. Sonst Hinweis: "Bitte scanne den QR-Code an deinem Platz erneut."
- **Platznummer groß** oben auf der Seite und in der Bestätigung anzeigen ("Platz 4"), damit der Gast einen falschen QR-Code sofort bemerkt.
- QR-Codes: `tools/qr-codes` erzeugt für alle Plätze je ein Bild (SVG und PNG, 70 × 90 mm, 600 dpi), mit „Platz N“ beschriftet, Fehlerkorrektur Stufe H und 4 Modulen Rand, damit der Code auch laminiert zuverlässig scannt. Der Code ist rund 4 cm groß (empfohlen: mindestens ca. 3 cm). Aufruf und Hinweise: `tools/qr-codes/README.md`.
- QR-Codes erst mit der finalen Domain erzeugen und drucken, nicht mit der `netlify.app`-Adresse.

## 5. Frontend

**Technik:** Teil der React-Plattform (Vite, TypeScript), Hosting auf Netlify. Die Gäste-Seite ist ein eigener, nachgeladener Chunk mit eigenem Rahmen (ohne „Anmelden“ und ohne Link in den Mitarbeiterbereich), keine zusätzlichen Bibliotheken.

**Verhalten:**
- Mobile-first, Sprache Deutsch, schlicht und schnell.
- Artikelliste mit Plus/Minus-Buttons pro Artikel, Mengen 1 bis 10.
- Feste untere Leiste mit Zusammenfassung (z. B. "3 Artikel") und Button zur Auswahl.
- Ansicht "Deine Auswahl": alle Positionen mit Menge, änderbar oder entfernbar. Keine Preise.
- Hauptbutton (Text als Konstante, Standard: **"Jetzt anfordern"**) sendet die gesamte Anfrage einmalig ab.
- Pro Anfrage erzeugt das Frontend eine eindeutige `anfrage_id` (UUID), die mit abgeschickt wird. Dieselbe ID wird bei Wiederholungen (Netzwerkfehler, Doppelklick) wiederverwendet.
- Nach dem Klick: Button sperren (kein Doppelklick). Dann Bestätigung: "Platz N: Dein Team ist informiert, es kommt gleich jemand vorbei. Für Änderungen sprich kurz das Team an."
- Neue Anfrage erst nach Ablauf der Sperrzeit möglich (Zähler sichtbar).
- Bei Sperre: freundliche Meldung (z. B. "Deine letzte Anfrage ist gerade angekommen. Bitte einen Moment warten.").
- **Timeout** beim Absenden nach ca. 10 Sekunden, dann Meldung: "Das hat gerade nicht geklappt. Bitte sprich kurz das Team an."
- **Notkarte:** Die Artikelliste wird beim Laden aus der Supabase-Tabelle `artikel` gelesen (nur `aktiv = true`, sortiert nach `sortierung`). Antwortet Supabase nicht, nutzt das Frontend eine fest hinterlegte Karte mit Wasser und Apfelschorle.
- Gleiche Artikel werden im Frontend zu einer Position mit Gesamtmenge zusammengefasst.
- Keine Cookies, kein Tracking, keine personenbezogenen Daten.

Artikel Phase 1 (Startdaten, siehe Abschnitt 9):

| ID | Name |
|---|---|
| `wasser` | Wasser |
| `apfelschorle` | Apfelschorle |

## 5a. Design: Farben, Dark- und Light-Mode

Die Gäste-Seite nutzt die Design-Tokens der Plattform (`src/styles/tokens.css`) und damit deren Hell- und Nachtmodus: Beim ersten Laden gilt die Systemeinstellung, der Umschalter (Halbkreis-Symbol) setzt `data-theme` am `html`-Element, die Wahl liegt nur im Browser (`localStorage`, in try/catch, die Seite funktioniert auch ohne). Die Hex-Werte aus dem ursprünglichen Master (geschätzt aus Screenshots einer anderen Seite) sind nicht übernommen, es gibt dadurch nur eine Quelle für Farben.

Übernommen aus dem Master: Serifenschrift für Überschriften mit einem kursiven Akzentwort (`--link`), DM Sans für Text, Karten mit großen Radien und 1-px-Rand, hervorgehobene Karte mit Verlauf (`--hero-von` nach `--hero-bis`) für gewählte Artikel, gefüllter Hauptbutton mit Pfeil, Pillen für „Platz N“ und den Sperr-Zähler.

Das Salon-Logo im Kopf ist das der Plattform (`src/assets/logo-dawiid.png`).

## 6. Webhook-Vertrag

**Methode:** POST, JSON. Eine einzige URL für alle Anfragen.

```json
{
  "anfrage_id": "0b9a6f0e-3c1d-4e0a-9f55-2a1c7d8e4b10",
  "typ": "anfrage",
  "platz": 4,
  "positionen": [
    { "artikel": "wasser", "menge": 2 },
    { "artikel": "apfelschorle", "menge": 1 }
  ]
}
```

- `anfrage_id`: vom Frontend erzeugte UUID, pro Anfrage einmalig (Schutz vor Doppelungen).
- `typ`: Phase 1 nur `anfrage`. Getränke, Decke und Essen sind **Kategorien der Artikel** und lassen sich in einer Anfrage mischen. Eigene Typen gibt es nur für Aktionen ohne Artikel (z. B. später `beratung`).
- Antwort bei Erfolg: `{ "ok": true, "sperre_sekunden": 60 }` (das zweite Feld ist optional, das Frontend nimmt sonst 60). Bei Sperre: `{ "ok": false, "grund": "gesperrt", "warte_sekunden": 42 }` mit Status 200. Bei ungültigen Anfragen: `{ "ok": false, "grund": "..." }` mit Status 400. Das Frontend wertet den Inhalt aus, nicht den Status.
- Die Webhook-URL steht in einer Umgebungsvariable des Frontends (Test- und Produktions-URL trennen).

## 7. n8n-Workflow

> **Umsetzung:** Node für Node steht in `n8n/README.md`. Schritte 2 bis 5 (Validierung, Prüfung gegen die Karte, Sperre, Doppelung, Nachrichtentext) sind als getesteter Code-Node in `n8n/anfrage-entscheiden.cjs` vorbereitet. Abweichend vom Master wird die **Doppelung vor der Sperre** geprüft, und die Abfragen laufen vor der Entscheidung, damit bei einem Supabase-Ausfall die Notkarte greift.

1. **Webhook** (POST), CORS: Allowed Origins auf die Domain des Frontends (zum Testen `*`)
2. **Validierung**: `anfrage_id` ist eine UUID, `platz` existiert und ist aktiv, `typ` bekannt, `positionen` nicht leer, Mengen ganze Zahlen von 1 bis 10, Artikel-IDs existieren und sind aktiv. Gleiche Artikel in mehreren Positionen werden zu einer zusammengeführt (Mengen addiert, Summe maximal 10).
3. **Vorabprüfung in Supabase** (Continue On Fail):
   - **Sperre pro Platz**: Existiert für diesen Platz innerhalb der letzten `SPERRE_SEKUNDEN` (Variable, Standard 60) eine Anfrage in `anfragen`? Wenn ja, mit `grund: "gesperrt"` ablehnen.
   - **Duplikat**: Existiert die `anfrage_id` schon? Wenn ja, mit `{ "ok": true }` antworten und keine zweite Nachricht senden.
   - Antwortet Supabase nicht, werden beide Prüfungen übersprungen und die Anfrage läuft trotzdem weiter.
4. **Switch** nach `typ`, Phase 1 nur der Zweig `anfrage`
5. **Edit Fields** (bei Bedarf mit Code-Node): Nachrichtentext bauen und die Daten für beide Zweige vorbereiten (Artikelnamen aus `artikel`, bei Supabase-Ausfall aus der fest hinterlegten Notkarte)
6. **Aufspaltung in zwei parallele Zweige** direkt nach dem Edit-Fields-Node:
   - **Zweig Telegram** (oberer Ausgang): **Telegram-Node** (Send Message) an die Anfragen-Gruppe, danach **Respond to Webhook** mit `{ "ok": true }`
   - **Zweig Speichern** (unterer Ausgang): **Supabase** Zeile in `anfragen` anlegen (Primärschlüssel = `anfrage_id`), danach Positionen in `anfrage_positionen` eintragen

Dadurch geht die Telegram-Nachricht immer raus, auch wenn das Speichern in Supabase fehlschlägt.

**Wichtig für die Umsetzung:**
- n8n arbeitet parallele Zweige nacheinander ab (Execution Order v1, der obere Zweig zuerst). Den Telegram-Zweig deshalb **oben** anordnen.
- Bei allen Supabase-Nodes **Continue On Fail** aktivieren, damit ein Fehler dort nie den Ablauf stoppt.
- Der Duplikat-Schutz greift, solange Supabase erreichbar ist. Doppelte Datenbankzeilen verhindert der Primärschlüssel in jedem Fall.

Der Telegram-Node ist derselbe für alle Typen. Nur der Edit-Fields- bzw. Code-Node pro Zweig baut den Text anders.

**Fehlerbehandlung:** Ein eigener Fehler-Workflow (Error Trigger) schickt dir bei jedem Fehlschlag eine Telegram-Nachricht in einen separaten Admin-Chat, nicht in die Team-Gruppe.

## 8. Telegram

- Ein Bot (über @BotFather angelegt), Bot-Token nur als n8n-Credential, **nie im Frontend**.
- **Eigene Gruppe nur für Anfragen** (nicht der normale Team-Chat), damit nichts untergeht. Bot und alle Teammitglieder sind Mitglied, jede Person nutzt den eigenen Telegram-Account.
- Chat-ID der Gruppe (negative Zahl) wird im Telegram-Node eingetragen. Wird die Gruppe zur Supergruppe, ändert sich die ID auf `-100...`.
- Telegram-Mitteilungen müssen auf jedem iPhone für die Watch aktiviert sein, die Gruppe darf nicht stummgeschaltet sein.

**Nachrichtenformat (Phase 1):**

```
Platz 4: 2× Wasser, 1× Apfelschorle
```

Sobald mehrere Kategorien gemischt werden, gruppiert die Nachricht zeilenweise nach Kategorie:

```
Platz 4 wünscht:
Getränke: 2× Wasser, 1× Apfelschorle
Decke: 1× Decke
```

**Erledigt-Markierung:** Das Team reagiert in der Gruppe mit einem 👍 auf die Nachricht, sobald sich jemand kümmert. Kein Button, keine Statuslogik im System.

## 9. Supabase

Vier Tabellen:

| Tabelle | Zweck | Wer greift zu |
|---|---|---|
| `plaetze` | Welche Plätze es gibt (1 bis 7) | Frontend liest, n8n prüft |
| `artikel` | Speisekarte (Wasser, Apfelschorle, später mehr) | Frontend liest, n8n prüft |
| `anfragen` | Eine Zeile pro abgeschickter Anfrage | nur n8n |
| `anfrage_positionen` | Die einzelnen Artikel einer Anfrage mit Menge | nur n8n |

Beziehungen: `anfrage_positionen.anfrage_id` → `anfragen.id`, `anfrage_positionen.artikel_id` → `artikel.id`, `anfragen.platz` → `plaetze.platz`.

**SQL:** `supabase/migrations/20261024193000_bestellsystem.sql` (Tabellen, Constraints, Row Level Security, Startdaten). Die Migration läuft nach dem Merge über die GitHub-Integration, nicht von Hand im SQL-Editor. Gegenüber dem ursprünglichen Entwurf:

- `plaetze.salon_id` und `artikel.salon_id` (Pflicht, verweist auf `salons`)
- `plaetze.platz > 0`, Artikel-ID nur aus `a-z`, `0-9`, `_`, Artikelname nicht leer
- Lesen für `anon` **und** eingeloggte Nutzer (Teammitglieder scannen auch QR-Codes), jeweils nur aktive Zeilen
- `anfragen` und `anfrage_positionen`: Rechte für `anon` und `authenticated` entzogen und keine Policy
- kein zusätzlicher Index auf `anfrage_positionen (anfrage_id)`, der Unique-Constraint enthält ihn schon; stattdessen Indizes auf `salon_id` und `artikel_id`

**Regeln:**
- Das Frontend nutzt den Anon-Key und darf nur `plaetze` und `artikel` lesen. Es schreibt nie in die Datenbank.
- `anfragen` und `anfrage_positionen` sind für das Frontend komplett gesperrt. Schreiben und Lesen läuft nur über n8n mit dem Service-Key.
- Neue Artikel: eine Zeile in `artikel` ergänzen, kein Code-Umbau nötig. Auslaufende Artikel mit `aktiv = false` ausblenden.
- Kategorien (z. B. `getraenk`, `decke`, `essen`) steuern die Gruppierung in der Telegram-Nachricht.
- Keine personenbezogenen Daten.
- Hinweis: Supabase-Gratisprojekte pausieren bei längerer Inaktivität. Deshalb die Notkarte im Frontend (Abschnitt 5) und der Fehler-Workflow (Abschnitt 7).

**Nützliche Auswertungen später:** meistangefragte Artikel, Anfragen pro Platz und Uhrzeit, Spitzenzeiten. Alles direkt aus diesen Tabellen möglich.

## 10. Sicherheit und Datenschutz

- Anonym: keine Namen, keine Accounts, keine Gesundheits- oder Stimmungsdaten.
- Secrets (Telegram-Token, Supabase-Service-Key) nur in n8n. Im Frontend liegt nur der öffentliche Anon-Key, der durch Row Level Security auf Lesen von `plaetze` und `artikel` beschränkt ist.
- Serverseitige Validierung in n8n, das Frontend wird nicht vertraut.
- Sperre pro Platz (Standard 60 Sekunden, als Variable einstellbar) gegen Spam.
- Eindeutige `anfrage_id` schützt vor doppelten Nachrichten, solange Supabase erreichbar ist.
- Später optional: geheimer Code pro Platz im Link.

## 11. Akzeptanzkriterien Phase 1

Stand: Alles, was ohne Salon, Telegram und die echte Datenbank prüfbar ist, ist geprüft (Browser-Test im Produktions-Build mit simuliertem Supabase und n8n: 18 Tests; pgTAP lokal: 28 Tests für die neuen Tabellen; n8n-Code-Node: 47 Tests). Offen ist, was die echten Systeme braucht.

- [x] Alle 7 Links (`/p/1` bis `/p/7`) öffnen die Seite mit der richtigen Platznummer, groß sichtbar
- [x] Mehrere Artikel mit Mengen lassen sich auswählen und in „Deine Auswahl“ zusammenfassen
- [ ] Ein Klick auf den Hauptbutton erzeugt genau eine Nachricht in der Telegram-Gruppe, auch bei Doppelklick oder Wiederholung *(Frontend sendet bei Doppelklick genau eine Anfrage, Wiederholung mit gleicher `anfrage_id`; Telegram und n8n noch nicht angeschlossen)*
- [ ] Nachricht entspricht dem Format `Platz N: 2× Wasser, 1× Apfelschorle` *(Format im Code-Node getestet, noch nicht in Telegram gesehen)*
- [ ] Nachricht erscheint auf den Apple Watches des Teams
- [ ] Anfrage steht in Supabase (eine Zeile in `anfragen`, je Artikel eine Zeile in `anfrage_positionen`) *(Tabellen und Constraints lokal getestet, Migration noch nicht angewendet)*
- [ ] Fällt Supabase aus, geht die Telegram-Nachricht trotzdem raus, und der Fehler-Workflow meldet sich *(Frontend-Notkarte und Code-Node-Ausfall getestet, Workflow und Ausfalltest in n8n offen)*
- [x] Die Artikelliste kommt aus der Tabelle `artikel`, ein neuer Eintrag erscheint ohne Code-Änderung. Ohne Supabase greift die Notkarte.
- [x] Zweite Anfrage am selben Platz innerhalb der Sperrzeit wird freundlich abgelehnt *(Frontend und Entscheidungslogik getestet, Ende-zu-Ende erst mit n8n)*
- [x] Nach einem Timeout von ca. 10 Sekunden sieht der Gast die Meldung „Bitte sprich kurz das Team an“
- [x] Ungültige Platznummer zeigt eine Hinweisseite
- [x] Light- und Dark-Mode funktionieren (mit den Tokens der Plattform), Umschalter vorhanden, Systemeinstellung wird beim ersten Laden übernommen
- [ ] 7 druckbare QR-Codes (Stufe H) liegen vor *(Skript fertig und geprüft, Codes entstehen mit der endgültigen Domain)*

## 12. Roadmap (nicht in Phase 1)

Jeweils als neue Artikel oder Kategorien im selben Webhook:

1. Decke (nur auf Wunsch) und Essen: neue Artikel, mischbar in derselben Anfrage
2. Weitere Getränke: neue Zeilen in `artikel`
3. Produktberatung buchen: eigener `typ` (`beratung`), da ohne Artikel
4. Neutrale Hinweise ans Team (z. B. "Ruhe" oder "Gespräch gewünscht"): anonym und ohne Speicherung personenbezogener Daten
5. Playlists
6. Gästeumfrage mit Goodies
7. Merch-Verkauf: einziger echter Kauf, braucht Preise und Zahlung, eigenes Modul
8. Digitalbibliothek und Member-Funktionen (braucht Login, eigene Phase)

## 13. Offene Platzhalter

- `<DOMAIN>` der Bestellseite (vor dem Erzeugen der QR-Codes)
- n8n-Webhook-URL (Test und Produktion) → Netlify-Variable `VITE_BESTELL_WEBHOOK_URL`
- Telegram-Chat-ID der Anfragen-Gruppe und des Admin-Chats
- Supabase-Anon-Key für Netlify (`VITE_SUPABASE_ANON_KEY`, ist für die Plattform schon nötig); der Service-Key gehört nur in n8n
- Links zu Impressum und Datenschutz für den Fuß → Netlify-Variablen `VITE_IMPRESSUM_URL` und `VITE_DATENSCHUTZ_URL` (die Datenschutzerklärung muss Supabase, n8n und Telegram nennen)
- Endgültiger Text des Hauptbuttons (Standard: „Jetzt anfordern“, Konstante `HAUPTBUTTON_TEXT` in `src/lib/bestellung.ts`)
- Migration anwenden (Merge in den Produktions-Branch) und den Workflow in n8n bauen

