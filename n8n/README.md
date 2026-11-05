# n8n: ein Webhook für alle KI-Aufgaben (Einzelanalyse, Gesamtauswertung, Agenda)

Alle KI-Anfragen der Plattform laufen über **einen** Webhook. Die Edge Function `analyse-erstellen` schickt sie dorthin, das Feld `aufgabe` entscheidet, in welchen **Strang** des Workflows die Anfrage läuft. In jedem Strang bearbeitet ein **KI-Agent** (Claude über die Anthropic-API, mit Kontext) die Aufträge, und die Antwort geht **direkt als Antwort des Webhooks** zurück an die Plattform.

```
Plattform (Edge Function) ── POST ──▶ Webhook ──▶ Anfrage prüfen ──▶ Aufgabe wählen ─┬─▶ Agent Einzelanalyse ───┐
        ▲                                                                              ├─▶ Agent Gesamtauswertung ┤
        │                                                                              └─▶ Agent Agenda           ┤
        │                                                                                                          ▼
        └────────── Antwort des Webhooks ◀── Antwort senden ◀── Antwort bündeln ◀── Zahlencheck ◀── Antwort lesen ◀──┘
```

Die Plattform schreibt **nichts** direkt aus n8n in die Datenbank. Sie nimmt die Antwort entgegen, lässt die **Datenbank jede Zahl prüfen** (Faktencheck, bei Abweichung bis zu zweimal neu fragen) und speichert dann als Entwurf. n8n braucht deshalb keinen Zugang zu Supabase.

## Aufgaben

| `aufgabe` | Strang | Was die Plattform damit macht |
|---|---|---|
| `einzelanalyse` | Agent Einzelanalyse | **Einzelanalyse** (ein Auftrag) und **Sammellauf** (bis zu 2 Aufträge in einer Anfrage, je Person einer) |
| `gesamtauswertung` | Agent Gesamtauswertung | **Gesamtauswertung** des Teams (ein Auftrag, nur Teamwerte) |
| `agenda` | Agent Agenda | **Agenda** fürs Teammeeting (ein Auftrag: fünf Blöcke, 15 bis 20 Minuten, nur Teamwerte). Die Vorlage ohne KI bleibt daneben bestehen. |

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
| `testanfragen/` | Fertige Anfragen zum Testen: `einzelanalyse-anna`, `-berta`, `-ludwig` (drei Fälle), `sammellauf` (alle drei in einer Anfrage), `gesamtauswertung`, `agenda`. Daten aus der Testdatenbank, keine echten Personen. |
| `testanfragen-erzeugen.mjs` | Schreibt `system`, `nachricht` und `prompt_version` der Testanfragen neu, wenn sich ein Prompt ändert |
| `workflow.test.mjs` | Tests: `npm run test:n8n` |

Die Einzelfälle: **anna** hat alle Daten, **berta** keinen Vormonat und keine eigenen Kommentare, **ludwig** ein Verhalten ohne Selbstbild (prüft, ob der Agent fehlende Daten offen nennt).

## Einrichten

1. In n8n: **Workflows → Import from File** → `dawiid-ki.workflow.json`.
2. **Zugangsdaten** anlegen und an den Knoten auswählen:

   | Zugangsdaten | Typ | Inhalt | Knoten |
   |---|---|---|---|
   | DAWIID Webhook-Geheimnis | Header Auth | Name `x-webhook-secret`, Wert = selbst ausgedachtes Geheimnis (mindestens 24 Zeichen) | Webhook |
   | Anthropic | Anthropic (API Key) | dein Anthropic-Schlüssel | **alle drei** Knoten „Claude …“ |

   Die Zugangsdaten stehen bewusst nicht in der Datei.
3. **Einzeln testen** (siehe unten), dann den Workflow **aktivieren**.
4. **Die Adresse des Webhooks steht fest im Code** (`STANDARD_WEBHOOK_URL` in `supabase/functions/analyse-erstellen/analyse.ts`): `https://tobitest2008.app.n8n.cloud/webhook/dawiid-ki`. Dafür braucht es kein Secret und keinen Eintrag in Supabase. Ändert sich die Adresse, ändert man diese eine Zeile (oder setzt in Supabase optional `AI_WEBHOOK_URL`, das hat Vorrang).

   Nur das **Geheimnis** gehört nicht in den Code, weil es im Repository sichtbar würde. Es ist der einzige Wert in Supabase (Edge Functions → Secrets):

   | Secret | Wert |
   |---|---|
   | `AI_WEBHOOK_SECRET` | dasselbe Geheimnis wie in n8n (Header Auth) |

   Ohne dieses Secret schickt die Plattform keinen Schlüssel mit; n8n lehnt die Anfrage dann ab („Der KI-Zugang wurde abgelehnt“). Soll der Webhook bewusst ohne Schlüssel laufen (nur zum Testen), im Knoten Webhook die Authentifizierung auf *None* stellen. Dann kann jeder, der die Adresse kennt, den Workflow auslösen und deine Anthropic-Kosten verursachen. Für den Betrieb also nicht empfohlen.

