# Erweiterung D: Kommentar-Auswertung

**Ziel:** Die Leitung sieht, **wer** Kommentare schreibt, **wie ausführlich** und **wer keine** schreibt, damit das Feedback im Team besser wird. Die Kennzahlen sind kein Instrument, Personen zu bewerten.

## Kennzahlen (alle in SQL)

| Kennzahl | Bedeutung |
|---|---|
| Kommentare, Quote | Kommentare ÷ Bewertungen in % |
| Pflicht | Bewertungen ab 4 (Kommentar vorgeschrieben); „erfüllt“ = davon mit Kommentar |
| Freiwillig | Kommentare zu Bewertungen 1 bis 3; freiwillige Quote |
| Ø Wörter | Länge der Kommentare |
| Kurz | Kommentare unter 5 Wörtern |
| Doppelt | Wiederholungen desselben Textes (Groß-/Kleinschreibung und Leerzeichen egal) |
| Verhalten ohne Kommentar | Verhalten, zu denen der Absender nirgends etwas geschrieben hat |

Das Team wird **gewichtet** (Summe ÷ Summe). „Nicht abgegeben“ zählt nur, wer für den Monat erwartet wird (`aktiv_ab` und `start_monat` zählen).

## Datenschutz

- Kennzahlen je Person als Absender, aber **nie ein Kommentartext**.
- Schalter `salons.eigene_analyse_nur_admin` (Standard aus): an = Verantwortliche sehen ihre eigenen Kennzahlen, ihren Personenbericht und ihre Analyse nicht; der Admin sieht alles, Team-Summen bleiben vollständig.

## Datenbank (`20261105082715_kommentar_auswertung.sql`)

Ansicht `v_kommentar_metriken` (für Anmeldungen gesperrt), Funktion `kommentar_auswertung(monat)` (nur Verantwortliche und Admin).

## Oberfläche

`/app/leitung/kommentare` mit Monatswahl, Team-Kennzahlen, Tabelle je Person, „Nicht abgegeben“. Der Monatsbericht (PDF) enthält dieselben Kennzahlen.

## Tests

pgTAP `05_kommentar_auswertung.test.sql` (40), Browser `phase-d.test.mjs`.
