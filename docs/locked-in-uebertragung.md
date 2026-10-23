# Locked-In-Bewertung: strukturelle Änderung

Diese Datei beschreibt **nur die strukturelle Änderung** und ist unabhängig von Programmiersprache, Framework und Design. Sie lässt sich 1:1 in einen Chat oder ein Ticket auf einer anderen Plattform übernehmen.

Nicht vorgegeben sind Farben, Abstände, Animationen und konkrete Bibliotheken. Das richtet sich nach der Zielplattform.

---

## 1. Ziel

Bei jeder einzelnen Bewertung einer Skala von 1 bis 5 muss die befragte Person die Beschreibung der gewählten Stufe sehen und aktiv bestätigen („Locked In“). Erst dann zählt die Bewertung. Danach geht es automatisch zur nächsten Bewertung.

Die Änderung betrifft nur den **Bewertungsablauf im Browser**. Das Absenden der fertigen Umfrage und das Datenformat bleiben unverändert.

---

## 2. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Frage** | Ein Punkt, der bewertet wird (bei uns: ein „Verhalten“). |
| **Bewertungsfeld** | Eine Bewertung einer Person zu einer Frage, also ein Paar (Frage, Person). Beispiel: Verhalten 3 für Kollegin A. |
| **Stufe** | Ein Wert der Skala (1 bis 5) mit einer Beschreibung. |
| **Bestätigt / gesperrt** | Das Bewertungsfeld wurde mit „Locked In“ abgeschlossen und ist nicht mehr änderbar. |

Eine Seite zeigt **eine Frage** und darunter **alle Bewertungsfelder dieser Frage** (bei uns: du selbst, Kollegin 1, Kollegin 2).

---

## 3. Benötigte Daten

### 3.1 Beschreibung je Stufe (muss pro Frage vorhanden sein)

| Feld | Pflicht | Beispiel |
|---|---|---|
| `stufe` | ja | `4` |
| `bezeichnung` | ja | `4 – Profi` |
| `prozent` | optional | `75–100%` |
| `leitsatz` | ja | „Stört nahezu nie, …“ |
| `punkte` | optional | Liste von Stichpunkten |

Fehlt für eine Stufe die Beschreibung, zeigt das Popup nur die Zahl und das Kommentarfeld. „Locked In“ gibt es trotzdem.

### 3.2 Zustand pro Bewertungsfeld

```
bewertung[frage, person] = { wert: 1..5, kommentar: Text }   // nur wenn bestätigt
```

Es gibt **nur bestätigte** Bewertungen im gespeicherten Zustand. Einen Zwischenzustand „gewählt, nicht bestätigt“ gibt es nur flüchtig, solange das Popup offen ist.

Zusätzlich pro Seite genau ein flüchtiger Zustand:

```
auswahl = null | { person, wert }      // offene, noch nicht bestätigte Wahl
```

---

## 4. Zustandsmodell eines Bewertungsfelds

| Zustand | Wie man hineinkommt | Darstellung |
|---|---|---|
| **Offen** | Ausgangszustand | Zahlen 1–5 klickbar |
| **Gewählt** (flüchtig) | Zahl anklicken | Popup ist offen |
| **Bestätigt** | „Locked In“ im Popup | Zahlen deaktiviert, gewählte Zahl hervorgehoben, Kennzeichen „Locked In“, Kommentar als Text |

Übergänge:

| Von | Ereignis | Nach | Wirkung |
|---|---|---|---|
| Offen | Zahl anklicken | Gewählt | `auswahl = { person, wert }`, Popup öffnet |
| Gewählt | „Locked In“ (erlaubt) | Bestätigt | Bewertung und Kommentar speichern, `auswahl = null`, Popup schließt, weiterspringen (Abschnitt 6) |
| Gewählt | Abbrechen, Esc, Klick neben das Popup | Offen | `auswahl = null`, **nichts gespeichert** |
| Bestätigt | beliebig | Bestätigt | **Nicht änderbar**, auch nach „Zurück“ oder Neuladen |

---

## 5. Das Popup

### 5.1 Pflichtinhalt

