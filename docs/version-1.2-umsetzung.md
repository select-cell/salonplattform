# Version 1.2: was gebaut ist und was noch zu tun ist

Stand: Alle sechs Erweiterungen (A bis F) sind umgesetzt, getestet und in der Datenbank sowie bei den Edge Functions im Supabase-Projekt `hgtvlcucxzksvmvgvbgo` installiert. Die neue Oberfläche ist gebaut, aber **noch nicht auf Netlify veröffentlicht**. Die Beschreibung der Erweiterungen steht in der Vorlage „Version 1.2: Plattform-Erweiterungen“; je Erweiterung gibt es ein Dokument mit den tatsächlichen Namen und Zahlen dieser Plattform.

## Überblick

| | Erweiterung | Dokument | Migration (Version im Projekt) | Edge Function |
|---|---|---|---|---|
| A | Marke, Schriften, Info-Seite | `src/config/brand.ts`, `src/pages/app/Info.tsx` | – | – |
| B | Zeiterfassung | [zeiterfassung.md](zeiterfassung.md) | `20261105024622_zeiterfassung` | – |
| D | Kommentar-Auswertung | [kommentar-auswertung.md](kommentar-auswertung.md) | `20261105082715_kommentar_auswertung` | – |
| C | PDF-Export | [pdf-export.md](pdf-export.md) | `20261105085146_pdf_export` | – |
| E | Monatsabschluss, Einzelanalyse | [einzelanalyse.md](einzelanalyse.md) | `20261105104052_monatsabschluss_analysen` | `analyse-erstellen` (JWT an) |
| F | Fokus, Agenda, Termine, Mailversand | [agenda-termine.md](agenda-termine.md) | `20261105115919_fokus_agenda_termine` | `agenda-versand` (JWT aus) |
| – | Texte „Kollegen“, „Teilnehmer“ | | `20261105023141_texte_kollegen` | – |

Die Reihenfolge war A, B, D, C, E, F (D vor C, damit der Monatsbericht die Kommentar-Kennzahlen schon enthält). Dazu: der neue Menüpunkt **Leitung** mit Unter-Navigation (Kommentare, Monatsabschluss, Fokus, Agenda, Termine nur für den Admin), das neue Logo (hell und dunkel), „DAWIID“ statt „Dawiid“, „Mitarbeiter“ statt „Mitarbeiterin“ und „Kollegen“ in allen Bereichen.

## Abweichungen von der Vorlage

- **Migrationsnamen:** Die Vorlage nennt 016 bis 020. Hier heißen die Dateien `JJJJMMTThhmmss_name.sql` (nur dieses Format wendet die GitHub-Integration an) und tragen die Versionsnummer, unter der sie im Projekt verbucht sind.
- **Rollen-Hilfen:** Die Plattform hat ihre Hilfsfunktionen im Schema `private` (`rolle()`, `leitung_salon()`, `auswertungs_salon()` …) statt `ist_leitung()` und `ist_admin()`. Die Rechte sind gleich: `42501` für Nicht-Berechtigte, `22023` für ungültige Eingaben.
- **Tests:** pgTAP gegen ein lokales Postgres 16 statt PGlite, `node --test` statt Vitest (Node führt TypeScript direkt aus), Playwright wie in der Vorlage. Es gibt keinen Fingerabdruck-Referenzwert und kein Vorprüfungs-Skript: Diese Plattform ist selbst die Referenz, die Skripte wären erst für eine Übertragung nötig.
- **Fokus:** `fokus_umschalten` bekommt die Kennung des Verhaltens (nicht die Nummer), damit „ein Verhalten eines anderen Salons“ erkennbar ist.
- **Einzelanalyse:** Sie braucht einen abgeschlossenen Monat („Der Monat ist noch nicht abgeschlossen.“). Eine Analyse zeigt „Daten geändert“, wenn sich die Eingabe seit dem Erstellen geändert hat (neuer Hash, zum Beispiel nach einer späten Abgabe und erneutem Abschluss).
- **Nicht gebaut:** die Teamvorstellung mit Profilen (gehört laut Vorlage nicht zu 1.2).

