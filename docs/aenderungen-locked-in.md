# Änderungen an der Salon-Plattform – Schwerpunkt „Locked In“

Stand: 23. Oktober 2026 · Branch `claude/blissful-darwin-6vej36`

Dieses Dokument beschreibt, was in der Umfrage geändert wurde, vor allem das **„Locked In“-Verfahren**. Es ist so geschrieben, dass sich das Verfahren auf eine andere Plattform übertragen lässt (Abschnitt 6 ist die Checkliste dafür). Die weiteren Änderungen stehen kurz in Abschnitt 8.

---

## 1. Worum es geht

Früher hat man bei jeder Person und jedem Verhalten einfach eine Zahl von 1 bis 5 angeklickt. Die Beschreibung der Stufen stand in einem Akkordeon, das man öffnen konnte, aber nicht musste.

Jetzt gilt bei **jeder einzelnen Bewertung** (Selbstbild und Fremdbild):

1. Man klickt eine Zahl von 1 bis 5.
2. Es öffnet sich ein **Popup** mit der vollständigen Beschreibung genau dieser Stufe.
3. Die Bewertung zählt erst, wenn man im Popup auf **„Locked In“** klickt.
4. Danach ist sie **gesperrt** (nicht mehr änderbar), und die Umfrage springt **automatisch weiter**.

Ziel: Die Befragten setzen sich bei jeder Bewertung mit dem Kriterium auseinander, statt Zahlen durchzuklicken.

---

## 2. Ablauf im Detail

### Reihenfolge
Eine Seite zeigt **ein Verhalten** mit drei Karten untereinander: du selbst (Selbstbild), Kollegin 1, Kollegin 2 (Fremdbild).

```
Verhalten 1 → Selbst → Kollegin 1 → Kollegin 2
Verhalten 2 → Selbst → Kollegin 1 → Kollegin 2
… bis Verhalten 20 → Zusammenfassung
```

Vor den Bewertungen eines Verhaltens läuft das Video bzw. der 8-Sekunden-Platzhalter (siehe Abschnitt 8). Erst danach sind die Zahlen klickbar.

### Das Popup
Es zeigt:

| Bereich | Inhalt |
|---|---|
| Plaketten | Art der Bewertung (`Selbstbild · du selbst` oder `Fremdbild · <Name>`) und `Verhalten <Nr>` |
| Verhalten | Titel des Verhaltens als kleine Zeile |
| Überschrift | `Bewertung 4 · Profi · 75–100%` (Zahl, Stufenname, Prozentbereich) |
| Beschreibung | Leitsatz der Stufe und die Stichpunkte, vollständig |
| Kommentar | Textfeld, **Pflicht ab Bewertung 4**, darunter freiwillig |
| Hinweis | „Mit „Locked In“ bestätigst du diese Bewertung. Danach lässt sich die Bewertung nicht mehr ändern.“ |
| Schaltflächen | `Abbrechen` und `Locked In` |

### Regeln

| Regel | Verhalten |
|---|---|
| **Locked In klicken** | Bewertung und Kommentar werden gespeichert, die Karte wird gesperrt. |
| **Kommentarpflicht** | Ab Bewertung 4 bleibt „Locked In“ gesperrt, bis ein Kommentar im Feld steht. Bei 1–3 ist „Locked In“ sofort klickbar. |
| **Kein Lesezwang per Timer** | „Locked In“ ist sofort klickbar (kein Countdown). |
| **Abbrechen, Esc, Klick auf den Hintergrund** | Das Popup schließt, **nichts wird gespeichert**, die Zahl ist wieder nicht ausgewählt. Es gibt keine Bewertung ohne „Locked In“. |
| **Nachträglich ändern** | **Nicht möglich.** Eine bestätigte Bewertung ist gesperrt, auch nach „Zurück“ oder Neuladen. |
| **Automatisch weiter** | Nach „Locked In“ springt Fokus und Ansicht zur nächsten noch offenen Person desselben Verhaltens. Nach der letzten Person geht es ohne weiteren Klick zum nächsten Verhalten, nach dem letzten zur Zusammenfassung. |

### Die gesperrte Karte
- Die Zahlen sind deaktiviert, die gewählte bleibt hervorgehoben, die übrigen sind abgedunkelt.
- Ein grünes Kennzeichen „Locked In“ steht darunter, dazu der bestätigte Kommentar als Text.
- Unter jeder Zahl steht der Stufenname: **Bewusstsein, Aufbau, Stabilität, Profi, High Performer** (für Selbstbild und Fremdbild).

