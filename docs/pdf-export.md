# Erweiterung C: PDF-Export

**Ziel:** Monats- und Personenbericht als PDF für Verantwortliche und Admin, mit Protokoll, wer wann was abgerufen hat.

## Regeln

- Das PDF entsteht **im Browser** (`@react-pdf/renderer`, nur beim Klick geladen). Die Plattform speichert keine Kopie.
- **Die Datenbank liefert die Zahlen und führt Protokoll.** Jeder erfolgreiche Abruf schreibt einen Eintrag in `pdf_export_log`; abgelehnte Abrufe schreiben nichts.
- **Monatsbericht:** Beteiligung, Team-Kennzahlen, Ergebnis je Verhalten, Top/Flop, Kommentar- und Zeit-Kennzahlen. Keine Rangliste einzelner Personen, keine Kommentartexte. Am Ende die **freigegebene** Agenda (ohne Kommentar-Beispiele).
- **Personenbericht:** Kennzahlen, Verlauf, alle Verhalten, Kommentare der Kollegen **ohne Absender**, eigene Kommentare, Entwicklung, Vereinbarungen und Unterschriften. Die **freigegebene** Analyse steht dabei, ein Entwurf nie.
- Dateiname: `<salon>_<YYYY-MM>_monatsbericht.pdf` bzw. `<salon>_<YYYY-MM>_personenbericht-<name>.pdf` (Umlaute umgeschrieben).
- Fußzeile auf jeder Seite: „Vertraulich – nur für Verantwortliche“, Datum, „Seite x von y“.

## Datenbank (`20261105085146_pdf_export.sql`, erweitert in `…_monatsabschluss_analysen` und `…_fokus_agenda_termine`)

`pdf_monatsbericht(monat)`, `pdf_personenbericht(person, monat)`, `pdf_export_protokoll(limit)` (nur Admin). Mitarbeiter: `42501`. Fremde oder unbekannte Person: `42501 „Person nicht gefunden.“`; ebenso der eigene Bericht eines Verantwortlichen, wenn `salons.eigene_analyse_nur_admin` an ist. Monat ohne Daten: `22023`.

## Oberfläche

Knopf „Monatsbericht als PDF“ im Team-Dashboard, „Personenbericht als PDF“ bei jeder Person (Team-Dashboard und Mitglieder-Seite). Auf „Info und Datenschutz“ sieht der Admin das Export-Protokoll.

## Dateien

`src/lib/pdf.ts`, `src/components/auswertung/PdfKnopf.tsx`, `src/pdf/` (`erzeuge`, `Monatsbericht`, `Personenbericht`, `bausteine`, `schriften`, `logo`, `AnalyseAbschnitt`, `AgendaAbschnitt`).

## Tests

pgTAP `06_pdf_export.test.sql` (39). Browser `phase-c.test.mjs` erzeugt die PDFs wirklich und prüft sie mit poppler: A4, Seitenzahl, **alle Schriften eingebettet** (kein Helvetica), Umlaute, Minuszeichen, Fußzeile auf jeder Seite, Dateiname.

## Stolpersteine

- Nur **WOFF** (kein WOFF2) für Schriften; **kein SVG** im PDF: das Logo wird per Canvas als PNG in der Textfarbe gezeichnet.
- **Kein `lineHeight` an Seite oder Container:** er wird vererbt und lässt die Fußzeile verschwinden.
- Sonderzeichen wie „■“ oder „●“ gibt es in DM Sans nicht: sie fallen auf Helvetica zurück (nicht eingebettet). Legenden werden gezeichnet.
