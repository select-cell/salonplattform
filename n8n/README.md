# n8n: ein Webhook für alle KI-Aufgaben (Einzelanalyse, Gesamtauswertung, Agenda)

Alle KI-Anfragen der Plattform laufen über **einen** Webhook. Die **Oberfläche** schickt sie aus dem Browser des Admins dorthin (ersatzweise die Edge Function `analyse-erstellen`, wenn der Browser den Webhook nicht erreicht), das Feld `aufgabe` entscheidet, in welchen **Strang** des Workflows die Anfrage läuft. In jedem Strang fragt ein Knoten **Claude …** die **Anthropic-API** (Modell Claude, Prompt und Daten aus der Plattform, mit dem Kontext je Aufgabe) für jeden Auftrag, und die Antwort geht **direkt als Antwort des Webhooks** zurück an die Plattform.

```
Plattform (Browser des Admins) ── POST ──▶ Webhook ──▶ Anmeldung prüfen ──▶ Angemeldet? ──▶ Anfrage prüfen ──▶ Aufgabe wählen ─┬─▶ Claude Einzelanalyse ───┐
        ▲                                                       (bei Supabase)       └─ nein: 401                                  ├─▶ Claude Gesamtauswertung ┤
        │                                                                                                                          └─▶ Claude Agenda           ┤
        │                                                                                                                                                      ▼
        └────────── Antwort des Webhooks ◀── Antwort senden ◀── Antwort bündeln ◀── Zahlencheck ◀── Antwort lesen ◀───────────────────────────────────────────┘
```

Die Plattform schreibt **nichts** direkt aus n8n in die Datenbank. Sie nimmt die Antwort entgegen, lässt die **Datenbank jede Zahl prüfen** (Faktencheck, bei Abweichung bis zu zweimal neu fragen) und speichert dann als Entwurf. n8n braucht deshalb keinen Zugang zu Supabase, nur die öffentliche Adresse, bei der es eine Anmeldung bestätigen lässt (siehe „Wer darf den Webhook aufrufen?“).

Wer die Eingabe bekommt (nur der Admin), ob jede Zahl stimmt und wer speichert, entscheiden weiter die Datenbankfunktionen mit der Anmeldung des Admins. Der Browser ruft sie selbst auf (`src/lib/ki.ts`, dieselbe Logik wie die Edge Function). Nur die Eingabe ohne Namen und ohne Kommentartexte geht an n8n.

### Wer darf den Webhook aufrufen?

Der Webhook steht im Internet, und die Adresse steckt im Code. Deshalb schickt die Plattform bei jedem Aufruf die **Anmeldung des Admins** mit (`Authorization: Bearer …`). Der Knoten **Anmeldung prüfen** lässt sie bei Supabase bestätigen (`/auth/v1/user`). Ohne gültige Anmeldung antwortet der Webhook mit `401`, bevor etwas an die KI geht und Kosten entstehen. Es gibt kein gemeinsames Geheimnis, das irgendwo hinterlegt werden müsste. Im Editor-Test (*Execute workflow*) entfällt die Prüfung.

Der Webhook erlaubt Aufrufe aus dem Browser (*Allowed Origins (CORS)* = `*`). Das ist unkritisch, weil die Anmeldung geprüft wird; wer will, trägt statt `*` die Adresse der Plattform (Netlify) ein.

## Aufgaben

| `aufgabe` | Strang | Was die Plattform damit macht |
|---|---|---|
| `einzelanalyse` | Claude Einzelanalyse | **Einzelanalyse** (ein Auftrag) und **Sammellauf** (bis zu 2 Aufträge in einer Anfrage, je Person einer) |
| `gesamtauswertung` | Claude Gesamtauswertung | **Gesamtauswertung** des Teams (ein Auftrag, nur Teamwerte) |
| `agenda` | Claude Agenda | **Agenda** fürs Teammeeting (ein Auftrag: fünf Blöcke, 15 bis 20 Minuten, nur Teamwerte). Die Vorlage ohne KI bleibt daneben bestehen. |