1. Art der Bewertung und Person (z. B. „Selbstbild · du selbst“ oder „Fremdbild · Anna“).
2. Die Frage (Titel oder Kurztext).
3. Überschrift mit **Zahl, Stufenname, Prozentbereich**, z. B. „Bewertung 4 · Profi · 75–100%“.
4. **Vollständige** Beschreibung der gewählten Stufe: Leitsatz und alle Stichpunkte, nichts abgeschnitten, keine Aufklapp-Elemente.
5. Kommentarfeld.
6. Hinweis: „Mit „Locked In“ bestätigst du diese Bewertung. Danach lässt sich die Bewertung nicht mehr ändern.“
7. Zwei Schaltflächen: **Abbrechen** und **Locked In**.

Angezeigt wird **nur die gewählte Stufe**, nicht alle fünf.

### 5.2 Verhalten

| Regel | Festlegung |
|---|---|
| Modal | Das Popup blockiert die Seite dahinter (Hintergrund abgedunkelt, Fokus bleibt im Popup). |
| Kommentarpflicht | Ab Wert `≥ SCHWELLE` (bei uns 4) ist der Kommentar Pflicht. Solange er leer ist, ist „Locked In“ **deaktiviert**. Darunter ist der Kommentar freiwillig. |
| Wartezeit | Keine. „Locked In“ ist sofort klickbar (kein Countdown, kein Lesezwang per Timer). |
| Schließen ohne Bestätigung | Abbrechen-Schaltfläche, Esc-Taste und Klick auf den Hintergrund verwerfen die Wahl. Es entsteht keine Bewertung. |
| Anfangsfokus | Bei Kommentarpflicht im Kommentarfeld, sonst auf „Locked In“. |
| Mobil | Darstellung als Fläche von unten ist empfohlen, nicht zwingend. |

---

## 6. Automatisches Weiterspringen nach „Locked In“

Pseudocode (unabhängig von der Technik):

```
bei LockedIn(person, wert, kommentar):
    speichere bewertung[frage, person] = { wert, kommentar }
    schließe Popup, auswahl = null

    naechste = erste Person dieser Frage (in der festen Reihenfolge)
               ohne bestätigte Bewertung, außer der gerade bestätigten

    wenn naechste existiert:
        scrolle zu naechste und setze den Fokus auf deren erste Zahl
    sonst:
        gehe zur nächsten Frage                # nach der letzten Frage: Zusammenfassung
```

Wichtig:
- Die **Reihenfolge der Personen** ist fest (zuerst man selbst, dann die anderen).
- Das Weiterspringen läuft erst, **nachdem** die Bewertung gespeichert ist.
- Es gibt keinen zusätzlichen „Weiter“-Klick. Die „Weiter“- und „Zurück“-Schaltflächen bleiben als Navigation erhalten. „Weiter“ prüft weiterhin, dass alle Felder der Seite bestätigt sind.

---

## 7. Prüfungen und Daten

- **Seite abgeschlossen**, wenn für alle Bewertungsfelder der Seite eine bestätigte Bewertung existiert.
- **Absenden** der Umfrage nur, wenn alle Seiten abgeschlossen sind. Das Datenformat zum Server bleibt **unverändert** (pro Bewertungsfeld: Frage, Person, Wert, Kommentar).
- **Zwischenstand** (z. B. beim Schließen des Browsers) enthält nur bestätigte Bewertungen. Nach dem Wiederöffnen sind sie weiterhin gesperrt.
- **Kommentarpflicht** wird zusätzlich serverseitig geprüft, wenn der Server das schon tat. Eine neue Server-Funktion ist nicht nötig.

Die Sperre gilt nur in der Oberfläche. Das genügt, solange die Umfrage pro Person und Zeitraum nur einmal abgegeben werden kann. Soll die Sperre serverseitig gelten, muss jede Bewertung beim „Locked In“ einzeln an den Server gehen. Das gehört **nicht** zu dieser Änderung.

---

## 8. Was sich im Vergleich zu vorher ändert

