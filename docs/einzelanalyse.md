# Erweiterung E: Monatsabschluss und Einzelanalyse (ab Version 1.3 mit Sammellauf und Gesamtauswertung)

**Ziel:** Einen Monat abschließen und für jede Person eine KI-Analyse als Gesprächsgrundlage erzeugen. **Alle Zahlen kommen aus SQL, die KI formuliert nur den Text.**

## Wer darf (Version 1.3)

**Zurzeit nur der Admin.** Der Schalter `salons.ki_nur_admin` (Standard an) regelt das für alle KI-Funktionen: Verantwortliche bekommen `42501` „Nur für Admins.“, Mitarbeiter und Anmeldungen ohne Rolle weiter „Nur für Verantwortliche und Admins.“. Der Monatsabschluss selbst und das PDF mit **freigegebenen** Analysen bleiben für Verantwortliche. In der Übersicht (`abschluss_uebersicht`) steht `ki` (darf die aufrufende Person die KI nutzen?); ohne KI-Recht zeigt die Seite einen Hinweis und keine Analysen.

Später für Verantwortliche öffnen (je Salon, ohne neue Version):

```sql
update public.salons set ki_nur_admin = false where id = '<Salon-ID>';
```

## Ablauf

1. **Monat abschließen** (auch unvollständig: „3 von 4 Abgaben“). Ein erneuter Abschluss aktualisiert nur die Zahlen („Stand aktualisieren“).
2. **Analyse erstellen** (einzeln oder „Alle fehlenden erstellen“). Ergebnis: ein **Entwurf**.
3. Die Leitung **liest, bearbeitet und gibt frei**. Jede Bearbeitung macht die Analyse wieder zum Entwurf. „Neu generieren“ ist ein eigener Knopf (mit Rückfrage, wenn bearbeitet oder freigegeben).
4. **Nur eine freigegebene Analyse** kommt in den Personenbericht (PDF).

## Die Eingabe baut die Datenbank (`analyse_eingabe`)

Kennzahlen und Stufen nach den Schwellen, Vormonat und Veränderung, je Verhalten Selbst-/Fremdbild, Stärken und Entwicklungsfelder, Kommentare der Kollegen **ohne Absender**, eigene Kommentare, Begründungen zur Entwicklung.

**Keine Namen:** Die bewertete Person heißt „die bewertete Person“, alle anderen „Kollege A, B …“ (die Buchstaben ordnet ein Hash). Ersetzt werden ganze Namen, Vor- und Nachname einzeln, Teile eines Doppelnamens und Genitiv („Annas“), ohne Rücksicht auf Groß-/Kleinschreibung; E-Mail-Adressen werden zu „E-Mail-Adresse“. Weder Absenderfeld noch Kennungen gehen mit.

## Faktencheck in der Datenbank

Jede Zahl im Text und in der strukturierten Ausgabe muss in der Eingabe vorkommen: `3,5 = 3.5 = 3,50`, das Vorzeichen zählt nicht, Listennummern am Zeilenanfang zählen nicht, **1 bis 5 sind immer erlaubt**. Bei Abweichung: „Faktencheck nicht bestanden: 4,71 steht nicht in den Daten“ (mehrere: „2,9 und 4,71 stehen nicht in den Daten“). Die Freigabe bleibt möglich: Die Leitung entscheidet.

`analyse_speichern` und `analyse_bearbeiten` ermitteln `geprueft` **selbst**; die Edge Function kann es nicht fälschen. **Bekannte Grenze:** Eine erfundene Zahl, die zufällig einer Zahl der Eingabe gleicht (etwa einer Verhaltensnummer), fällt nicht auf. Deshalb liest die Leitung jeden Entwurf.

## Sammellauf und Gesamtauswertung (Version 1.3)