Der Prompt (`system`) und die Daten (`nachricht`) kommen aus der Plattform. Der Prompt steht versioniert im Repo (`supabase/functions/analyse-erstellen/analyse.ts`). Alles darf zurzeit **nur der Admin** auslösen (Schalter `salons.ki_nur_admin`).

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

Die Einzelfälle: **anna** hat alle Daten, **berta** keinen Vormonat und keine eigenen Kommentare, **ludwig** ein Verhalten ohne Selbstbild (prüft, ob die KI fehlende Daten offen nennt).

## Einrichten

1. In n8n: **Workflows → Import from File** → `dawiid-ki.workflow.json`.
2. **Zugangsdaten** anlegen und auswählen: **Anthropic** (API Key), dein Anthropic-Schlüssel, an **allen drei** Knoten „Claude …“ (dort steht *Authentication: Predefined Credential Type* mit *Anthropic*; fehlt die Auswahl in deiner n8n-Version, nimm *Generic Credential Type → Header Auth* mit Name `x-api-key` und deinem Schlüssel). Mehr ist nicht nötig; die Zugangsdaten stehen bewusst nicht in der Datei.
3. **Einzeln testen** (siehe unten), dann den Workflow **aktivieren** (Schalter oben rechts). Aufgerufen wird die **Production URL** `https://tobitest2008.app.n8n.cloud/webhook/dawiid-ki` (nicht `webhook-test`).
4. **Die Adresse steht fest im Code** (`STANDARD_WEBHOOK_URL` in `supabase/functions/analyse-erstellen/analyse.ts`, die Oberfläche übernimmt sie von dort). Ändert sich die Adresse, ändert man diese eine Zeile. In Supabase ist **nichts** einzutragen. Optional überschreibt das Secret `AI_WEBHOOK_URL` die Adresse für den Weg über die Edge Function.

   Läuft in der Plattform etwas schief, hilft der Weg über die Edge Function zum Vergleichen: Im Browser (Konsole) `localStorage.setItem('dawiid-ki-weg', 'edge')` und die Seite neu laden; zurück mit `localStorage.removeItem('dawiid-ki-weg')`.

5. In der Plattform als **Admin**: Leitung → Monatsabschluss → Monat abschließen → „Alle fehlenden erstellen“ (Sammellauf), je Person „Erstellen“ oder bei der Gesamtauswertung „Erstellen“. Die Agenda: Leitung → Agenda → „Mit KI formulieren“.

Die Knoten „Claude …“ sind gewöhnliche **HTTP Request**-Knoten, die die Anthropic-API (`POST https://api.anthropic.com/v1/messages`) direkt aufrufen. Das gibt die Antwort vollständig zurück und verrät in `meta.stop_reason`, ob sie zu Ende war. (Ein früherer Stand benutzte den KI-Agenten-Knoten von n8n; der lieferte den Text in Stücken mit Zeilenumbrüchen mitten in Wörtern, abgeschnitten oder leer.) Modell, `max_tokens` (4096) und `temperature` (0.3) stehen im Feld *JSON Body* der drei Knoten.

## Einzeln testen: Schritt für Schritt

Die Dateien in `testanfragen/` sind **keine Workflows**. Es sind Beispielanfragen, so wie die Plattform sie an den Webhook schickt. Du fügst sie in den Test ein, der Workflow bearbeitet sie.

**Vorher (einmal):** Workflow importieren und an **allen drei** Knoten „Claude …“ deine Anthropic-Zugangsdaten auswählen. Jeder Testlauf ruft die echte KI auf und kostet ein paar Cent (der Sammellauf zwei Aufrufe).

### Weg A: im Editor (zum Anfangen, ohne Geheimnis und ohne URL)

1. Workflow öffnen und auf den Knoten **Webhook** doppelklicken. Rechts unter *Output* steht eine angeheftete Beispielanfrage (Pin-Symbol).
2. Dort auf das Stift-Symbol (*Edit*) klicken. Je nach n8n-Version heißt es auch „Edit Output“. Den ganzen Inhalt der gewählten Testdatei einfügen (alles markieren, ersetzen) und speichern. Der Workflow nimmt die Datei direkt oder verpackt unter `body`.
3. Fenster schließen und unten auf **Execute workflow** klicken.
4. Nach dem Lauf auf die Knoten klicken und rechts die Ausgabe ansehen. Jeden Knoten kannst du mit *Test step* für sich wiederholen.

