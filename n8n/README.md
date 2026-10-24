# n8n-Workflow „Anfragen“

Ein Webhook für alle Anfragen: prüfen, an Telegram senden, in Supabase speichern. Der Workflow entsteht in n8n; die schwierige Logik (Prüfen, Sperre, Doppelung, Notkarte, Nachrichtentext) liegt getestet in [`anfrage-entscheiden.cjs`](anfrage-entscheiden.cjs) und wird in einen Code-Node kopiert.

```bash
node --test n8n/*.test.mjs   # 47 Tests für den Code-Node
```

## Aufbau

```
Webhook ─► Plaetze laden ─► Artikel laden ─► Letzte Anfrage am Platz ─► Doppelte Anfrage pruefen ─► Entscheiden ─► Senden?
                                                                                                                │ ja
                                              ┌─────────────────────────────────────────────────────────────────┤
                                              │ oben:  Telegram senden ─► Antwort ok                            │
                                              │ unten: Anfrage speichern ─► Positionen vorbereiten ─►           │
                                              │        Positionen speichern ─► Speicherfehler melden            │
                                              └─────────────────────────────────────────────────────────────────┤
                                                                                                                │ nein
                                                                                                    Antwort (Sperre, Doppelung, ungültig)
```

Die Namen der Nodes müssen **genau** so heißen, der Code-Node liest sie darüber.

## Vorher anlegen

- **Credential „Supabase API“:** Host `https://hgtvlcucxzksvmvgvbgo.supabase.co`, als Key den Service-Key. Am besten ein eigener Secret-Key nur für n8n (Supabase → Project Settings → API Keys), den Du einzeln widerrufen kannst. Der Key steht nur hier, nie in einem Node, nie im Frontend.
- **Credential „Telegram API“:** Token vom @BotFather.
- **Telegram-Gruppe nur für Anfragen** mit dem Bot und dem Team. Die Chat-ID ist eine negative Zahl (wird die Gruppe zur Supergruppe, ändert sie sich auf `-100…`).
- Workflow-Einstellung **Execution Order: v1** (Standard in neuen Workflows). Der obere Zweig läuft dadurch zuerst.

## Die Nodes

**1. `Webhook`** · POST · Path `anfrage` · *Respond:* Using ‘Respond to Webhook’ Node · Option *Allowed Origins (CORS)*: die Domain des Frontends (`https://deine-domain.de`), zum Testen `*`.

**2. bis 5. Abfragen** (Supabase-Node, *Row → Get Many*, Return All, Filter-Typ *String*). Bei **allen vieren** in den Node-Einstellungen: *Execute Once* **an**, *Always Output Data* **an**, *On Error* **Continue**. Sonst läuft der Workflow bei einer leeren Abfrage nicht weiter oder wird bei einem Supabase-Ausfall abgebrochen.

| Name | Table | Filter (String) |
|---|---|---|
| `Plaetze laden` | `plaetze` | `aktiv=eq.true` |
| `Artikel laden` | `artikel` | `aktiv=eq.true&order=sortierung.asc` |
| `Letzte Anfrage am Platz` | `anfragen` | `platz=eq.{{ Number($('Webhook').first().json.body.platz) \|\| 0 }}&order=erstellt_am.desc&limit=1` |
| `Doppelte Anfrage pruefen` | `anfragen` | `id=eq.{{ /^[0-9a-f-]{36}$/i.test(String($('Webhook').first().json.body.anfrage_id)) ? $('Webhook').first().json.body.anfrage_id : '00000000-0000-0000-0000-000000000000' }}` |

Die Ausdrücke bei den Filtern sind Absicht: Sie lassen nur eine Zahl bzw. eine UUID in die Abfrage, damit niemand über den Webhook die Abfrage verbiegen kann.

**6. `Entscheiden`** · Code-Node · *Run Once for All Items* · JavaScript · den Inhalt von `anfrage-entscheiden.cjs` komplett einfügen. Einstellungen (Sperrzeit, Notkarte, Kategorien) stehen oben in der Datei.

**7. `Senden?`** · IF · `{{ $json.senden }}` ist `true`. (Kommen später weitere `typ`-Werte, wird daraus ein Switch.)

**Oberer Ausgang `ja`: Telegram**
- `Telegram senden` · Telegram → *Send Message* · Chat ID der Anfragen-Gruppe · Text `{{ $json.text }}` · *Append n8n attribution* aus. Kein Continue On Fail: Scheitert Telegram, bekommt der Gast die Meldung „Bitte sprich kurz das Team an“, und der Fehler-Workflow meldet sich.
- `Antwort ok` · Respond to Webhook · JSON · Body `{{ $('Entscheiden').first().json.antwort }}`