**Sammellauf** („Alle fehlenden erstellen“): Die Oberfläche ruft die Edge Function mit `aufgabe: "alle"` auf. Sie bearbeitet je Aufruf die nächsten **2 Personen** ohne Analyse (`PAKET_GROESSE`; n8n Cloud beendet Anfragen nach etwa 100 Sekunden), schickt sie **in einer Anfrage** an die KI und speichert jede Analyse einzeln (mit eigenem Faktencheck und eigenen Wiederholungen, nur für die betroffene Person). Die Antwort nennt `erstellt`, `fehlgeschlagen` (mit Grund) und `verbleibend`; die Oberfläche ruft erneut auf, bis nichts mehr fehlt, und nimmt gescheiterte Personen aus (`ausgenommen`).

**Gesamtauswertung** (`aufgabe: "gesamt"`): ein KI-Text für das **ganze Team** mit `gesamt_eingabe`, `gesamt_pruefen`, `gesamt_speichern`, `gesamt_lesen`, `gesamt_bearbeiten`, `gesamt_freigeben` (gleicher Ablauf wie bei der Einzelanalyse, Typ `team_gesamt` in `analysen`). Die Eingabe enthält nur **Teamwerte**: Kennzahlen und Vormonat, je Verhalten Selbst-/Fremdbild, Stärken und Entwicklungsfelder, die größten Differenzen und Veränderungen, die Fokus-Verhalten des Monats (nur Nummer und Titel) und die **Zahl** der Kommentare (`kommentare.fremdbild_bewertungen`, `davon_mit_kommentar`). Keine Namen, keine Einzelpersonen, keine Kommentartexte, keine Begründungen. Prompt: `SYSTEM_PROMPT_GESAMT`, Version `gesamt-v1`. Die Gesamtauswertung erscheint noch in keinem PDF.

**Agenda mit KI** (`aufgabe: "agenda"`): die KI formuliert die Agenda fürs Teammeeting aus denselben Teamwerten; Aufbau, Zeitbudget und Zahlen prüft die Datenbank (`agenda_ki_*`). Einzelheiten stehen in [agenda-termine.md](agenda-termine.md).

## Datenbank (`20261105104052_monatsabschluss_analysen.sql`, erweitert durch `…_ki_admin_gesamtauswertung.sql`)

Tabellen `monatsabschluesse`, `analysen` (Typ `person`, `team_agenda` für die Agenda und `team_gesamt` für die Gesamtauswertung; eine Zeile je Salon, Monat, Typ, Person), beide gesperrt. Öffentliche Funktionen: `monat_abschliessen`, `abschluss_uebersicht`, `analyse_eingabe`, `analyse_pruefen`, `analyse_speichern`, `analyse_lesen`, `analyse_bearbeiten`, `analyse_freigeben` und die sechs `gesamt_*`-Funktionen. Interne Hilfen (nicht aufrufbar): `analyse_zugriff`, `analyse_anonymisieren`, `analyse_zahlen`, `analyse_json_zahlen`, `analyse_faktencheck`, `analyse_eingabe_bauen`, `analyse_zeile`.

Eine Analyse gilt als **„Daten geändert“** (veraltet), wenn sich die Eingabe seit dem Erstellen geändert hat (neuer Hash).

## Edge Function `analyse-erstellen` (`verify_jwt` AN, kein `service_role`)

Eingabe holen → gleiche Eingabe **und** Prompt-Version wie gespeichert = **kein neuer KI-Aufruf** → Anbieter formuliert (JSON) → Faktencheck über `analyse_pruefen` → bei Abweichung bis zu zwei Wiederholungen (**höchstens 3 Aufrufe** je Analyse, in Runden: nur wer noch offen ist, kommt in die nächste) → Entwurf speichern (auch mit nicht bestandenem Faktencheck, mit Hinweis). Fehler kommen als deutsche Meldung.

| Secret | Bedeutung |
|---|---|
| `AI_PROVIDER` | `claude` oder `webhook` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | bei `claude` (Modell optional) |
| `AI_WEBHOOK_URL`, `AI_WEBHOOK_SECRET` | bei `webhook`: die Production URL des n8n-Webhooks (https; Secret optional, kommt als `Authorization: Bearer` und `x-webhook-secret`) |