### Weg B: über die URL (so, wie die Plattform es macht)

Der Webhook verlangt eine gültige Anmeldung, auch beim Aufruf von Hand. Du brauchst dazu den Zugangstoken einer angemeldeten Person: in der Plattform angemeldet im Browser die Konsole öffnen und `JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('-auth-token')))).access_token` ausführen (der Token gilt etwa eine Stunde und gehört niemandem außer dir).

1. Im Knoten Webhook die angeheftete Anfrage lösen (**Unpin**), sonst nimmt n8n sie statt auf deine zu warten.
2. Im Editor auf **Execute workflow** klicken: Der Test-Webhook wartet jetzt auf eine Anfrage. Die **Test URL** steht im Knoten Webhook. (Im Test entfällt die Anmeldeprüfung.)
3. Aus einem Terminal senden (oder in Postman/Insomnia: POST, Header `authorization: Bearer <Token>` und `content-type: application/json`, Body = Dateiinhalt):

```bash
curl -X POST "https://tobitest2008.app.n8n.cloud/webhook-test/dawiid-ki" \
  -H "authorization: Bearer DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d @n8n/testanfragen/gesamtauswertung.json
```

4. Das Ergebnis erscheint im Terminal und im Editor. Nach dem Aktivieren des Workflows dieselbe Anfrage an die **Production URL** (`…/webhook/dawiid-ki`). Ohne oder mit abgelaufenem Token antwortet der Workflow mit `401` und `{"ok":false,"fehler":"Bitte melde dich an."}`.

### Was du mit welcher Datei prüfst

| Datei | Strang | Darauf achten |
|---|---|---|
| `einzelanalyse-anna` | Claude Einzelanalyse | Normalfall. `ausgabe` hat sechs Schlüssel, `meta.hinweise` ist leer, `meta.zahlen_nicht_in_daten` ist leer. |
| `einzelanalyse-berta` | Claude Einzelanalyse | **Kein Vormonat.** Der Text soll das offen sagen und keine Veränderung erfinden. |
| `einzelanalyse-ludwig` | Claude Einzelanalyse | **Ein Verhalten ohne Selbstbild.** Der Text soll das offen sagen. |
| `sammellauf` | Claude Einzelanalyse, dreimal | Die Antwort hat drei `ergebnisse` mit `ref` 1, 2 und 3, jedes mit eigener Analyse. |
| `gesamtauswertung` | Claude Gesamtauswertung | Der Text spricht vom „Team“, ohne Namen und ohne Einzelpersonen. |
| `agenda` | Claude Agenda | Fünf Blöcke in der Reihenfolge einstieg, kennzahlen, fokus, entwicklung, vereinbarungen. `meta.hinweise` ist leer: Minuten innerhalb der Grenzen, Summe 15 bis 20, zwei bis vier Punkte je Block. |

### Woran du merkst, dass etwas nicht stimmt