## Was in der Produktion schon installiert ist

- Alle Migrationen oben, die Funktionen sind mit der getesteten Fassung verglichen.
- Edge Function `analyse-erstellen` (JWT-Prüfung an; der n8n-Webhook steht fest im Code, ohne weitere Einstellung gehen alle KI-Aufgaben dorthin).
- Edge Function `agenda-versand` (JWT-Prüfung **aus**, weil der Zeitplan keinen JWT hat). Ohne Secrets antwortet sie auf jeden Aufruf mit `503` und fasst die Datenbank nicht an; mit einem falschen `x-cron-secret` gibt es `401`. Es geht also keine Mail raus, bevor ihr Secrets setzt, Termine anlegt und den Zeitplan einschaltet.
- Alle neuen Tabellen sind für alle Anmeldungen gesperrt, die Versandfunktionen nur für `service_role` aufrufbar.

## Reihenfolge für die Einrichtung

1. **Neue Oberfläche veröffentlichen.** `npm run build` mit der echten `.env` (oder die gebaute ZIP-Datei), `dist` auf Netlify hochladen. Auf den ersten Blick prüfen: Anmeldung, Umfrage ausfüllen (am Ende steht die eigene aktive Zeit).
2. **Alte Abgabe-Funktion sperren:** `supabase/nach_dem_deploy.sql` im SQL-Editor ausführen. Erst wenn die neue Oberfläche online ist und eine Abgabe geklappt hat, sonst bricht die noch laufende alte Oberfläche beim Abgeben ab.
3. **E-Mail-Vorlagen** aus `supabase/email-vorlagen/` im Supabase-Dashboard einfügen (Magic Link und Einladung), damit die Mails „DAWIID“ sagen.
4. **KI einrichten** (für Einzelanalyse, Sammellauf und Gesamtauswertung; zurzeit nur für den Admin, Version 1.3), Der n8n-Webhook (`https://tobitest2008.app.n8n.cloud/webhook/dawiid-ki`) steht fest im Code (`STANDARD_WEBHOOK_URL`), dafür ist kein Secret nötig. In Supabase → Edge Functions → Secrets gehört nur das Geheimnis `AI_WEBHOOK_SECRET` (dasselbe wie in n8n); optional `AI_WEBHOOK_URL` (überschreibt die Adresse), `AI_PROVIDER=claude` mit `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`) für die direkte Anthropic-API. Für `webhook` liegt ein fertiger n8n-Workflow in `n8n/` (ein Webhook, ein Strang je Aufgabe, je ein KI-Agent; Anleitung: [n8n/README.md](../n8n/README.md)). Ohne das Geheimnis lehnt n8n die Anfragen ab (Meldung „Der KI-Zugang wurde abgelehnt“), alles andere läuft trotzdem.
5. **Mailversand einrichten** (für Agenda und Erinnerung):
   - Bei Resend ein Konto anlegen, die Absender-Domain bestätigen, einen API-Schlüssel erzeugen.
   - Secrets setzen: `RESEND_API_KEY`, `MAIL_ABSENDER` (zum Beispiel `Salon <agenda@deine-domain.de>`), `PLATTFORM_URL` (Adresse der Plattform), `CRON_SECRET` (selbst ausgedacht, mindestens 24 Zeichen).
   - Die **Verantwortlichen brauchen eine E-Mail-Adresse** in `personen` (sie sind die Empfänger).
   - Termine unter **Leitung → Termine** eintragen (nur als Admin sichtbar).
   - **Probelauf** (zeigt, was fällig wäre, ohne zu senden): siehe [agenda-termine.md](agenda-termine.md). Erwartet `200` mit `"trocken":true`; ohne oder mit falschem Secret `401`.
   - Zeitplan einschalten: `pg_cron` und `pg_net` aktivieren, dann `supabase/versand_einrichten.sql` im SQL-Editor mit den zwei eigenen Werten ausführen.