Ohne Einrichtung meldet die Seite „Die KI ist noch nicht eingerichtet.“; alles andere läuft. Der Prompt liegt versioniert im Repo (`PROMPT_VERSION` in `analyse.ts`). Wer ihn ändert, erhöht die Version; dann gilt die Eingabe als neu. Die Branche („Friseursalon“) steht im ersten Satz von `SYSTEM_PROMPT`.

**Ein Webhook für alles:** Mit `AI_PROVIDER=webhook` geht jede KI-Anfrage an den **einen** Webhook. Anfrage: `{ aufgabe, prompt_version, auftraege: [{ ref, system, nachricht, eingabe }] }` mit `aufgabe` = `einzelanalyse` (auch für den Sammellauf mit mehreren Aufträgen), `gesamtauswertung` oder `agenda`. Antwort **direkt als Antwort des Webhooks**: `{ ergebnisse: [{ ref, code, ausgabe | fehler }] }`, die `ausgabe` ein JSON-Objekt mit den Schlüsseln des jeweiligen Prompts (Einzelanalyse: `zusammenfassung`, `staerken`, `entwicklungsfelder`, `gespraechsfragen`, `vereinbarungen_vorschlaege`, `kommentar_qualitaet_hinweis`; Gesamtauswertung: dieselben, statt des letzten `datenlage_hinweis`). `ref` ist eine laufende Nummer, nie eine Kennung aus der Datenbank. n8n schreibt nichts in die Datenbank: Die Edge Function lässt jede Antwort von der Datenbank prüfen und speichern.

**Fertiger n8n-Workflow:** `n8n/dawiid-ki.workflow.json` mit einem Webhook, einem Strang je Aufgabe und je einem KI-Agenten (Anthropic) mit Kontext (Import, Einrichtung, Testanfragen und Anleitung zum Einzeltest in [n8n/README.md](../n8n/README.md)).

**Zeit:** höchstens 135 Sekunden je Anfrage und 120 Sekunden je Aufruf des Anbieters (Supabase bricht nach 150 Sekunden ab). Deshalb höchstens 2 Personen je Sammellauf-Aufruf.

## Datenschutz

Feedbacktexte gehen **ohne Namen und ohne Absender** an den KI-Anbieter, bei der Gesamtauswertung nur Teamwerte und die Zahl der Kommentare. Bei `AI_PROVIDER=webhook` läuft das über n8n (eine zusätzliche Station). Der Hinweis steht auf „Monatsabschluss“ und auf „Info und Datenschutz“. Mitarbeiter bekommen keine Analysen (`42501`). Ist `eigene_analyse_nur_admin` an, sehen Verantwortliche ihre eigene Analyse nicht (für Verantwortliche gilt das nur, wenn `ki_nur_admin` aus ist).

## Tests

pgTAP `07_monatsabschluss_analysen.test.sql` (151: Rechte, Abschluss, Eingabe ohne Namen über alle Namensteile, Faktencheck, Entwurf/Freigabe, Salon-Grenze, Schalter; mit `ki_nur_admin` aus), `09_ki_admin_gesamt.test.sql` (118: Standard nur Admin, Gesamtauswertung, Schalter, Salon-Grenze), `10_agenda_ki.test.sql` (75: Eingabe, Aufbau, Zeitbudget, Zahlen, Speichern, Bearbeiten), Logik der Edge Function `supabase/functions/analyse-erstellen/analyse.test.ts` (59, `npm run test:functions`), n8n-Workflow `n8n/workflow.test.mjs` (27, `npm run test:n8n`), Browser `phase-e.test.mjs` (85) und `phase-f.test.mjs` (107).

## Nicht live getestet

Die echte KI wurde in der Entwicklung nicht aufgerufen (kein Schlüssel, kein Netz). Die Logik ist mit nachgebautem Anbieter getestet; der erste echte Lauf nach der Einrichtung ist der Praxistest.
