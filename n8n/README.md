# n8n: ein Webhook für alle KI-Aufgaben

Alle KI-Anfragen der Plattform laufen über **einen** Webhook. Die Edge Function `analyse-erstellen` schickt sie dorthin, das Feld `aufgabe` entscheidet, in welchen **Strang** des Workflows die Anfrage läuft. In jedem Strang bearbeitet ein **KI-Agent** (Claude über die Anthropic-API, mit Kontext) die Aufträge, und die Antwort geht **direkt als Antwort des Webhooks** zurück an die Plattform.

```
Plattform (Edge Function) ── POST ──▶ Webhook ──▶ Anfrage prüfen ──▶ Aufgabe wählen ─┬─▶ Agent Einzelanalyse ───┐
        ▲                                                                              └─▶ Agent Gesamtauswertung ┤
        │                                                                                                          ▼
        └────────── Antwort des Webhooks ◀── Antwort senden ◀── Antwort bündeln ◀── Zahlencheck ◀── Antwort lesen ◀──┘
```

Die Plattform schreibt **nichts** direkt aus n8n in die Datenbank. Sie nimmt die Antwort entgegen, lässt die **Datenbank jede Zahl prüfen** (Faktencheck, bei Abweichung bis zu zweimal neu fragen) und speichert dann als Entwurf. n8n braucht deshalb keinen Zugang zu Supabase.

## Aufgaben

| `aufgabe` | Strang | Was die Plattform damit macht |
|---|---|---|
| `einzelanalyse` | Agent Einzelanalyse | **Einzelanalyse** (ein Auftrag) und **Sammellauf** (bis zu 3 Aufträge in einer Anfrage, je Person einer) |
| `gesamtauswertung` | Agent Gesamtauswertung | **Gesamtauswertung** des Teams (ein Auftrag, nur Teamwerte) |

Der Agenten-Prompt (`system`) und die Daten (`nachricht`) kommen aus der Plattform. Der Prompt steht versioniert im Repo (`supabase/functions/analyse-erstellen/analyse.ts`). Alles darf zurzeit **nur der Admin** auslösen (Schalter `salons.ki_nur_admin`).

### Anfrage an den Webhook

```json
{
  "aufgabe": "einzelanalyse",
  "prompt_version": "analyse-v1",
  "auftraege": [
    { "ref": "1", "system": "…Prompt…", "nachricht": "Daten (JSON):\n{…}", "eingabe": { … } }
  ]
}
```

`ref` ordnet die Antwort zu (es ist nie eine Kennung aus der Datenbank). Die Daten enthalten keine Namen, keine E-Mail-Adressen und keine Kennungen.

### Antwort des Webhooks

```json
{
  "aufgabe": "einzelanalyse",
  "ergebnisse": [
    { "ref": "1", "code": 200, "ausgabe": { "zusammenfassung": "…", … }, "meta": { "hinweise": [], "zahlen_nicht_in_daten": [] } },
    { "ref": "2", "code": 502, "fehler": "Die KI ist nicht erreichbar oder hat nicht geantwortet.", "detail": "…" }
  ]
}
```

Ein Fehler bei einem Auftrag stoppt die anderen nicht. Ist **jeder** Auftrag gescheitert, steht das auch im Status der Antwort (`429` ausgelastet, sonst `502`). Unvollständige Anfragen beantwortet der Workflow mit `400` und den Gründen unter `details`.

## Dateien

| Datei | Zweck |
|---|---|
| `dawiid-ki.workflow.json` | Der Workflow zum Importieren in n8n |
| `testanfragen/` | Fertige Anfragen zum Testen: `einzelanalyse-anna`, `-berta`, `-ludwig` (drei Fälle), `sammellauf` (alle drei in einer Anfrage), `gesamtauswertung`. Daten aus der Testdatenbank, keine echten Personen. |
| `testanfragen-erzeugen.mjs` | Schreibt `system`, `nachricht` und `prompt_version` der Testanfragen neu, wenn sich ein Prompt ändert |
| `workflow.test.mjs` | Tests: `npm run test:n8n` |

Die Einzelfälle: **anna** hat alle Daten, **berta** keinen Vormonat und keine eigenen Kommentare, **ludwig** ein Verhalten ohne Selbstbild (prüft, ob der Agent fehlende Daten offen nennt).

## Einrichten

1. In n8n: **Workflows → Import from File** → `dawiid-ki.workflow.json`.
2. **Zugangsdaten** anlegen und an den Knoten auswählen:

   | Zugangsdaten | Typ | Inhalt | Knoten |
   |---|---|---|---|
   | DAWIID Webhook-Geheimnis | Header Auth | Name `x-webhook-secret`, Wert = selbst ausgedachtes Geheimnis (mindestens 24 Zeichen) | Webhook |
   | Anthropic | Anthropic (API Key) | dein Anthropic-Schlüssel | **beide** Knoten „Claude …“ |

   Die Zugangsdaten stehen bewusst nicht in der Datei.
3. **Einzeln testen** (siehe unten), dann den Workflow **aktivieren**.
4. In Supabase unter Edge Functions → Secrets setzen:

   | Secret | Wert |
   |---|---|
   | `AI_PROVIDER` | `webhook` |
   | `AI_WEBHOOK_URL` | die **Production URL** des Knotens Webhook (`…/webhook/dawiid-ki`, nicht `webhook-test`), muss `https` sein |
   | `AI_WEBHOOK_SECRET` | dasselbe Geheimnis wie in n8n |