5. In der Plattform als **Admin**: Leitung → Monatsabschluss → Monat abschließen → „Alle fehlenden erstellen“ (Sammellauf), je Person „Erstellen“ oder bei der Gesamtauswertung „Erstellen“. Die Agenda: Leitung → Agenda → „Mit KI formulieren“.

Falls n8n beim Import einen Knoten nicht kennt (die KI-Knoten ändern sich von Version zu Version): den Agenten und das Claude-Modell neu hinzufügen und eintragen: Agent → *Source for Prompt*: Define below, *Prompt (User Message)* `{{ $json.nachricht }}`, *Options → System Message* `{{ $json.system }}`; Modell `claude-sonnet-5-5`, *Maximum Number of Tokens* 2000.

## Einzeln testen: Schritt für Schritt

Die Dateien in `testanfragen/` sind **keine Workflows**. Es sind Beispielanfragen, so wie die Plattform sie an den Webhook schickt. Du fügst sie in den Test ein, der Workflow bearbeitet sie.

**Vorher (einmal):** Workflow importieren und an **allen drei** Knoten „Claude …“ deine Anthropic-Zugangsdaten auswählen. Jeder Testlauf ruft die echte KI auf und kostet ein paar Cent (der Sammellauf zwei Aufrufe).

### Weg A: im Editor (zum Anfangen, ohne Geheimnis und ohne URL)

1. Workflow öffnen und auf den Knoten **Webhook** doppelklicken. Rechts unter *Output* steht eine angeheftete Beispielanfrage (Pin-Symbol).
2. Dort auf das Stift-Symbol (*Edit*) klicken. Je nach n8n-Version heißt es auch „Edit Output“. Den ganzen Inhalt der gewählten Testdatei einfügen (alles markieren, ersetzen) und speichern. Der Workflow nimmt die Datei direkt oder verpackt unter `body`.
3. Fenster schließen und unten auf **Execute workflow** klicken.
4. Nach dem Lauf auf die Knoten klicken und rechts die Ausgabe ansehen. Jeden Knoten kannst du mit *Test step* für sich wiederholen.

### Weg B: über die URL (so, wie die Plattform es macht, mit Geheimnis)

1. Im Knoten Webhook die angeheftete Anfrage lösen (**Unpin**), sonst nimmt n8n sie statt auf deine zu warten.
2. Im Editor auf **Execute workflow** klicken: Der Test-Webhook wartet jetzt auf eine Anfrage. Die **Test URL** steht im Knoten Webhook.
3. Aus einem Terminal senden (oder in Postman/Insomnia: POST, Header `x-webhook-secret` und `content-type: application/json`, Body = Dateiinhalt):

```bash
curl -X POST "https://DEIN-N8N/webhook-test/dawiid-ki" \
  -H "x-webhook-secret: DEIN_GEHEIMNIS" \
  -H "content-type: application/json" \
  -d @n8n/testanfragen/gesamtauswertung.json
```

4. Das Ergebnis erscheint im Terminal und im Editor. Nach dem Aktivieren des Workflows dieselbe Anfrage an die **Production URL** (`…/webhook/dawiid-ki`). Ohne oder mit falschem Header lehnt n8n selbst ab (`401` oder `403`).

### Was du mit welcher Datei prüfst