| Vorher | Nachher |
|---|---|
| Zahl anklicken setzt die Bewertung sofort | Zahl anklicken öffnet das Popup, erst „Locked In“ setzt die Bewertung |
| Aufklappbare Liste aller Stufen auf der Seite | Entfällt. Die gewählte Stufe steht im Popup. |
| Kommentarfeld unter jeder Bewertung auf der Seite | Kommentarfeld im Popup, auf der Seite nur noch der bestätigte Text |
| Bewertung jederzeit änderbar | Nach „Locked In“ gesperrt |
| Manuell auf „Weiter“ klicken | Automatisch zur nächsten Person bzw. nächsten Frage |

Zusätzlich: Der Begriff **„Note“** heißt in der Umfrage jetzt **„Bewertung“**, und unter den Zahlen stehen die Stufennamen (bei uns: Bewusstsein, Aufbau, Stabilität, Profi, High Performer).

---

## 9. Abnahmekriterien

1. Klick auf eine Zahl öffnet das Popup mit der Beschreibung genau dieser Stufe (Zahl, Name, Prozent, Leitsatz, alle Stichpunkte).
2. Abbrechen, Esc und Klick auf den Hintergrund schließen das Popup, und keine Zahl ist ausgewählt.
3. „Locked In“ bestätigt die Bewertung: Zahlen deaktiviert, Kennzeichen „Locked In“ sichtbar, Kommentar als Text sichtbar.
4. Bei Wert ≥ Schwelle ist „Locked In“ ohne Kommentar deaktiviert, mit Kommentar aktiv. Darunter ist es sofort aktiv.
5. Nach „Locked In“ steht der Fokus auf der nächsten offenen Person derselben Frage.
6. Nach „Locked In“ der letzten Person der Seite öffnet sich ohne weiteren Klick die nächste Frage, nach der letzten Frage die Zusammenfassung.
7. Eine bestätigte Bewertung lässt sich nicht mehr ändern, auch nicht nach „Zurück“ und nicht nach dem Neuladen.
8. Der Zwischenstand enthält nur bestätigte Bewertungen.
9. Die Daten, die beim Absenden an den Server gehen, sind unverändert.
10. Das Popup lässt sich mit der Tastatur bedienen (Fokus bleibt im Popup, Esc bricht ab).

---

## 10. Nicht Teil dieser Änderung

Damit nichts dazuerfunden wird:

- Kein Countdown und keine Mindestlesezeit vor „Locked In“.
- Keine nachträgliche Änderung bestätigter Bewertungen.
- Keine Änderung am Server, an der Datenbank oder am Absende-Format.
- Keine Vorgaben zu Farben, Abständen, Animationen oder Schriftarten.
- Kein neues Auswertungs- oder Anzeige-Verhalten außerhalb des Bewertungsablaufs.

---

## 11. Einstellbare Werte

| Wert | Bei uns | Zweck |
|---|---|---|
| `SCHWELLE` | 4 | Ab dieser Bewertung ist der Kommentar Pflicht |
| Skala | 1 bis 5 | Anzahl der Stufen |
| Stufennamen | Bewusstsein, Aufbau, Stabilität, Profi, High Performer | Beschriftung unter den Zahlen |
| Begriff | „Bewertung“ | Wort in allen Texten der Umfrage |

---

## 12. Vorlage für den Chat auf der anderen Plattform

> Setze bitte die „Locked-In“-Änderung nach der angehängten Beschreibung um. Es geht nur um die strukturelle Änderung im Bewertungsablauf, Design und Technik passen sich unserer Plattform an.
>
> Unsere Plattform: `<Technik/Framework eintragen>`. Die Beschreibungen der Stufen (Bezeichnung, Prozent, Leitsatz, Stichpunkte) liegen in: `<Tabelle/Datei eintragen>`. Die Kommentarpflicht gilt ab Bewertung `<Schwelle>`.
>
> Bitte halte dich an Abschnitt 4 (Zustände), 5 (Popup), 6 (Weiterspringen), 7 (Prüfungen) und 10 (nicht Teil der Änderung). Prüfe am Ende alle Punkte aus Abschnitt 9 und nenne mir, welche erfüllt sind.