6. **Abnahme** (unten).

## Abnahme (Rauchtest, ein Login je Rolle)

**Mitarbeiter:** kein Menüpunkt „Leitung“; `/app/leitung/fokus`, `/agenda`, `/termine` leiten auf `/app` um. Umfrage abgeben: am Ende steht die eigene aktive Zeit, keine Kennzahlen anderer. „Info und Datenschutz“ zeigt die Absätze zu Kommentaren, Ausfüllzeit, PDF, KI, Agenda und Mails.

**Verantwortlicher:** Team-Dashboard mit Abschnitt „Ausfüllzeit“; „Monatsbericht als PDF“ lädt ein PDF. Leitung → Kommentare: Kennzahlen, keine Texte. Leitung → Monatsabschluss: Monat abschließen; der Abschnitt „Analysen“ fehlt, stattdessen steht dort „Die KI-Analysen sind zurzeit nur für Admins.“ (seit Version 1.3). Leitung → Fokus: ein Verhalten zum Fokus machen. Leitung → Agenda: erzeugen, bearbeiten, freigeben; das nächste Monatsbericht-PDF enthält sie. Kein Menüpunkt „Termine“.

**Admin:** Leitung → Agenda: „Mit KI formulieren“ (neben der Vorlage „Agenda erzeugen“). Leitung → Monatsabschluss: Einzelanalysen („Erstellen“ liefert einen Entwurf oder ohne KI „Die KI ist noch nicht eingerichtet.“), „Alle fehlenden erstellen“ (Sammellauf) und die Gesamtauswertung des Teams. Leitung → Termine: Termin und Serie anlegen, ändern, pausieren, entfernen. „Info und Datenschutz“: Export-Protokoll. Versand-Probelauf wie oben.

## Hinweise und offene Punkte

- **Nicht live getestet** (kein Schlüssel, kein Netzzugriff aus der Entwicklungsumgebung): die echte KI, der echte Versand über Resend und der Zeitplan. Die Logik ist mit nachgebautem Anbieter und Datenbank getestet; der erste echte Lauf nach der Einrichtung ist der Praxistest. Den Probelauf also vorher ausführen.
- **Sicherheitshinweise von Supabase** (Advisor): `public.umfrage_einreichen` (alte HTML-Umfrage) ist bewusst noch für `anon` offen, bis ihr sie abschaltet (siehe README, „Alte Abgaben und der Umstieg“). „Leaked Password Protection“ ist im Auth-Bereich ausgeschaltet; das lässt sich dort mit einem Schalter aktivieren. Die übrigen Hinweise (Tabellen ohne Policy, SECURITY-DEFINER-Funktionen für Angemeldete) sind so gewollt: Rohdaten sind gesperrt, Zugriff nur über Funktionen, die die Rolle selbst prüfen.
- **Bestellsystem:** Im selben Supabase-Projekt ist eine weitere Migration (`20261024201935_bestellsystem`) von einem anderen Branch verbucht. Sie gehört nicht zu dieser Arbeit und wurde nicht angefasst.
- **Fehlt weiterhin** (nicht Teil von 1.2): die Fragen für Chef-, Gäste- und Verantwortlichen-Umfrage (Phase 5) und die n8n-Webhook-URL für Jarvis (Phase 6).
- **Datenschutz:** An die KI gehen nur Zahlen und Kommentare ohne Namen und Absender. Beim Mailversand gehen die Mail-Adressen der Verantwortlichen und die Agenda (Teamebene, keine Namen, keine Kommentare) an Resend. Beides steht auf „Info und Datenschutz“; bitte gegen die tatsächliche Nutzung prüfen.