### Handy und Desktop
- **Handy (bis 600 px):** Das Popup erscheint als Fläche von unten, über die volle Breite.
- **Desktop:** Dialog in der Mitte, höchstens 560 px breit.
- Bei „Bewegung reduzieren“ im Betriebssystem entfällt die Einblend-Animation.

---

## 3. Umsetzung (technisch)

Frontend: React + TypeScript. Das Verfahren kommt **ohne Änderung an Server oder Datenbank** aus, die Absende-Funktion bleibt gleich.

### Dateien

| Datei | Aufgabe |
|---|---|
| `src/components/umfrage/LockedInDialog.tsx` | **Neu.** Das Popup. |
| `src/components/umfrage/VerhaltenSchritt.tsx` | Eine Seite pro Verhalten: öffnet das Popup, sperrt bestätigte Karten, springt weiter. Das alte Akkordeon und die alten Kommentarfelder auf der Seite sind entfallen. |
| `src/components/umfrage/Skala.tsx` | Die fünf Zahlenfelder. Neu: Prop `gesperrt`, Stufennamen unter den Zahlen. |
| `src/components/umfrage/Umfrage.tsx` | Gesamtablauf. Speichert bestätigte Bewertungen im Entwurf und geht bei `onFertig` zum nächsten Schritt. |
| `src/lib/umfrage.ts` | Konstanten (`STUFEN_NAMEN`, `KOMMENTAR_PFLICHT_AB`, `stufenName`), Prüfungen und Aufbau der Absende-Daten. |
| `src/styles/umfrage.css` | Styles für Popup, gesperrte Karte und Handy-Fläche. |

### Zustand
Es gibt nur **einen** zusätzlichen Zustand, und zwar pro Verhaltens-Seite: die gewählte, aber noch nicht bestätigte Zahl.

```ts
const [auswahl, setAuswahl] = useState<{ personId: string; note: number } | null>(null)
```

- Zahl anklicken → `setAuswahl({ personId, note })` → das Popup erscheint.
- `Abbrechen` / `Esc` / Hintergrund → `setAuswahl(null)`, nichts wird gespeichert.
- `Locked In` → Bewertung und Kommentar gehen in den Entwurf, dann `setAuswahl(null)`.

Der Entwurf selbst (bestätigte Bewertungen) liegt wie bisher im Browser (`localStorage`, Schlüssel `umfrage-entwurf:<user>:<monat>`). **Eine Bewertung steht dort nur, wenn sie bestätigt ist.**

```ts
entwurf.noten[`${verhaltenNr}:${personId}`] = 4
entwurf.kommentare[`${verhaltenNr}:${personId}`] = 'Text'
```

„Gesperrt“ heißt: Für diesen Schlüssel existiert eine Bewertung. Die Karte wird dann mit `gesperrt` gerendert (Radio-Buttons `disabled`).

### Automatisch weiter
Kernstück in `VerhaltenSchritt.tsx`:

```ts
const lockedIn = (kommentar: string) => {
  onLockedIn(schluessel, auswahl.note, kommentar)   // in den Entwurf
  setAuswahl(null)
  const naechste = personen.find(
    (p) => p.id !== auswahl.personId && !entwurf.noten[notenSchluessel(verhalten.nr, p.id)],
  )
  window.setTimeout(() => {
    if (!naechste) return onFertig()                 // letzte Person → nächstes Verhalten
    const feld = document.getElementById(`bewertung-${verhalten.nr}-${naechste.id}`)
    feld?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    feld?.querySelector('input')?.focus({ preventScroll: true })
  }, 0)
}
```

`onFertig` ruft im Gesamtablauf `geheZu(index + 1)` auf. Der `setTimeout(…, 0)` sorgt dafür, dass zuerst der Entwurf aktualisiert wird, bevor weitergesprungen wird.

### Das Popup (`LockedInDialog.tsx`)
- Verwendet das **native HTML-Element `<dialog>`** mit `showModal()`. Das bringt kostenlos mit: Fokus bleibt im Popup (Focus-Trap), abgedunkelter Hintergrund (`::backdrop`), `Esc` schließt.
- `Esc` löst das Ereignis `cancel` aus → wird als Abbrechen behandelt.
- Klick auf den Hintergrund: `onClick`, wenn `e.target === dialog` → Abbrechen.
- Der Fokus startet im Kommentarfeld (ab Bewertung 4) oder direkt auf „Locked In“ (bei 1–3).
- Die Schaltfläche „Locked In“ ist ein Formular-Submit. Sie ist `disabled`, solange ab Bewertung 4 der Kommentar leer ist. Das Textfeld hat `required` / `aria-required`.
- Das Popup wird nur eingehängt, solange eine Auswahl offen ist. Beim Schließen räumt ein Aufräum-Schritt (`dialog.close()`) auf.

