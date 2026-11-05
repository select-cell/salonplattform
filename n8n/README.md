# n8n: KI-Automation für die Einzelanalyse

Diese Plattform hat genau **eine** KI-Automation: die Einzelanalyse (Leitung → Monatsabschluss). Sie läuft so:

```
Plattform (Edge Function analyse-erstellen) → n8n-Webhook → Claude → Webhook-Antwort → Plattform
```

Die Plattform baut die Eingabe (ohne Namen), n8n lässt Claude den Text formulieren, die **Datenbank prüft danach jede Zahl** (Faktencheck). Bei Abweichungen fragt die Edge Function bis zu zweimal nach (höchstens drei Aufrufe je Analyse).

Die Agenda (Leitung → Agenda) entsteht **ohne KI**. Jarvis (Phase 6) ist noch nicht gebaut.

## Dateien

| Datei | Zweck |
|---|---|
| `dawiid-analyse.workflow.json` | Der Workflow zum Importieren in n8n |
| `testanfragen/anna.json`, `berta.json`, `ludwig.json` | Drei Beispielanfragen mit Daten aus der Datenbank (Testdaten, keine echten Personen) |
| `testanfragen-erzeugen.mjs` | Schreibt `system` und `nachricht` der Testanfragen neu, wenn sich der Prompt ändert |
| `workflow.test.mjs` | Tests: `npm run test:n8n` |

Die drei Testfälle:

- **anna**: alles da (Selbst- und Fremdbild, Vormonat, eigene und fremde Kommentare, Selbstüberschätzung).
- **berta**: ohne Vormonat, ohne eigene Kommentare, Selbstunterschätzung.
- **ludwig**: ein Verhalten ohne Selbstbild, keine Entwicklungsnennung. Prüft, ob Claude fehlende Daten offen sagt.

## Einrichten

1. In n8n: **Workflows → Import from File** → `dawiid-analyse.workflow.json`.
2. **Zugangsdaten** anlegen (Typ **Header Auth**) und an den Knoten auswählen:

   | Name in n8n | Header-Name | Wert | Knoten |
   |---|---|---|---|
   | DAWIID Webhook-Geheimnis | `x-webhook-secret` | selbst ausgedacht, mindestens 24 Zeichen | Webhook |
   | Anthropic API Key | `x-api-key` | dein Anthropic-Schlüssel | Bei Claude anfragen |

   Die Zugangsdaten stehen bewusst nicht in der Datei.
3. **Einzeln testen** (siehe unten), dann den Workflow **aktivieren**.
4. In Supabase unter Edge Functions → Secrets setzen:

   | Secret | Wert |
   |---|---|
   | `AI_PROVIDER` | `webhook` |
   | `AI_WEBHOOK_URL` | die **Production URL** des Knotens Webhook (`…/webhook/dawiid-analyse`, nicht `webhook-test`), muss `https` sein |
   | `AI_WEBHOOK_SECRET` | dasselbe Geheimnis wie in n8n |

5. In der Plattform: Leitung → Monatsabschluss → Monat abschließen → „Erstellen“.

## Einzeln testen

**Im Editor (ohne Plattform):** Der Knoten **Webhook** hat die Anfrage `anna` angeheftet. **Execute workflow** startet alles bis Claude. Jeden Knoten kannst du mit **Test step** für sich wiederholen:

| Knoten | Was du siehst |
|---|---|
| Anfrage prüfen | `gueltig: true`, `system`, `nachricht`. Zum Testen die angeheftete Anfrage im Webhook-Knoten durch `berta` oder `ludwig` ersetzen (Inhalt der Datei einfügen). |
| Bei Claude anfragen | die rohe Antwort von Anthropic (kostet einen Aufruf) |
| Antwort lesen | `body.ausgabe` (das JSON mit den sechs Schlüsseln) und `body.meta.hinweise` (zum Beispiel „staerken: 5 Punkte (erwartet 2 bis 4)“) |
| Zahlencheck | `body.meta.zahlen_nicht_in_daten`: Zahlen, die nicht in den Daten stehen. Das ist eine Orientierung; maßgeblich ist der Faktencheck der Datenbank. |

**Über die URL (mit Geheimnis, wie es die Plattform macht):** Zuerst im Knoten Webhook die angeheftete Anfrage lösen (**Unpin**), sonst nimmt n8n die angeheftete Anfrage statt auf deine zu warten. Dann **Execute workflow** klicken (der Test-Webhook wartet jetzt auf eine Anfrage) und senden:

```bash
curl -X POST "https://DEIN-N8N/webhook-test/dawiid-analyse" \
  -H "x-webhook-secret: DEIN_GEHEIMNIS" \
  -H "content-type: application/json" \
  -d @n8n/testanfragen/berta.json
```

Nach dem Aktivieren dieselbe Anfrage an `…/webhook/dawiid-analyse`. Erwartet: Status `200` und ein JSON mit `ausgabe` und `meta`. Ohne oder mit falschem Header lehnt n8n selbst ab (`401` oder `403`); bei unvollständiger Anfrage antwortet der Workflow mit `400`.

Probleme von Anthropic meldet der Workflow als `502` (Schlüssel falsch, abgelehnt, nicht erreichbar) oder `429` (ausgelastet), mit Einzelheiten unter `detail`. Ein `401/403` kommt nur von n8n, wenn das Geheimnis nicht stimmt; die Plattform schreibt dann „Der KI-Zugang wurde abgelehnt. Bitte den Schlüssel in den Secrets prüfen.“

## Was der Workflow tut und nicht tut

- Er schickt `system` und `nachricht` der Plattform **unverändert** an Claude. Der Prompt steht im Repo (`SYSTEM_PROMPT` in `supabase/functions/analyse-erstellen/analyse.ts`). Wer ihn ändert, erhöht dort `PROMPT_VERSION` und führt danach `node n8n/testanfragen-erzeugen.mjs` aus.
- Zum Ausprobieren eines anderen Prompts gibt es im Knoten **Anfrage prüfen** die Zeile `SYSTEM_UEBERSCHREIBEN`. Danach wieder leer lassen, sonst weicht der Workflow vom Repo ab.
- Modell (`claude-sonnet-5-5`) und `MAX_TOKENS` (2000) stehen oben im Knoten **Anfrage prüfen**. Das Modell ist dasselbe wie der Standard der Edge Function.
- Die Antwort an die Plattform ist `{ "ausgabe": {…}, "meta": {…} }`. Die Plattform liest nur `ausgabe`; `meta` ist für dich.
- Liefert Claude kein gültiges JSON, geht der Text unverändert zurück. Die Plattform fragt dann selbst noch einmal nach.
- Zeitgrenze: Die Edge Function wartet höchstens 90 Sekunden, der Aufruf an Anthropic bricht nach 75 Sekunden ab.

## Datenschutz

Über n8n laufen dieselben Daten wie zur KI: Kennzahlen und Kommentare **ohne Namen und Absender**. n8n ist damit eine zusätzliche Station.

- Der Workflow speichert erfolgreiche Ausführungen **nicht** (Einstellung im Export). Fehlerhafte Ausführungen und manuelle Testläufe speichert n8n; im Editor sind sie sichtbar. Wer das nicht möchte, schaltet es unter Workflow-Einstellungen → „Save failed production executions“ aus.
- Die Seite „Info und Datenschutz“ sagt bisher nur „an die KI“. Wenn n8n bei einem Dienstleister läuft, sollte das dort ergänzt werden.
