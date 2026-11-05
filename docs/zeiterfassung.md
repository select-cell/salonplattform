# Erweiterung B: Zeiterfassung der Umfrage

**Ziel:** Messen, wie lange jemand die Umfrage wirklich bearbeitet. Pausen, andere Tabs, ein gesperrter Bildschirm und eine verstellte Geräteuhr dürfen das Ergebnis nicht verfälschen.

## Regeln

- **Die Serveruhr zählt.** Start, Herzschläge und Abgabe stempelt die Datenbank. Das Gerät liefert nur Zählerstände (aktive Sekunden aus `performance.now()`).
- **Aktiv** heißt: Die Seite ist sichtbar und in den letzten 45 Sekunden gab es Tippen, Klicken, Scrollen oder ein laufendes Video (`src/lib/zeitmesser.ts`).
- **Der Server deckelt jeden Zählerstand:** nie weniger als bisher, höchstens die echte Serverzeit seit dem letzten Herzschlag plus Toleranz mehr, insgesamt höchstens die Zeit seit dem Start. Die Schrittzeiten zusammen sind nie größer als die aktive Zeit.
- **Nichts wird verworfen.** Auffällige Abgaben bekommen Kennzeichen (`zu_schnell`, `sehr_lang`, `viele_pausen`, `wiederaufgenommen`, `heartbeat_luecke`, `neu_begonnen`, `ohne_sitzung`). Sie zählen dann nicht in Median und Spanne, bleiben aber sichtbar. Niemand wird gesperrt.
- Ein Entwurf kann fortgesetzt werden („Willkommen zurück“) oder mit Rückfrage neu begonnen werden.

## Datenbank (`20261105024622_zeiterfassung.sql`)

| Funktion | Zweck |
|---|---|
| `umfrage_starten(monat, neu)` | Sitzung beginnen oder fortsetzen |
| `umfrage_heartbeat(sitzung, aktive_sek, schritte)` | Zählerstand melden (der letzte beim Schließen per `fetch` mit `keepalive`) |
| `umfrage_einreichen_v3(payload, sitzung, aktive_sek, schritte)` | Abgabe (ruft `v2`) und Sitzung abschließen |
| `meine_ausfuellzeit(monat)` | eigene aktive Zeit für die Danke-Seite |
| `zeit_auswertung(monat)` | nur Verantwortliche und Admin |

Tabelle `umfrage_sitzungen` (gesperrt). Einstellungen je Salon in `salons.zeit_*` (Mindestzeit je Verhalten 5 s, „sehr lang“ 4 Stunden, Pausenquote 0,30, Lücke 3 Minuten, Toleranz 10 s), ohne Code im Dashboard änderbar.

## Rechte und Oberfläche

- Mitarbeiter sehen **nur ihre eigene** aktive Zeit am Ende der Umfrage.
- Verantwortliche und Admin sehen im Team-Dashboard den Abschnitt „Ausfüllzeit“: Median und Spanne, Zeit je Person mit Kennzeichen, Zeit je Verhalten, Heatmap.
- Nach dem Ausrollen der neuen Oberfläche wird `umfrage_einreichen_v2` für Anmeldungen gesperrt (eigene Migration), sonst ließe sich die Zeiterfassung umgehen.

## Tests

`supabase/tests/database/04_zeiterfassung.test.sql` (64 Prüfungen: Deckelung, Kennzeichen, Rechte, Salon-Grenze), `tests/browser/phase-b.test.mjs` (Uhr mit `page.clock`).

## Stolpersteine

- `now()` ist innerhalb einer Transaktion konstant: Tests setzen Zeiten über eine Hilfsfunktion zurück.
- Eine volatile Funktion in `BETWEEN` wird zweimal ausgewertet: in eine Unterabfrage packen.