### Datenquelle für den Popup-Text
Tabelle `verhalten_kriterien` (eine Zeile pro Verhalten und Stufe):

| Spalte | Beispiel |
|---|---|
| `stufe` | `4` |
| `bezeichnung` | `4 – Profi` |
| `prozent` | `75–100%` |
| `leitsatz` | „Stört nahezu nie, …“ |
| `punkte` | Liste von Stichpunkten |

Die Plattform lädt sie zusammen mit dem Verhalten. Der Popup-Titel zeigt `stufenName(bezeichnung)`, also „Profi“ ohne die führende „4 – “.

Fehlt für eine Stufe der Text, zeigt das Popup nur die Zahl und das Kommentarfeld. „Locked In“ gibt es trotzdem.

### Sicherheit und Verbindlichkeit
Wichtig für die Übertragung: Die **Sperre gilt nur in der Oberfläche**. Der Server sieht beim Absenden nur die fertige Umfrage (60 Bewertungen auf einmal). Das reicht hier, weil die Umfrage pro Person und Monat nur **einmal** abgegeben werden kann und nur bestätigte Bewertungen im Entwurf stehen.

Die **Kommentarpflicht ab Bewertung 4** wird zusätzlich serverseitig geprüft (Datenbank-Regel und Prüfung in der Absende-Funktion). Sie lässt sich also nicht umgehen.

Soll das Locked-In auf der anderen Plattform auch **serverseitig verbindlich** sein (z. B. jede Bewertung sofort speichern), braucht es dafür eine eigene Speicher-Funktion pro Bewertung. Das haben wir hier bewusst nicht gebaut.

---

## 4. Barrierefreiheit und Bedienung
- Die Zahlen sind echte Radio-Buttons (Tastatur, Screenreader). Pfeiltasten wählen und öffnen das Popup.
- Das Popup hat `aria-labelledby` auf die Überschrift, Fokus-Falle und `Esc`.
- Der Fokus springt nach „Locked In“ gezielt auf die nächste Karte.
- Screenreader lesen „Bewertung 4“ statt „Note 4“.

---

## 5. Texte (Begriff „Bewertung“ statt „Note“)
In der Umfrage heißt es jetzt überall **„Bewertung“**: Popup, Kommentar-Hinweis („Pflicht ab Bewertung 4“), Fehlermeldungen, Startseite, Screenreader-Texte, „Durchschnitt deiner Bewertungen“. In den Auswertungen steht an einigen Stellen weiterhin „Note“.

---

## 6. Checkliste für die Übertragung auf eine andere Plattform

1. **Beschreibungen pro Stufe bereitstellen** (Bezeichnung, Prozent, Leitsatz, Stichpunkte) – pro Frage bzw. Verhalten.
2. **Auswahl von Bestätigung trennen:** Klick auf die Zahl setzt nur einen „offenen“ Zustand, gespeichert wird erst bei „Locked In“.
3. **Popup bauen** mit Stufentext, Kommentarfeld und den Schaltflächen `Abbrechen` / `Locked In`. Am einfachsten über das native `<dialog>`-Element.
4. **Kommentarpflicht** im Popup erzwingen („Locked In“ gesperrt, bis ein Kommentar da ist). Schwelle als eine Konstante führen, auch serverseitig prüfen.
5. **Abbrechen speichert nichts** (Esc, Hintergrund, Button).
6. **Nach „Locked In“ sperren**: Eingabefelder deaktivieren, Kennzeichen „Locked In“ und Kommentar anzeigen.
7. **Automatisch weiterspringen:** nächste offene Person, nach der letzten die nächste Frage.
8. **Zwischenstand** nur mit bestätigten Bewertungen speichern, damit Neuladen nichts verfälscht.
9. **Handy:** Popup als Fläche von unten.
10. **Tests:** siehe Abschnitt 7.

Entscheidungen, die wir getroffen haben und die anderswo anders ausfallen könnten:

