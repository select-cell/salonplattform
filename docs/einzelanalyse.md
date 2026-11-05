# Erweiterung E: Monatsabschluss und Einzelanalyse

**Ziel:** Einen Monat abschließen und für jede Person eine KI-Analyse als Gesprächsgrundlage erzeugen. **Alle Zahlen kommen aus SQL, die KI formuliert nur den Text.**

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

## Datenbank (`20261105104052_monatsabschluss_analysen.sql`)

Tabellen `monatsabschluesse`, `analysen` (Typ `person`, auch `team_agenda` für die Agenda; eine Zeile je Salon, Monat, Typ, Person), beide gesperrt. Öffentliche Funktionen: `monat_abschliessen`, `abschluss_uebersicht`, `analyse_eingabe`, `analyse_pruefen`, `analyse_speichern`, `analyse_lesen`, `analyse_bearbeiten`, `analyse_freigeben`. Interne Hilfen (nicht aufrufbar): `analyse_zugriff`, `analyse_anonymisieren`, `analyse_zahlen`, `analyse_json_zahlen`, `analyse_faktencheck`, `analyse_eingabe_bauen`, `analyse_zeile`.

Eine Analyse gilt als **„Daten geändert“** (veraltet), wenn sich die Eingabe seit dem Erstellen geändert hat (neuer Hash).

## Edge Function `analyse-erstellen` (`verify_jwt` AN, kein `service_role`)

Eingabe holen → gleiche Eingabe **und** Prompt-Version wie gespeichert = **kein neuer KI-Aufruf** → Anbieter formuliert (JSON) → Faktencheck über `analyse_pruefen` → bei Abweichung bis zu zwei Wiederholungen (**höchstens 3 Aufrufe**) → Entwurf speichern (auch mit nicht bestandenem Faktencheck, mit Hinweis). Fehler kommen als deutsche Meldung.

| Secret | Bedeutung |
|---|---|
| `AI_PROVIDER` | `claude` oder `webhook` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | bei `claude` (Modell optional) |
| `AI_WEBHOOK_URL`, `AI_WEBHOOK_SECRET` | bei `webhook` (https; Secret optional, kommt als `Authorization: Bearer` und `x-webhook-secret`) |

Ohne Einrichtung meldet die Seite „Die KI ist noch nicht eingerichtet.“; alles andere läuft. Der Prompt liegt versioniert im Repo (`PROMPT_VERSION` in `analyse.ts`). Wer ihn ändert, erhöht die Version; dann gilt die Eingabe als neu. Die Branche („Friseursalon“) steht im ersten Satz von `SYSTEM_PROMPT`.

**Webhook-Format:** POST mit `{ prompt_version, system, nachricht, eingabe }`; Antwort ein JSON-Objekt mit den sechs Schlüsseln (`zusammenfassung`, `staerken`, `entwicklungsfelder`, `gespraechsfragen`, `vereinbarungen_vorschlaege`, `kommentar_qualitaet_hinweis`), direkt oder unter `ausgabe`, `output`, `text` oder `antwort`.

**Fertiger n8n-Workflow:** `n8n/dawiid-analyse.workflow.json` (Import, Einrichtung, drei Testanfragen und Anleitung zum Einzeltest in [n8n/README.md](../n8n/README.md)). Er ruft Claude auf, liest das JSON und zeigt schon beim Testen, welche Zahlen nicht in den Daten stehen.

## Datenschutz

Feedbacktexte gehen **ohne Namen und ohne Absender** an den KI-Anbieter. Der Hinweis steht auf „Monatsabschluss“ und auf „Info und Datenschutz“. Mitarbeiter bekommen keine Analysen (`42501`). Ist `eigene_analyse_nur_admin` an, sehen Verantwortliche ihre eigene Analyse nicht.

## Tests

pgTAP `07_monatsabschluss_analysen.test.sql` (151: Rechte, Abschluss, Eingabe ohne Namen über alle Namensteile, Faktencheck, Entwurf/Freigabe, Salon-Grenze, Schalter), Logik der Edge Function `supabase/functions/analyse-erstellen/analyse.test.ts` (23, `npm run test:functions`), Browser `phase-e.test.mjs` (53).

## Nicht live getestet

Die echte KI wurde in der Entwicklung nicht aufgerufen (kein Schlüssel, kein Netz). Die Logik ist mit nachgebautem Anbieter getestet; der erste echte Lauf nach der Einrichtung ist der Praxistest.
