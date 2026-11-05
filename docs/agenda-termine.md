# Erweiterung F: Fokus, Agenda, Termine, Mailversand

**Ziel:** Aus den Ergebnissen eines Monats entsteht eine Agenda für das Teammeeting (15 bis 20 Minuten). Die Verantwortlichen bekommen sie vor dem Termin per Mail.

## Fokus-Verhalten (`/app/leitung/fokus`)

Die Leitung markiert Verhalten, die gerade besonders wichtig sind (Begründung, optional befristet). Tabelle `fokus_verhalten` (gesperrt): `gueltig_ab` bis `gueltig_bis`, leer = bis auf Weiteres, **einschließlich dieses Tages**. „Aus dem Fokus nehmen“ beendet den Eintrag gestern; die Geschichte bleibt, „wieder an“ legt einen neuen Eintrag an. Funktionen `fokus_liste()`, `fokus_umschalten(verhalten, an, begruendung, ab, bis)`. Ein Verhalten eines anderen Salons: `42501`; Ende vor Beginn: `22023` und Constraint.

## Agenda (`/app/leitung/agenda`, auch `?monat=YYYY-MM` aus der Mail)

Entsteht **aus den Daten ohne KI** (feste Vorlage `agenda-vorlage-v1`, alle Zahlen aus SQL); seit Version 1.3 kann der Admin sie zusätzlich [von der KI formulieren lassen](#agenda-mit-ki-version-13). Fünf Blöcke in fester Reihenfolge; das **Zeitbudget prüft die Datenbank** (`22023`):

| Block | Minuten (Vorlage) | Inhalt |
|---|---|---|
| Einstieg und Beteiligung | genau 2 | Danke, wie viele haben abgegeben |
| Team-Kennzahlen des Monats | genau 3 | Selbstbild, Fremdbild, Differenz, Stufe, Vormonat |
| Fokus-Verhalten | 6 bis 8 (7) | 1. Fokus-Verhalten, 2. größte Teamdifferenzen (über der Schwelle), 3. größte Veränderungen zum Vormonat; **höchstens drei** |
| Entwicklungsfelder und Differenzen | 3 bis 4 (4) | die drei niedrigsten Fremdbilder, ohne Wiederholung aus dem Fokus-Block |
| Vereinbarungen | 2 bis 3 (2) | Leitfragen |

Summe 15 bis 20 (Vorlage 18). **Hinweis „Stand unvollständig“** (zum Zeitpunkt des Erzeugens), wenn der Monat nicht abgeschlossen ist oder Abgaben oder Einzelanalysen fehlen. **Nur Teamebene:** keine Rangliste, keine Absender. Zu den Fokus-Verhalten stehen auf der **Plattform** bis zu zwei **anonymisierte Kommentar-Beispiele**, **nie in Mails und nie im PDF**.

Gespeichert als `analysen` vom Typ `team_agenda`; Entwurf → bearbeiten → freigeben wie bei E. `agenda_erzeugen(monat, neu)` ersetzt eine vorhandene Agenda nur mit `neu = true`. Beim Bearbeiten bleiben Überschriften, Reihenfolge und Hinweise fest. Die freigegebene Agenda steht am Ende des Monatsberichts (PDF).

### Agenda mit KI (Version 1.3)

Der Admin hat auf der Seite „Agenda“ neben „Agenda erzeugen“ (Vorlage) den Knopf **„Mit KI formulieren“** (und „Neu mit KI formulieren“). Die Vorlage bleibt bestehen und ist der Rückfall: Scheitert die KI, ändert sich nichts an einer vorhandenen Agenda.

- **Eingabe** (`agenda_ki_eingabe`): nur Teamwerte wie bei der Gesamtauswertung, die Fokus-Verhalten von heute (nur Nummer und Titel, **ohne** die Begründung der Leitung) und das Zeitbudget je Block. Keine Namen, keine Kommentartexte.
- **Prüfung** (`agenda_ki_pruefen`): fünf Blöcke in fester Reihenfolge, Minuten je Block und 15 bis 20 insgesamt, jeder Punkt höchstens 600 Zeichen, und **jede Zahl** im Text muss in der Eingabe stehen (auch die Zahlen des Zeitbudgets). Ein Fehler im Aufbau geht mit der Meldung der Datenbank an die KI zurück („Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.“), höchstens drei Versuche.
- **Speichern** (`agenda_ki_speichern`): als Entwurf in `analysen` (Typ `team_agenda`, wie die Vorlage). Überschriften, Hinweis „Stand unvollständig“ und Zeitbudget setzt und prüft die Datenbank; `geprueft` rechnet sie selbst. Anbieter, Prompt-Version (`agenda-ki-v1`), Versuche und Eingabe-Hash stehen am Eintrag.
- **Danach** wie bei der Vorlage: Bearbeiten (bei einer KI-Agenda läuft der Faktencheck erneut), Freigeben, PDF und Mail. Verantwortliche lesen, bearbeiten und geben sie frei wie bisher; **erzeugen** lassen kann die KI-Fassung zurzeit nur der Admin (`salons.ki_nur_admin`). „Neu erzeugen“ (Vorlage) setzt Anbieter und Faktencheck zurück.
- Über n8n läuft das als dritter Strang `agenda` desselben Webhooks (siehe [n8n/README.md](../n8n/README.md)).

## Termine (`/app/leitung/termine`, nur Admin)

Tabelle `meeting_termine` (gesperrt). `startet_am` ist `timestamptz`; eingegeben und angezeigt wird die **Ortszeit** („2026-10-26T10:00“ ohne Zeitzone, die Datenbank rechnet Sommer- und Winterzeit). Einzeln oder als **Serie** (wöchentlich, zweiwöchentlich, monatlich, 2 bis 60); die Uhrzeit bleibt über die Zeitumstellung gleich, jeder Termin wird vom ersten aus gerechnet (31. Januar, 28. Februar, 31. März). Bezugsmonat der Agenda: Standard ist der Monat vor dem Termin, auf Wunsch fest. Vorlauf: Agenda-Mail N Tage vorher (Standard 2), Erinnerung N Stunden vorher (Standard 1); mehrere Werte sind erlaubt, der größte löst aus; ein Komma ist das Dezimalzeichen („0,5“). **Empfänger:** aktive Verantwortliche des Salons mit E-Mail, auf Wunsch zusätzlich der Admin; **Mitarbeiter nie**. Termine werden nicht gelöscht, sondern „entfernt“; „Mails pausieren“ stoppt nur den Versand. Funktionen `termine_liste`, `termin_speichern`, `termine_serie`, `termin_entfernen`: `42501` für Nicht-Admin, auch für Verantwortliche.

## Der Versand

Edge Function `agenda-versand` (Zeitplan alle 15 Minuten). **Die Datenbank entscheidet, nicht der Kalender:**

1. `versand_faellig`: Agenda-Mail ab „Termin minus größter Vorlauf in Tagen“ **in Ortszeit** (Mo 26.10.2026 10:00 minus 2 Tage = Sa 24.10. 10:00 Ortszeit = 08:00 UTC, nicht 48 Stunden). Erinnerung ab „minus Stunden“. **Nach Terminbeginn nichts mehr.** Eine verpasste Agenda-Mail wird bis dahin nachgeholt.
2. `versand_beanspruchen`: `UNIQUE (termin_id, art)` in `mail_log` entscheidet, welcher Lauf sendet; ein zweiter bekommt `null`. **Höchstens 3 Versuche**; ein seit über 10 Minuten „in Arbeit“ hängender Lauf wird übernommen.
3. `agenda_fuer_versand`: die gespeicherte Agenda, sonst die Vorlage; **Kommentar-Beispiele sind entfernt**. Ohne Daten steht ein Hinweis statt einer leeren Agenda.
4. Senden über **Resend** mit Idempotenz-Schlüssel `<termin>-<art>`, **eine** Mail an alle Empfänger.
5. `versand_abschliessen`: gesendet oder Fehler (höchstens 500 Zeichen).

Mails: *vorab* (alle Blöcke mit Minuten, Hinweis, Stand „Entwurf“ oder „freigegeben“, Link) und *kurz* (die drei wichtigsten Punkte, Link). Alle Inhalte sind maskiert, die Farben stehen fest. **Kein Name und kein Kommentar** in der Mail.

Die Versandfunktionen sind **nur für `service_role`** aufrufbar. Die Edge Function läuft **ohne JWT-Prüfung** (`verify_jwt` aus), weil der Zeitplan keinen JWT hat. Sie prüft den Header `x-cron-secret` **in gleicher Zeit**. Fehlt ein Secret, antwortet sie `503` mit der Liste der fehlenden und fasst die Datenbank nicht an: **eine fehlende Einrichtung verbraucht keinen der drei Versuche.** Ohne oder mit falschem Secret: `401`.

| Secret | Bedeutung |
|---|---|
| `CRON_SECRET` | gleiches Geheimnis wie im Zeitplan (mindestens 24 Zeichen) |
| `RESEND_API_KEY` | API-Schlüssel von Resend |
| `MAIL_ABSENDER` | z. B. `Salon <agenda@deine-domain.de>`; Domain bei Resend bestätigen |
| `PLATTFORM_URL` | für den Link in der Mail |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Function selbst bereit; der Schlüssel steht nie im Frontend, in der `.env` oder im Repo.

**Probelauf** (zeigt, was fällig wäre, ohne etwas zu senden):

```bash
curl -X POST https://<REFERENZ>.supabase.co/functions/v1/agenda-versand \
  -H "x-cron-secret: <CRON_SECRET>" -H "content-type: application/json" -d '{"trocken": true}'
```

Erwartet: `200` mit `{"ok":true,"trocken":true,"faellig":[...]}`; ohne oder mit falschem Secret `401`; solange Secrets fehlen `503`.

**Zeitplan:** `supabase/versand_einrichten.sql` von Hand im SQL-Editor ausführen (keine nummerierte Migration, enthält ein Geheimnis). Zwei Werte eintragen (`__CRON_SECRET__`, `__PROJEKT_REFERENZ__`); mit Platzhalter oder ungültigem Wert bricht das Skript ab, bevor etwas geändert wird. Es schaltet `pg_cron` und `pg_net` ein, legt Geheimnis und Referenz im Vault ab und plant alle 15 Minuten ein. Anhalten: `select cron.unschedule('agenda-versand');`.

## Tests

pgTAP `08_fokus_agenda_termine.test.sql` (241: Fokus, Handrechnung der Agenda, Zeitbudget, Termine, Serien über die Zeitumstellung, Fälligkeit **25.10.2026: „vorab“ ab 08:00 UTC, nicht 07:59 und nicht erst 09:00**, 28./29.03., kein Versand nach Terminbeginn, kein Doppelversand, höchstens drei Versuche, hängender Lauf, Empfänger mit und ohne Admin-Kopie, nie Mitarbeiter, kein Name und kein Kommentar in der Mail). Logik der Edge Function `supabase/functions/agenda-versand/versand.test.ts` (23). Hilfen `src/lib/agenda.test.ts` (5, `npm run test:unit`). Browser `phase-f.test.mjs`.

## Nicht live getestet

Der echte Versand über Resend und der Zeitplan (pg_cron) sind in der Entwicklung nicht gelaufen (kein Schlüssel, keine Domain, kein Zugriff aus der Entwicklungsumgebung). Beides läuft erstmals nach der Einrichtung; vorher den Probelauf ausführen.