| Beobachtung | Bedeutung und Abhilfe |
|---|---|
| Antwort `401` „Bitte melde dich an.“ | Der Token fehlt oder ist abgelaufen (neu anmelden), oder der Knoten **Anmeldung prüfen** erreicht Supabase nicht. In der Plattform steht dann „Der KI-Zugang wurde abgelehnt.“ |
| Im Browser „Failed to fetch“, in der Plattform läuft es über die Edge Function | n8n erlaubt den Aufruf aus dem Browser nicht (CORS). Im Knoten Webhook unter *Options* muss *Allowed Origins (CORS)* gesetzt sein (Standard im Import: `*`). Die Plattform nimmt dann selbstständig den Weg über die Edge Function. |
| Ausführung bricht beim Webhook ab oder die Antwort ist `400` mit `details` | Die Anfrage ist unvollständig (zum Beispiel nur ein Teil der Datei eingefügt). Datei komplett einfügen. |
| Knoten „Claude …“ rot, Fehler zu Zugangsdaten | Anthropic-Zugangsdaten am Knoten „Claude …“ des **benutzten** Strangs auswählen (es sind zwei). |
| `meta.hinweise`: „abgeschnitten (stop_reason max_tokens)“ | Die Antwort war länger als erlaubt. Im Knoten „Claude …“ im *JSON Body* `max_tokens` erhöhen (Standard 4096; `meta.ausgabe_token` zeigt, wie viel verbraucht wurde). Die Plattform fragt bis zu dreimal neu und bittet dann um eine kürzere Fassung. |
| Antwort enthält Zeilenumbrüche mitten in Wörtern („Fe↵edback“) | Der Text kam in Stücken an (so lieferte es der frühere KI-Agenten-Knoten). Die Plattform und der Knoten „Antwort lesen“ entfernen solche Umbrüche beim Lesen; es ist nichts einzustellen. |
| `code: 502` mit `detail` im Ergebnis | Die KI hat nicht geantwortet (Zeit, Schlüssel, Modellname). `detail` nennt den Grund der Anthropic-API, zum Beispiel `authentication_error: invalid x-api-key`. |
| `code: 429` | Anthropic ist ausgelastet, später erneut. |
| `meta.hinweise` nennt „kein gültiges JSON“ | Die KI hat kein JSON geliefert. Die Plattform fragt dann selbst noch bis zu zweimal nach. Tritt es dauernd auf, den Prompt prüfen. |
| `meta.zahlen_nicht_in_daten` nicht leer | Die KI hat eine Zahl genannt, die nicht in den Daten steht. In der Plattform verlangt die Datenbank dann eine neue Fassung. Kommt es oft vor, im Prompt nachschärfen. |
| `meta.hinweise` nennt „staerken: 5 Punkte (erwartet 2 bis 4)“ | Nur ein Hinweis zur Länge, kein Fehler. |

## Anpassen

- **Kontext für die KI:** Im Knoten **Anfrage prüfen** steht je Aufgabe `zusatzkontext`. Der Text wird dem Prompt aus der Plattform angehängt (zum Beispiel Besonderheiten des Salons). Keine Zahlen hineinschreiben: Der Faktencheck lehnt Zahlen ab, die nicht in den Daten stehen.
- **Modell und Länge:** am Knoten „Claude …“ je Strang. Das Modell ist dasselbe wie der Standard der Edge Function.
- **Neuer Strang** (eine weitere Aufgabe): in **Anfrage prüfen** die Aufgabe in `AUFGABEN` eintragen, in **Aufgabe wählen** eine Regel ergänzen, einen Knoten „Claude …“ kopieren, den Ausgang mit **Antwort lesen** verbinden. Auf der Plattform-Seite kommt die Aufgabe in die Edge Function.
- **Zeit:** Die Edge Function wartet je Anfrage höchstens 120 Sekunden auf n8n, insgesamt 135 Sekunden. Die Knoten „Claude …“ schicken die Aufträge einer Anfrage gleichzeitig los (*Batching*), bei langsamer KI kann es trotzdem knapp werden; deshalb schickt der Sammellauf höchstens 2 Personen je Anfrage (`PAKET_GROESSE` in `analyse.ts`; n8n Cloud beendet Anfragen nach etwa 100 Sekunden) und die Oberfläche ruft so lange erneut auf, bis alle fertig sind.

## Datenschutz

Über n8n laufen dieselben Daten wie zur KI: Kennzahlen und Kommentare **ohne Namen und Absender**, bei der Gesamtauswertung nur Teamwerte und die **Zahl** der Kommentare. n8n ist damit eine zusätzliche Station.

- Der Workflow speichert erfolgreiche Ausführungen **nicht** (Einstellung im Export). Fehlerhafte Ausführungen und manuelle Testläufe speichert n8n; im Editor sind sie sichtbar. Wer das nicht möchte, schaltet es unter Workflow-Einstellungen → „Save failed production executions“ aus.
- Die Seite „Info und Datenschutz“ sagt bisher nur „an die KI“. Wenn n8n bei einem Dienstleister läuft, sollte das dort ergänzt werden.