| Thema | Unsere Entscheidung |
|---|---|
| Nachträglich ändern | Nein, endgültig gesperrt |
| Wartezeit vor „Locked In“ | Keine, sofort klickbar |
| Akkordeon mit allen Stufen auf der Seite | Entfällt, die Stufe steht im Popup |
| Seite pro Person oder pro Verhalten | Pro Verhalten, mit automatischem Fokus auf die nächste Person |
| Serverseitige Sperre | Nein, nur in der Oberfläche |

---

## 7. Tests
Die Browser-Tests (Playwright, mit nachgebautem Supabase) prüfen für das Locked-In unter anderem:

- Popup zeigt Bezeichnung, Prozent, Leitsatz und Art der Bewertung der gewählten Stufe.
- `Abbrechen` und `Esc` speichern nichts.
- „Locked In“ bestätigt die Bewertung, sperrt die Karte und zeigt das Kennzeichen „Locked In“.
- Der Fokus springt auf die nächste Person.
- Ab Bewertung 4 ist „Locked In“ ohne Kommentar gesperrt und mit Kommentar frei.
- Der bestätigte Kommentar steht auf der Karte.
- Nach der letzten Person geht es automatisch zum nächsten Verhalten, nach dem 20. zur Zusammenfassung.
- Nach Neuladen bleiben bestätigte Bewertungen gesperrt und der Kommentar erhalten.
- Popup am Desktop höchstens 560 px breit, kein horizontales Scrollen.
- Alle drei Bewertungsfelder tragen die Stufennamen unter den Zahlen.

Stand der Prüfungen: 82 Prüfungen in der Umfrage, insgesamt über 250 Browser-Prüfungen und 159 Datenbank-Tests, alle bestanden.

---

## 8. Weitere Änderungen (kurz)

### Umfrage
- **Rituale entfernt:** Sie sind in der Plattform nicht mehr sichtbar (in der Datenbank deaktiviert, Daten bleiben erhalten).
- **Entwicklung des Monats** steht als **erste Frage** und ist **Pflicht** (Kollegin wählen, Begründung). Auch serverseitig geprüft.
- **Video-Sperre:** Jedes Verhalten hat ein Video. Ohne Video läuft ein Platzhalter von 8 Sekunden (`PLATZHALTER_VIDEO_SEKUNDEN`), danach werden die Bewertungen frei. Vorspulen ist gesperrt.
- **Stufentexte:** 100 Bewertungsstufen (20 Verhalten × 5) aus der bisherigen Umfrage in der Datenbank. Einheitliche Stufennamen für alle Verhalten: Bewusstsein, Aufbau, Stabilität, Profi, High Performer.

### Auswertungen
- **Heatmap:** nur noch der Durchschnitt je Säule pro Person, dazu „Ø Team“ und eine Gesamtzeile.
- **Selbstbild-Kommentare** stehen bei jeder Person im Bereich der Rückmeldungen, für Admin, Verantwortliche und die Person selbst.
- **Mitarbeiterinnen:** Auf der Team-Seite sehen sie Rangliste und Heatmap mit Namen. In ihren eigenen Ergebnissen sehen sie **nur ihre eigenen Selbstbild-Antworten**, keine Kommentare der Kolleginnen. Die Fremdbild-Zahlen bleiben sichtbar. Verantwortliche und Admin sehen weiter alles.

### Plattform
- **Logo:** Im Kopf steht nur noch das Dawiid-Logo (ohne Schriftzug).
- **Nachtmodus:** Umschalter im Kopf, gilt für die ganze Plattform. Die Wahl wird im Browser gemerkt, sonst folgt die Seite dem Gerät.
- **Passwort ändern:** Seite `/app/passwort` für alle angemeldeten Personen. Fragt das aktuelle Passwort ab, neues Passwort mindestens 8 Zeichen.

### Datenbank-Migrationen (alle in Supabase eingespielt)
| Migration | Inhalt |
|---|---|
| `seed_dawiid_kriterien` | 100 Bewertungsstufen |
| `rituale_deaktivieren` | Rituale ausblenden (umkehrbar) |
| `umfrage_entwicklung_pflicht` | Entwicklung des Monats mit Begründung ist Pflicht |
| `ergebnisse_selbstbild_team` | Selbstbild-Kommentare in den Auswertungen, Team-Übersicht auch für Mitarbeiterinnen |
| `mitarbeiterin_ohne_fremdkommentare` | Mitarbeiterinnen sehen keine Kommentare der Kolleginnen |
| `stufennamen_verhalten_1` | Einheitliche Stufennamen für Verhalten 1 |

Das Locked-In selbst braucht **keine** Migration.