**Unterer Ausgang `ja`: Speichern** (jeweils *On Error: Continue*)
- `Anfrage speichern` · Supabase → *Row → Create* · Table `anfragen` · Felder `id`, `platz`, `typ` aus `{{ $('Entscheiden').first().json.speichern.anfrage.… }}`
- `Positionen vorbereiten` · Code · `return $('Entscheiden').first().json.speichern.positionen.map((json) => ({ json }))`
- `Positionen speichern` · Supabase → *Row → Create* · Table `anfrage_positionen` · Felder `anfrage_id`, `artikel_id`, `menge` aus `{{ $json.… }}`
- `Speicherfehler melden` · Code · macht aus einem stillen Fehler einen echten, damit der Fehler-Workflow ihn sieht (Continue On Fail löst ihn sonst nie aus):

```js
const fehler = [...$('Anfrage speichern').all(), ...$('Positionen speichern').all()].filter((i) => i.json.error)
if (fehler.length) {
  const e = fehler[0].json.error
  throw new Error('Speichern in Supabase fehlgeschlagen: ' + (typeof e === 'string' ? e : (e.message ?? JSON.stringify(e))))
}
return [{ json: { gespeichert: true } }]
```

**Ausgang `nein`: `Antwort`** · Respond to Webhook · JSON · Body `{{ $json.antwort }}` · Response Code `{{ $json.status }}`. Das deckt Sperre, Doppelung und ungültige Anfragen ab.

## Fehler-Workflow

Eigener Workflow: **Error Trigger** → Telegram an einen **separaten Admin-Chat** (nicht in die Team-Gruppe) mit Text:

```
Fehler im Workflow „{{ $json.workflow.name }}“
Node: {{ $json.execution.lastNodeExecuted }}
{{ $json.execution.error.message }}
{{ $json.execution.url }}
```

Im Anfragen-Workflow unter *Settings → Error Workflow* auswählen.

## Testen

Test-URL zuerst (Workflow auf *Listen for test event*), danach die Produktions-URL:

```bash
curl -s -X POST "<Webhook-URL>" -H 'Content-Type: application/json' \
  -d '{"anfrage_id":"'"$(uuidgen)"'","typ":"anfrage","platz":4,"positionen":[{"artikel":"wasser","menge":2},{"artikel":"apfelschorle","menge":1}]}'
```

| Erwartung | Antwort |
|---|---|
| Erste Anfrage | `{"ok":true,"sperre_sekunden":60}`, in Telegram: `Platz 4: 2× Wasser, 1× Apfelschorle`, eine Zeile in `anfragen`, zwei in `anfrage_positionen` |
| Gleiche Anfrage nochmal (gleiche `anfrage_id`) | `{"ok":true,…}`, **keine** zweite Nachricht |
| Neue ID, gleicher Platz, innerhalb von 60 s | `{"ok":false,"grund":"gesperrt","warte_sekunden":…}` |
| Platz 8 oder Menge 11 | Status 400, `{"ok":false,"grund":"platz_unbekannt"}` bzw. `"ungueltige_menge"` |

**Ausfalltest:** Im Credential einen falschen Service-Key eintragen und eine Anfrage senden. Die Telegram-Nachricht muss trotzdem ankommen (Notkarte), und im Admin-Chat meldet sich der Fehler-Workflow. Danach den Key zurücksetzen.

## Gut zu wissen

- **Notkarte:** Fällt Supabase aus, gelten die Artikel und Plätze aus `EINSTELLUNGEN` im Code-Node. Sie muss zu `NOTKARTE` und `NOTFALL_PLAETZE` im Frontend (`src/lib/bestellung.ts`) passen. Neue Artikel in der Tabelle `artikel` brauchen keine Änderung, die Notkarte nur, wenn sie auch im Ausfall bestellbar sein sollen.
- **Doppelung vor Sperre:** Kam die Antwort auf eine erste Anfrage nie beim Gast an, wiederholt sein Handy mit derselben `anfrage_id`. Er sieht dann die Bestätigung statt „gesperrt“, und es geht keine zweite Nachricht raus.
- **Sperre mit Status 200:** Der Browser liest die Antwort sicher auch dann, wenn n8n bei Fehlerstatus keine CORS-Kopfzeilen mitschickt. Das Frontend wertet den Inhalt aus, nicht den Status.
- **Frontend:** In Netlify die Variable `VITE_BESTELL_WEBHOOK_URL` auf die **Produktions-URL** setzen und neu bauen, die Variable wird beim Bauen eingebacken.