| Datei | Strang | Darauf achten |
|---|---|---|
| `einzelanalyse-anna` | Agent Einzelanalyse | Normalfall. `ausgabe` hat sechs Schlüssel, `meta.hinweise` ist leer, `meta.zahlen_nicht_in_daten` ist leer. |
| `einzelanalyse-berta` | Agent Einzelanalyse | **Kein Vormonat.** Der Text soll das offen sagen und keine Veränderung erfinden. |
| `einzelanalyse-ludwig` | Agent Einzelanalyse | **Ein Verhalten ohne Selbstbild.** Der Text soll das offen sagen. |
| `sammellauf` | Agent Einzelanalyse, dreimal | Die Antwort hat drei `ergebnisse` mit `ref` 1, 2 und 3, jedes mit eigener Analyse. |
| `gesamtauswertung` | Agent Gesamtauswertung | Der Text spricht vom „Team“, ohne Namen und ohne Einzelpersonen. |
| `agenda` | Agent Agenda | Fünf Blöcke in der Reihenfolge einstieg, kennzahlen, fokus, entwicklung, vereinbarungen. `meta.hinweise` ist leer: Minuten innerhalb der Grenzen, Summe 15 bis 20, zwei bis vier Punkte je Block. |

### Woran du merkst, dass etwas nicht stimmt

| Beobachtung | Bedeutung und Abhilfe |
|---|---|
| Ausführung bricht beim Webhook ab oder die Antwort ist `400` mit `details` | Die Anfrage ist unvollständig (zum Beispiel nur ein Teil der Datei eingefügt). Datei komplett einfügen. |
| Agent-Knoten rot, Fehler zu Zugangsdaten | Anthropic-Zugangsdaten am Knoten „Claude …“ des **benutzten** Strangs auswählen (es sind zwei). |
| `code: 502` mit `detail` im Ergebnis | Der Agent hat nicht geantwortet (Zeit, Schlüssel, Modellname). `detail` nennt den Grund. |
| `code: 429` | Anthropic ist ausgelastet, später erneut. |
| `meta.hinweise` nennt „kein gültiges JSON“ | Der Agent hat kein JSON geliefert. Die Plattform fragt dann selbst noch bis zu zweimal nach. Tritt es dauernd auf, den Prompt prüfen. |
| `meta.zahlen_nicht_in_daten` nicht leer | Der Agent hat eine Zahl genannt, die nicht in den Daten steht. In der Plattform verlangt die Datenbank dann eine neue Fassung. Kommt es oft vor, im Prompt nachschärfen. |
| `meta.hinweise` nennt „staerken: 5 Punkte (erwartet 2 bis 4)“ | Nur ein Hinweis zur Länge, kein Fehler. |

## Anpassen

- **Kontext für den Agenten:** Im Knoten **Anfrage prüfen** steht je Aufgabe `zusatzkontext`. Der Text wird dem Prompt aus der Plattform angehängt (zum Beispiel Besonderheiten des Salons). Keine Zahlen hineinschreiben: Der Faktencheck lehnt Zahlen ab, die nicht in den Daten stehen.
- **Modell und Länge:** am Knoten „Claude …“ je Strang. Das Modell ist dasselbe wie der Standard der Edge Function.
- **Neuer Strang** (eine weitere Aufgabe): in **Anfrage prüfen** die Aufgabe in `AUFGABEN` eintragen, in **Aufgabe wählen** eine Regel ergänzen, Agent und Claude-Modell kopieren, den Ausgang mit **Antwort lesen** verbinden. Auf der Plattform-Seite kommt die Aufgabe in die Edge Function.
- **Zeit:** Die Edge Function wartet je Anfrage höchstens 120 Sekunden auf n8n, insgesamt 135 Sekunden. Der Agent bearbeitet die Aufträge einer Anfrage nacheinander; deshalb schickt der Sammellauf höchstens 2 Personen je Anfrage (`PAKET_GROESSE` in `analyse.ts`; n8n Cloud beendet Anfragen nach etwa 100 Sekunden) und die Oberfläche ruft so lange erneut auf, bis alle fertig sind.

## Datenschutz

Über n8n laufen dieselben Daten wie zur KI: Kennzahlen und Kommentare **ohne Namen und Absender**, bei der Gesamtauswertung nur Teamwerte und die **Zahl** der Kommentare. n8n ist damit eine zusätzliche Station.

- Der Workflow speichert erfolgreiche Ausführungen **nicht** (Einstellung im Export). Fehlerhafte Ausführungen und manuelle Testläufe speichert n8n; im Editor sind sie sichtbar. Wer das nicht möchte, schaltet es unter Workflow-Einstellungen → „Save failed production executions“ aus.
- Die Seite „Info und Datenschutz“ sagt bisher nur „an die KI“. Wenn n8n bei einem Dienstleister läuft, sollte das dort ergänzt werden.