5. In der Plattform als **Admin**: Leitung → Monatsabschluss → Monat abschließen → „Alle fehlenden erstellen“ (Sammellauf), je Person „Erstellen“ oder bei der Gesamtauswertung „Erstellen“.

Falls n8n beim Import einen Knoten nicht kennt (die KI-Knoten ändern sich von Version zu Version): den Agenten und das Claude-Modell neu hinzufügen und eintragen: Agent → *Source for Prompt*: Define below, *Prompt (User Message)* `{{ $json.nachricht }}`, *Options → System Message* `{{ $json.system }}`; Modell `claude-sonnet-5-5`, *Maximum Number of Tokens* 2000.

## Einzeln testen

**Im Editor (ohne Plattform):** Der Knoten **Webhook** hat die Anfrage `einzelanalyse-anna` angeheftet. **Execute workflow** läuft bis zum Agenten (kostet einen Aufruf). Jeden Knoten kannst du mit **Test step** für sich wiederholen:

| Knoten | Was du siehst |
|---|---|
| Anfrage prüfen | ein Item je Auftrag mit `strang`, `system`, `nachricht`; bei Fehlern `gueltig: false` und die Gründe |
| Agent … | die Antwort des Agenten (`output`) |
| Antwort lesen | `ausgabe` (das JSON mit den sechs Schlüsseln) und `meta.hinweise` (zum Beispiel „staerken: 5 Punkte (erwartet 2 bis 4)“) |
| Zahlencheck | `meta.zahlen_nicht_in_daten`: Zahlen, die nicht in den Daten stehen. Das ist eine Orientierung; maßgeblich ist der Faktencheck der Datenbank. |
| Antwort bündeln | die fertige Antwort an die Plattform |

Um **Sammellauf** oder **Gesamtauswertung** im Editor zu testen, die angeheftete Anfrage im Webhook-Knoten durch den Inhalt von `testanfragen/sammellauf.json` oder `gesamtauswertung.json` ersetzen.

**Über die URL (mit Geheimnis, wie es die Plattform macht):** Zuerst im Knoten Webhook die angeheftete Anfrage lösen (**Unpin**), sonst nimmt n8n sie statt auf deine zu warten. Dann **Execute workflow** klicken (der Test-Webhook wartet jetzt auf eine Anfrage) und senden:

```bash
curl -X POST "https://DEIN-N8N/webhook-test/dawiid-ki" \
  -H "x-webhook-secret: DEIN_GEHEIMNIS" \
  -H "content-type: application/json" \
  -d @n8n/testanfragen/gesamtauswertung.json
```

Nach dem Aktivieren dieselbe Anfrage an `…/webhook/dawiid-ki`. Ohne oder mit falschem Header lehnt n8n selbst ab (`401` oder `403`); die Plattform schreibt dann „Der KI-Zugang wurde abgelehnt. Bitte den Schlüssel in den Secrets prüfen.“

## Anpassen

- **Kontext für den Agenten:** Im Knoten **Anfrage prüfen** steht je Aufgabe `zusatzkontext`. Der Text wird dem Prompt aus der Plattform angehängt (zum Beispiel Besonderheiten des Salons). Keine Zahlen hineinschreiben: Der Faktencheck lehnt Zahlen ab, die nicht in den Daten stehen.
- **Modell und Länge:** am Knoten „Claude …“ je Strang. Das Modell ist dasselbe wie der Standard der Edge Function.
- **Neuer Strang** (eine weitere Aufgabe): in **Anfrage prüfen** die Aufgabe in `AUFGABEN` eintragen, in **Aufgabe wählen** eine Regel ergänzen, Agent und Claude-Modell kopieren, den Ausgang mit **Antwort lesen** verbinden. Auf der Plattform-Seite kommt die Aufgabe in die Edge Function.
- **Zeit:** Die Edge Function wartet je Anfrage höchstens 120 Sekunden auf n8n, insgesamt 135 Sekunden. Der Agent bearbeitet die Aufträge einer Anfrage nacheinander; deshalb schickt der Sammellauf höchstens 3 Personen je Anfrage (`PAKET_GROESSE` in `analyse.ts`) und die Oberfläche ruft so lange erneut auf, bis alle fertig sind.

## Datenschutz

Über n8n laufen dieselben Daten wie zur KI: Kennzahlen und Kommentare **ohne Namen und Absender**, bei der Gesamtauswertung nur Teamwerte und die **Zahl** der Kommentare. n8n ist damit eine zusätzliche Station.

- Der Workflow speichert erfolgreiche Ausführungen **nicht** (Einstellung im Export). Fehlerhafte Ausführungen und manuelle Testläufe speichert n8n; im Editor sind sie sichtbar. Wer das nicht möchte, schaltet es unter Workflow-Einstellungen → „Save failed production executions“ aus.
- Die Seite „Info und Datenschutz“ sagt bisher nur „an die KI“. Wenn n8n bei einem Dienstleister läuft, sollte das dort ergänzt werden.
