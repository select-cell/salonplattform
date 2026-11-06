# Master-Anleitung: KI-Auswertungen und Teammeeting-Agenda auf einer Plattform einbauen

**Stand:** 6. November 2026 · **Herkunft:** Plattform „DAWIID“ (React, Supabase, n8n, Claude), Version 1.3 · **Zweck:** Dieselben KI-Funktionen auf weitere Plattformen übertragen.
**Zielgruppe:** Entwickler:innen und KI-Assistenten, die das nachbauen sollen. **Nicht enthalten:** Mailversand der Agenda und Termine (das kommt später).

> **Kurz gesagt:** Die Datenbank rechnet alle Zahlen und baut die Eingabe. Die KI formuliert nur Text. Danach prüft die Datenbank, ob der Aufbau stimmt und **jede Zahl** aus den Daten stammt. Ein Mensch gibt frei. Ein Workflow-Dienst (n8n) vermittelt zwischen Plattform und KI und dient hier als **Vorlage für alle weiteren Plattformen**.

---

## Inhalt

1. [Das Prinzip](#1-das-prinzip)
2. [Was die Funktionen leisten](#2-was-die-funktionen-leisten)
3. [Architektur](#3-architektur)
4. [Datenmodell und Rechte](#4-datenmodell-und-rechte)
5. [Die Eingabe für die KI](#5-die-eingabe-für-die-ki)
6. [Die Agenda im Detail](#6-die-agenda-im-detail)
7. [Der Faktencheck](#7-der-faktencheck)
8. [Prompts](#8-prompts)
9. [Ablauf der Orchestrierung](#9-ablauf-der-orchestrierung)
10. [Webhook-Protokoll und n8n-Workflow](#10-webhook-protokoll-und-n8n-workflow)
11. [Die Oberfläche](#11-die-oberfläche)
12. [Rechte, Datenschutz, Sicherheit](#12-rechte-datenschutz-sicherheit)
13. [Stolpersteine aus der Praxis](#13-stolpersteine-aus-der-praxis)
14. [Checkliste: auf eine neue Plattform übertragen](#14-checkliste-auf-eine-neue-plattform-übertragen)
15. [Tests](#15-tests)
16. [Stand und offene Punkte](#16-stand-und-offene-punkte)
17. [Anhänge A bis H](#anhänge)

---

## 0. So benutzt du dieses Dokument

- **Zum Verstehen:** Kapitel 1 bis 3 (zehn Minuten).
- **Zum Nachbauen:** Kapitel 4 bis 11 sind die Bausteine, Kapitel 14 ist die Reihenfolge, der Anhang enthält den **lauffähigen Code** (Prompts, Parser, SQL, n8n-Knoten), der direkt aus der fertigen Plattform übernommen wurde.
- **Mit einer KI als Helfer:** Anhang H ist ein fertiger Auftrag zum Kopieren. Gib ihn zusammen mit diesem Dokument und den Dateien aus der Liste in Anhang G.
- **Platzhalter:** `<PROJEKT-REF>`, `<ANON-KEY>`, `<WEBHOOK-URL>`, `<ANTHROPIC-KEY>` stehen für Werte der jeweiligen Plattform. Schlüssel gehören nie ins Dokument, nie in den Code und nie ins Frontend (außer dem öffentlichen anon-Schlüssel, der ohnehin im Browser liegt).

**Begriffe:** *Mandant* ist der Betrieb, dessen Daten getrennt bleiben (hier ein „Salon“). *Admin* ist die Person mit allen Rechten. *Verantwortliche* leiten ein Team. *Eingabe* sind die Daten, die an die KI gehen. *Strang* ist ein Zweig im Workflow für eine Aufgabe.

---

## 1. Das Prinzip

Fünf Leitsätze, auf denen alles aufbaut. Wer sie bei einer neuen Plattform beibehält, bekommt dieselbe Sicherheit.

| # | Leitsatz | Warum |
|---|---|---|
| 1 | **Zahlen kommen aus SQL, nie von der KI.** | Eine KI rechnet unzuverlässig und erfindet gern Werte. Die Datenbank berechnet Mittelwerte, Differenzen, Veränderungen und Einordnungen. |
| 2 | **Die KI formuliert nur Text, und nur aus anonymisierter Eingabe.** | Keine Namen, keine Kennungen, keine E-Mail-Adressen. Für Team-Auswertungen auch keine Kommentartexte. |
| 3 | **Die Datenbank entscheidet.** | Sie baut die Eingabe, prüft den Aufbau (Blöcke, Minuten), prüft **jede Zahl** im Text gegen die Eingabe und rechnet das Ergebnis `geprueft` selbst. Weder KI noch Oberfläche können es setzen. |
| 4 | **Ein Mensch entscheidet.** | Jedes Ergebnis ist ein **Entwurf**. Die Leitung liest, bearbeitet und gibt frei. Erst Freigegebenes erscheint im Bericht. |
| 5 | **Alles hat einen Rückfall, und nichts geht verloren.** | Die Agenda gibt es auch ohne KI (feste Vorlage). Erreicht der Browser den Webhook nicht, nimmt die Aufgabe einen zweiten Weg. Ein Entwurf mit nicht bestandenem Faktencheck wird trotzdem gespeichert, mit deutlichem Hinweis. |

---

## 2. Was die Funktionen leisten

Vier KI-Funktionen, alle mit **demselben Ablauf**. Sie unterscheiden sich nur in Eingabe, Prompt und Ausgabeform.

| Funktion | Wert `aufgabe` im Webhook | Eingabe | Ausgabe | Typ in `analysen` |
|---|---|---|---|---|
| **Einzelanalyse** (eine Person) | `einzelanalyse` | Werte und anonymisierte Kommentare einer Person | sechs Teile (Zusammenfassung, Stärken, Entwicklungsfelder, Gesprächsfragen, Vereinbarungen, Hinweis) | `person` |
| **Sammellauf** (alle Personen eines Monats) | `einzelanalyse` (mehrere Aufträge in **einer** Anfrage) | wie oben, je Person ein Auftrag | je Person eine Einzelanalyse | `person` |
| **Gesamtauswertung** (das Team) | `gesamtauswertung` | nur Teamwerte | wie die Einzelanalyse, aber für das Team | `team_gesamt` |
| **Agenda fürs Teammeeting** | `agenda` | Teamwerte + aktuelle Fokus-Themen + Zeitbudget je Block | fünf Blöcke mit Minuten und Punkten | `team_agenda` |

**Gemeinsamer Ablauf** (Kapitel 9 zeigt ihn genau):

```
Eingabe von der Datenbank holen
  → gleiche Eingabe und gleiche Prompt-Version wie gespeichert?  → nichts tun („übersprungen“)
  → KI formuliert (Antwort als JSON)
  → Datenbank prüft: Aufbau, Zeitbudget, jede Zahl
  → Abweichung? bis zu zwei Wiederholungen, mit Hinweis an die KI
  → als Entwurf speichern (auch mit nicht bestandenem Faktencheck, dann mit Hinweis)
  → Mensch: bearbeiten → freigeben
```

**Rechte:** Zurzeit darf nur der **Admin** KI-Funktionen auslösen. Ein Schalter je Mandant (`ki_nur_admin`, Standard an) öffnet sie später auch für Verantwortliche. Bei Einzelanalyse und Gesamtauswertung gilt der Schalter auch für Lesen, Bearbeiten und Freigeben. Bei der **Agenda** lesen, bearbeiten und geben die Verantwortlichen wie bisher frei; nur das **KI-Formulieren** ist Admin-Sache. Mitarbeiter haben nie Zugriff.

**Die Agenda gibt es auf zwei Arten, beide nebeneinander:**
- **Vorlage ohne KI** (`agenda-vorlage-v1`): entsteht allein aus SQL, mit festen Texten. Sie ist der Rückfall und funktioniert ohne jede Einrichtung.
- **Von der KI formuliert** (`agenda-ki-v1`): dieselben fünf Blöcke, aber in lesbaren Sätzen. Scheitert die KI, ändert sich an einer vorhandenen Agenda nichts.

---

## 3. Architektur

```
 Admin im Browser (Oberfläche)
        │  1. holt die Eingabe          ┌──────────────────────────────────────────┐
        ├──────────────────────────────▶│ DATENBANK (Postgres + Funktionen)        │
        │◀──────────────────────────────┤  Rechte · Eingabe bauen · Prüfen ·       │
        │                               │  Faktencheck · Speichern                 │
        │  2. Anfrage + Anmeldung       └──────────────────────────────────────────┘
        ├───────────────▶ WEBHOOK (n8n) ──▶ Anmeldung prüfen ──▶ Strang wählen ──▶ KI (Claude, HTTP)
        │◀─────────────── Antwort (JSON je Auftrag) ◀────────────────────────────────┘
        │  3. lässt prüfen und speichern
        └──────────────────────────────▶ DATENBANK
                                         
 Zweiter Weg (Rückfall, wenn der Browser den Webhook nicht erreicht, z. B. wegen CORS):
 Browser ──▶ Server-Funktion (Edge Function) ──▶ dieselbe Logik, dieselbe Anmeldung ──▶ Webhook / Datenbank
```

**Wer macht was**

| Instanz | Aufgabe | Darf nie |
|---|---|---|
| **Datenbank** | Rechte prüfen, Eingabe bauen (anonymisiert), Aufbau und Zeitbudget prüfen, jede Zahl prüfen, speichern, Prüfstatus berechnen | der KI oder dem Browser das Ergebnis `geprueft` überlassen |
| **Browser / Server-Funktion** | Ablauf steuern (Runden, Wiederholungen, Zeitbudget), mit der **Anmeldung des Admins** die Datenbankfunktionen rufen, Anfrage an den Webhook schicken | einen Dienstschlüssel (`service_role`) besitzen; Zahlen selbst rechnen |
| **Webhook (n8n)** | Anmeldung bestätigen lassen, Anfrage prüfen, nach `aufgabe` den Strang wählen, die KI fragen, Antwort lesen und bündeln | in die Datenbank schreiben; Daten behalten (keine erfolgreichen Ausführungen speichern) |
| **KI (Claude)** | Text formulieren | Zahlen erfinden, Namen nennen |

**Drei Wege zur KI, derselbe Code:**
1. **Browser → Webhook** (Standard): die Oberfläche führt den Ablauf selbst aus (`ki.ts`, Anhang E).
2. **Server-Funktion → Webhook** (Rückfall): dieselbe Logik auf dem Server. Schalter zum Erzwingen: `localStorage.setItem('dawiid-ki-weg', 'edge')`.
3. **Server-Funktion → Anthropic direkt** (Variante ohne n8n): `AI_PROVIDER=claude` mit eigenem Schlüssel.

Die Logik steht **einmal** in einer reinen TypeScript-Datei (`analyse.ts`, ohne Bezug zu einer Laufzeit). Browser und Server importieren dieselbe Datei. So bleiben beide Wege gleich und lassen sich mit Node testen.

---

## 4. Datenmodell und Rechte

### 4.1 Tabelle für alle Ergebnisse

Eine Tabelle `analysen` hält Einzelanalysen, Gesamtauswertung und Agenda. Je Mandant, Monat, Typ und Person gibt es **eine** Zeile (`unique` über den Ausdruck mit `coalesce`, weil Team-Typen keine Person haben). In den SQL-Auszügen heißt der Mandant `salon` (`salons`, `salon_id`), die Leitung `verantwortlicher`.

````sql
create table if not exists public.analysen (
  id              uuid primary key default gen_random_uuid(),
  salon_id        uuid        not null references public.salons (id) on delete cascade,
  monat           date        not null check (extract(day from monat) = 1),
  typ             text        not null check (typ in ('person', 'team_agenda')),
  person_id       uuid        references public.personen (id) on delete cascade,
  status          text        not null default 'entwurf' check (status in ('entwurf', 'freigegeben')),
  text            text        not null default '',
  ausgabe         jsonb,
  eingabe_hash    text,
  prompt_version  text,
  anbieter        text,
  modell          text,
  versuche        integer,
  geprueft        boolean     not null default false,
  pruef_hinweis   text,
  bearbeitet      boolean     not null default false,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  bearbeitet_am   timestamptz,
  bearbeitet_von  text,
  freigegeben_am  timestamptz,
  freigegeben_von text,
  check ((typ = 'person') = (person_id is not null))
);

comment on table public.analysen is 'KI-Analysen als Entwurf oder freigegeben (Erweiterung E). Je Salon, Monat, Typ und Person eine Zeile.';

create unique index if not exists analysen_eindeutig
  on public.analysen (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid)));
````

Der Typ `team_gesamt` kam später dazu. Wer einen Typ nachträgt, muss die **Check-Bedingung tauschen** (Anhang C, `do`-Block), sonst lehnt die Datenbank ihn ab.

Wichtige Spalten:

| Spalte | Bedeutung |
|---|---|
| `status` | `entwurf` oder `freigegeben` |
| `ausgabe` | die strukturierte Antwort (JSON), bei der Agenda die fünf Blöcke |
| `text` | derselbe Inhalt als lesbarer Text (zum Bearbeiten und für Berichte) |
| `eingabe_hash` | `md5` der Eingabe: gleiche Eingabe und gleiche Prompt-Version heißt **kein neuer KI-Aufruf** |
| `prompt_version` | z. B. `agenda-ki-v1`; wer einen Prompt ändert, erhöht sie, dann gilt die Eingabe als neu |
| `anbieter`, `modell`, `versuche` | woher der Text kommt und wie oft die KI gefragt wurde (`vorlage` bei der Vorlage) |
| `geprueft`, `pruef_hinweis` | Ergebnis des Faktenchecks, **von der Datenbank berechnet** |

### 4.2 Rechte: ein Schalter, eine Prüfstelle

Alle KI-Funktionen laufen durch **eine** Funktion (`ki_salon()`), die den Mandanten liefert oder mit `42501` abbricht. Ändert sich die Regel (zum Beispiel „auch Verantwortliche“), ändert man nur den Schalter.

````sql
alter table public.salons
  add column if not exists ki_nur_admin boolean not null default true;

comment on column public.salons.ki_nur_admin is
  'Standard an: Nur der Admin darf KI-Analysen erstellen, lesen, bearbeiten und freigeben. Aus: auch Verantwortliche.';

-- ----------------------------------------------------------------------------
-- Zugriff: Salon, für den die aufrufende Person KI nutzen darf
-- ----------------------------------------------------------------------------
create or replace function private.ki_salon()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon     uuid := private.leitung_salon();
  v_nur_admin boolean;
begin
  if v_salon is null then
    raise exception 'Nur für Verantwortliche und Admins.' using errcode = '42501';
  end if;
  if private.rolle() is distinct from 'admin' then
    select s.ki_nur_admin into v_nur_admin from public.salons s where s.id = v_salon;
    if coalesce(v_nur_admin, true) then
      raise exception 'Nur für Admins.' using errcode = '42501';
    end if;
  end if;
  return v_salon;
end
$$;

revoke all on function private.ki_salon() from public;
````

Fehlermeldungen (auf Deutsch, damit die Oberfläche sie direkt zeigen kann):

| Fall | Code | Meldung |
|---|---|---|
| Mitarbeiter oder nicht angemeldet | `42501` | „Nur für Verantwortliche und Admins.“ |
| Verantwortliche, Schalter an | `42501` | „Nur für Admins.“ |
| Eingabe unvollständig oder Aufbau falsch | `22023` | konkrete deutsche Meldung (siehe 6.2) |

### 4.3 Grundregeln für die Funktionen

- Tabellen sind per Row Level Security **gesperrt**, es gibt keine Policies. Der Zugriff läuft nur über Funktionen mit `security definer` und `set search_path = ''`.
- Hilfsfunktionen liegen in einem Schema `private` und sind für niemanden außer den Funktionen aufrufbar.
- Öffentliche Funktionen: `revoke ... from public, anon;` und `grant execute ... to authenticated;`. Die Rechteprüfung steckt trotzdem in der Funktion selbst.
- Migrationen sind **wiederholbar** (`create or replace`, `if not exists`) und enthalten kein `DROP` und kein `DELETE`.

---

## 5. Die Eingabe für die KI

Die Eingabe baut **immer die Datenbank**. Sie ist deterministisch: gleiche Daten ergeben dieselbe Eingabe und denselben Hash.

### 5.1 Regeln

| Regel | Einzelanalyse | Gesamtauswertung | Agenda |
|---|---|---|---|
| Namen, E-Mail-Adressen, Kennungen | nie | nie | nie |
| Kommentartexte | ja, **anonymisiert** („die bewertete Person“, „Kollege A, B …“) | **nie**, nur die Anzahl | **nie** |
| Einzelpersonen | die eine Person | nie | nie |
| Begründungen der Leitung (z. B. zum Fokus) | nie | nie | **nie**, nur Nummer und Titel |
| Zahlen | vorgerechnet, im deutschen Format | vorgerechnet | vorgerechnet |

Dazu kommt eine **Namensprüfung im Test**: Alle Namensteile aller Personen (Vor-, Nach-, Doppelnamen, Teile mit Bindestrich) dürfen in der Eingabe nirgends vorkommen.

### 5.2 Aufbau der Team-Eingabe

Die Gesamtauswertung und die Agenda teilen sich dieselbe Team-Eingabe. Die Agenda ergänzt sie um Fokus und Zeitbudget.

| Feld | Inhalt |
|---|---|
| `monat`, `skala`, `bewertet` | Zeitraum, Notenskala („Noten von 1 (niedrig) bis 5 (hoch)“), Bezug („das Team“) |
| `kennzahlen` | Selbstbild, Fremdbild, Differenz, Einordnung (z. B. „Selbstunterschätzung“), Stufe |
| `beteiligung` | erwartet / abgegeben |
| `vormonat` | dieselben Kennzahlen des Vormonats und Veränderungen (fehlt, wenn es keinen gibt) |
| `verhalten` | je Verhalten: Nummer, Titel, Säule, Selbstbild, Fremdbild, Differenz, Stufe, Vormonat, Veränderung |
| `staerken`, `entwicklungsfelder` | die höchsten und niedrigsten Fremdbilder |
| `groesste_differenzen`, `groesste_veraenderungen` | Auffälligkeiten über den Schwellen |
| `schwellen` | die Grenzwerte (hoch, niedrig, ausgewogen), damit die KI Einordnungen nicht erfindet |
| `kommentare` | nur Zahlen: `fremdbild_bewertungen`, `davon_mit_kommentar` |
| `personen_mit_bewertung` | Anzahl der Personen, die in diesem Monat bewertet wurden |
| `fokus_verhalten` | Nummer und Titel |
| nur Agenda: `fokus_aktuell` | die Fokus-Verhalten von **heute** (Nummer und Titel) |
| nur Agenda: `zeitbudget` | Summe (15 bis 20) und je Block `min`, `max`, `vorschlag` |

**Beispiel** (gekürzt, Listen auf zwei Einträge verkürzt):

````json
{
  "team": {
    "monat": "2026-09",
    "skala": "Noten von 1 (niedrig) bis 5 (hoch)",
    "bewertet": "das Team",
    "staerken": [
      {
        "nr": 1,
        "titel": "Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird.",
        "fremdbild": 4
      },
      {
        "nr": 2,
        "titel": "Tritt vor dem Gast professionell auf und strahlt auch in anspruchsvollen Situationen Ruhe und Professionalität aus.",
        "fremdbild": 3.3
      }
    ],
    "vormonat": {
      "monat": "2026-08",
      "differenz": 1,
      "fremdbild": 2,
      "selbstbild": 3,
      "veraenderung_fremdbild": 1.8,
      "veraenderung_selbstbild": 0.3
    },
    "schwellen": {
      "hoch": 3.5,
      "niedrig": 2.5,
      "ausgewogen": 0.3
    },
    "verhalten": [
      {
        "nr": 1,
        "titel": "Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird.",
        "saeule": "Säule 1: Umgangsformen und Respekt",
        "differenz": -0.7,
        "fremdbild": 4,
        "selbstbild": 3.3,
        "grundpfeiler": "Grundpfeiler 1: Philosophie",
        "stufe_fremdbild": "hoch",
        "fremdbild_vormonat": 2,
        "veraenderung_fremdbild": 2
      },
      {
        "nr": 2,
        "titel": "Tritt vor dem Gast professionell auf und strahlt auch in anspruchsvollen Situationen Ruhe und Professionalität aus.",
        "saeule": "Säule 1: Umgangsformen und Respekt",
        "differenz": 0.3,
        "fremdbild": 3.3,
        "selbstbild": 3.5,
        "grundpfeiler": "Grundpfeiler 1: Philosophie",
        "stufe_fremdbild": "mittel",
        "fremdbild_vormonat": 2,
        "veraenderung_fremdbild": 1.3
      }
    ],
    "kennzahlen": {
      "differenz": -0.5,
      "fremdbild": 3.8,
      "einordnung": "Selbstunterschätzung",
      "selbstbild": 3.3,
      "stufe_fremdbild": "hoch"
    },
    "kommentare": {
      "davon_mit_kommentar": 7,
      "fremdbild_bewertungen": 8
    },
    "beteiligung": {
      "erwartet": 4,
      "abgegeben": 3
    },
    "fokus_verhalten": [
      {
        "nr": 1,
        "titel": "Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird."
      }
    ],
    "entwicklungsfelder": [
      {
        "nr": 2,
        "titel": "Tritt vor dem Gast professionell auf und strahlt auch in anspruchsvollen Situationen Ruhe und Professionalität aus.",
        "fremdbild": 3.3
      },
      {
        "nr": 1,
        "titel": "Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird.",
        "fremdbild": 4
      }
    ],
    "groesste_differenzen": [
      {
        "nr": 1,
        "titel": "Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird.",
        "differenz": -0.7,
        "fremdbild": 4,
        "selbstbild": 3.3
      }
    ],
    "personen_mit_bewertung": 3,
    "groesste_veraenderungen": [
      {
        "nr": 1,
        "titel": "Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird.",
        "fremdbild": 4,
        "fremdbild_vormonat": 2,
        "veraenderung_fremdbild": 2
      },
      {
        "nr": 2,
        "titel": "Tritt vor dem Gast professionell auf und strahlt auch in anspruchsvollen Situationen Ruhe und Professionalität aus.",
        "fremdbild": 3.3,
        "fremdbild_vormonat": 2,
        "veraenderung_fremdbild": 1.3
      }
    ]
  },
  "monat": "2026-09",
  "aufgabe": "Agenda für das nächste Teammeeting",
  "zeitbudget": {
    "bloecke": [
      {
        "id": "einstieg",
        "max": 2,
        "min": 2,
        "titel": "Einstieg und Beteiligung",
        "vorschlag": 2
      },
      {
        "id": "kennzahlen",
        "max": 3,
        "min": 3,
        "titel": "Team-Kennzahlen des Monats",
        "vorschlag": 3
      },
      "…"
    ],
    "gesamt_max": 20,
    "gesamt_min": 15
  },
  "fokus_aktuell": [
    {
      "nr": 1,
      "titel": "Bittet den Gast um Erlaubnis, bevor ein Kollege im Gespräch unterbrochen wird."
    }
  ]
}
````

### 5.3 Wenn du das auf eine andere Plattform überträgst

Die Felder oben gehören zur Umfrage von DAWIID (Selbstbild, Fremdbild, Verhalten). **Der Inhalt ändert sich mit deinen Daten, die Regeln nicht.** Dein Eingabe-Baustein muss:

- [ ] **deterministisch** sein (gleiche Daten, gleiche Eingabe, gleicher Hash),
- [ ] **alle Zahlen vorrechnen**, die im Text vorkommen dürfen (Mittel, Differenzen, Veränderungen, Rangfolgen, Einordnungen),
- [ ] **Schwellen mitliefern**, nach denen eingeordnet wird,
- [ ] **nichts Personenbezogenes** enthalten (Namen, E-Mails, Kennungen, Freitext, der jemanden verrät),
- [ ] **fehlende Daten kenntlich machen** (kein Vormonat, geringe Beteiligung), statt Felder zu erfinden,
- [ ] ein **Zeitbudget** enthalten, wenn eine Agenda entstehen soll.

---

## 6. Die Agenda im Detail

### 6.1 Aufbau

Immer **fünf Blöcke in fester Reihenfolge**. Die Datenbank prüft Reihenfolge, Minuten und Summe.

| Block (`id`) | Titel | Minuten | Inhalt |
|---|---|---|---|
| `einstieg` | Einstieg und Beteiligung | genau 2 | Dank an das Team, wie viele abgegeben haben |
| `kennzahlen` | Team-Kennzahlen des Monats | genau 3 | Selbstbild, Fremdbild, Differenz, Einordnung, Vormonat |
| `fokus` | Fokus-Verhalten | 6 bis 8 (Vorschlag 7) | zuerst die Fokus-Verhalten, dann größte Differenzen, dann größte Veränderungen; **höchstens drei** Verhalten |
| `entwicklung` | Entwicklungsfelder und Differenzen | 3 bis 4 (Vorschlag 4) | die niedrigsten Fremdbilder, **ohne Wiederholung** aus dem Fokus-Block |
| `vereinbarungen` | Vereinbarungen | 2 bis 3 (Vorschlag 2) | offene Leitfragen: Was nehmen wir uns vor? Wer übernimmt welchen Schritt? Woran merken wir, dass es besser wird? |

**Summe: 15 bis 20 Minuten.**

### 6.2 Wer prüft was

| Prüfung | Datenbank (verbindlich) | Prompt (Wunsch an die KI) |
|---|---|---|
| fünf Blöcke, feste Reihenfolge, richtige `id` | ✔ | ✔ |
| Minuten ganzzahlig und im Bereich je Block | ✔ | ✔ |
| Summe 15 bis 20 Minuten | ✔ | ✔ |
| jeder Punkt ist Text, nicht leer, höchstens 600 Zeichen | ✔ | höchstens 300 Zeichen |
| **jede Zahl im Text steht in der Eingabe** (auch die Zahlen des Zeitbudgets) | ✔ | ✔ |
| Überschriften, Hinweis „Stand unvollständig“ | ✔ **setzt die Datenbank** | – |
| höchstens drei Verhalten im Fokus-Block | – | ✔ |
| keine Wiederholung zwischen Fokus und Entwicklung | – | ✔ |
| zwei bis vier Punkte je Block | – (n8n zeigt einen Hinweis) | ✔ |
| Sprechweise „Team“, keine Einzelpersonen | – | ✔ |

Die Meldungen der Datenbank sind so formuliert, dass sie **an die KI zurückgehen** können, zum Beispiel:

- „Der Block „Einstieg und Beteiligung“ dauert genau 2 Minuten.“
- „Der Block „Fokus-Verhalten“ darf 6 bis 8 Minuten dauern.“
- „Die Agenda soll 15 bis 20 Minuten dauern (jetzt 22 Minuten).“
- „Die Agenda braucht fünf Blöcke in fester Reihenfolge.“

Die Wiederholung bekommt diese Meldung oben in die Nachricht („Deine letzte Antwort passt nicht zur Vorgabe: …“).

### 6.3 Was die Datenbank selbst setzt

Die KI liefert nur `id`, `minuten` und die Punkte (als Texte). Die Datenbank ergänzt:

- die **Titel** der Blöcke (aus der Vorlage, nicht von der KI),
- `unvollstaendig` und die **Hinweise** („Der Monat ist noch nicht abgeschlossen.“, „Es haben erst 3 von 4 Personen abgegeben.“), die am Anfang der Agenda stehen,
- die Summe der Minuten und die Kennzeichnung `agenda-ki-v1`,
- `geprueft` und `pruef_hinweis` (Faktencheck).

### 6.4 Lebenslauf einer Agenda

```
Vorlage erzeugen (ohne KI)  ─┐
                             ├─▶ Entwurf ─▶ bearbeiten (Aufbau fest, Texte frei) ─▶ Entwurf ─▶ freigeben
Mit KI formulieren          ─┘
```

- **Bearbeiten:** Überschriften, Reihenfolge und Hinweise bleiben fest. Bei einer KI-Agenda läuft der **Faktencheck erneut**, denn die Leitung könnte eine Zahl geändert haben. Danach ist sie wieder ein Entwurf.
- **Neu mit KI formulieren:** Wurde die Agenda bearbeitet, fragt die Oberfläche vorher nach („Die Agenda wurde bearbeitet. Soll die KI sie neu schreiben?“). Unbearbeitet geht es ohne Rückfrage.
- **Vorlage erzeugen** ersetzt eine KI-Agenda vollständig und **setzt Anbieter, Modell, Versuche und Eingabe-Hash zurück**.
- **Gleiche Eingabe, gleiche Prompt-Version:** kein neuer KI-Aufruf („übersprungen“), außer es wird ausdrücklich „neu“ verlangt.
- Die KI-Agenda enthält **keine** Kommentar-Beispiele (die zeigt nur die Vorlage auf der Plattform, nie in Mails oder PDFs).

---

## 7. Der Faktencheck

**Regel:** Jede Zahl im Text und in der strukturierten Ausgabe muss in der Eingabe vorkommen. Das prüft die Datenbank, nicht die KI.

| Detail | Verhalten |
|---|---|
| Schreibweise | `3,5` = `3.5` = `3,50` (gleicher Wert) |
| Vorzeichen | zählt nicht (`-0,1` und `0,1` sind erlaubt, wenn `0,1` in der Eingabe steht) |
| Noten 1 bis 5 | **immer erlaubt** (Notenskala) |
| Listennummern am Zeilenanfang („1.“, „2)“) | werden ignoriert |
| Ergebnis | `geprueft`, Liste der `abweichungen` (z. B. `4,71`), lesbarer `hinweis` |

**Beispiel:** Schreibt die KI „Fremdbild 4,71“ und `4,71` steht nicht in der Eingabe, ist `geprueft = false` und der Hinweis lautet „Faktencheck nicht bestanden: 4,71 steht nicht in den Daten“. Die Plattform fragt dann (höchstens zweimal) mit genau dieser Zahl neu. Besteht auch die letzte Fassung nicht, wird sie **trotzdem als Entwurf gespeichert**, mit dem Hinweis. Die Leitung sieht ihn neben dem Text.

**Grenzen (ehrlich):** Der Check prüft Zahlen, nicht Bedeutung. Eine richtige Zahl am falschen Verhalten fällt nicht auf. Darum bleibt die Freigabe beim Menschen.

**Fallstrick:** Zusatzkontext im Workflow (zum Beispiel Besonderheiten des Betriebs) darf **keine Zahlen** enthalten, die nicht in den Daten stehen. Die KI würde sie verwenden, und der Faktencheck lehnt sie ab.

Der Code steht in Anhang C.

---

## 8. Prompts

**Grundsätze**

- Der Prompt kommt aus der **Plattform** (versioniert im Code), **nicht** aus n8n. n8n hängt höchstens einen Zusatzkontext an. So ändern sich Prompt und Prüfregeln immer gemeinsam.
- Wer einen Prompt ändert, **erhöht die Version** (`analyse-v1` → `analyse-v2`). Dann gilt die Eingabe als neu, und die KI wird auch für schon vorhandene Analysen erneut gefragt, wenn der Admin „neu“ verlangt.
- Die **Branche** steht im ersten Satz („… eines Friseursalons …“). Für eine andere Branche nur diesen Satz ändern und die Version erhöhen.
- Alle Prompts verlangen: nur Zahlen aus den Daten, deutsches Format mit Komma, nichts selbst rechnen, keine erfundenen Prozentwerte, fehlende Daten offen nennen, keine Aussagen zu Gehalt, Kündigung, Gesundheit oder Recht, kurz und konkret.
- Die Antwort ist **ein JSON-Objekt ohne Code-Block**. Die Plattform liest trotzdem auch Antworten mit Zaun oder Text davor (siehe Anhang B).

Die drei Prompts im Wortlaut stehen in **Anhang A**. Bewährt hat sich, die **Ausgabeform im Prompt als Beispiel** zu zeigen (bei der Agenda mit den Vorschlagsminuten).

---

## 9. Ablauf der Orchestrierung

Alle Aufgaben laufen durch dieselbe Funktion `arbeiteZiele`. Ein **Ziel** ist eine Analyse, die entstehen soll (Eingabe, Prompt, Leseregel, Prüfung). Beim Sammellauf gibt es mehrere Ziele, sonst eins.

### 9.1 Kennwerte

| Wert | Standard | Bedeutung |
|---|---|---|
| `MAX_AUFRUFE` | 3 | Runden je Ziel (ein erster Versuch, bis zu zwei Wiederholungen) |
| `ZEITBUDGET_MS` | 135 000 | Gesamtzeit je Anfrage; die Server-Funktion antwortet spätestens nach 150 s |
| `MAX_KI_ZEIT_MS` | 120 000 | Obergrenze für einen KI-Aufruf |
| `MIN_RUNDE_MS` | 20 000 | Bleibt weniger Zeit, startet keine neue Runde |
| `PAKET_GROESSE` | 2 | Personen je Aufruf des Sammellaufs (n8n Cloud beendet Anfragen nach etwa 100 s) |
| `max_tokens` | 4096 | Ausgabegrenze der KI (im n8n-Knoten und im Direktweg) |

### 9.2 Ablauf in Worten

1. **Eingabe holen** (Datenbankfunktion) und die vorhandene Analyse lesen.
2. Gleicher Hash **und** gleiche Prompt-Version, nicht „neu“ → **übersprungen**.
3. Sonst **Runde 1**: alle offenen Ziele in **einem** Aufruf an den Webhook (ein Auftrag je Ziel).
4. Je Auftrag: Antwort **lesen** (JSON). Gelingt das nicht → Hinweis „war kein gültiges JSON“ (oder „war abgeschnitten, fasse dich kürzer“) und nächste Runde.
5. Gelesen → **Datenbank prüfen lassen** (Aufbau, Zeitbudget, Zahlen). Bestanden → fertig. Nicht bestanden → nächste Runde mit der Meldung der Datenbank.
6. Nach höchstens drei Runden oder bei Zeitmangel: die **letzte lesbare Fassung** zählt, auch ohne bestandenen Faktencheck.
7. **Speichern** über die Datenbankfunktion (die prüft noch einmal und lehnt bei falschem Aufbau mit einer deutschen Meldung ab).

Scheitert in einer Runde **jeder** Auftrag am Anbieter (Zugang, Auslastung, Zeit), bricht der Ablauf mit dessen Fehler ab. Scheitert nur ein Teil, kommt dieser Teil in die nächste Runde.

### 9.3 Die Wiederholungstexte

| Anlass | Text an die KI (oben in der Nachricht) |
|---|---|
| kein gültiges JSON | „Deine letzte Antwort war kein gültiges JSON im vorgegebenen Format. Antworte nur mit dem JSON-Objekt und allen Schlüsseln.“ |
| abgeschnitten | „Deine letzte Antwort war abgeschnitten (das JSON war nicht zu Ende). Fasse dich kürzer: je Punkt ein kurzer Satz, höchstens drei Punkte je Block. Antworte nur mit dem vollständigen JSON-Objekt.“ |
| Zahlen nicht in den Daten | „Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: 4,71. Formuliere neu und verwende nur Zahlen aus den Daten.“ |
| Aufbau falsch (Agenda) | „Deine letzte Antwort passt nicht zur Vorgabe: <Meldung der Datenbank> Halte dich genau an die fünf Blöcke, ihre Reihenfolge und die Minuten aus dem Zeitbudget.“ |

### 9.4 Sammellauf

- Die Liste der Personen kommt aus der Übersichtsfunktion der Datenbank, die **nur Admins** mit Analyse-Zuständen bekommen (sonst „Nur für Admins.“).
- Je Aufruf bearbeitet die Funktion die **nächsten zwei** Personen ohne Analyse und meldet `erstellt`, `fehlgeschlagen` und `verbleibend`.
- Die **Oberfläche ruft in einer Schleife erneut auf**, bis `verbleibend` 0 ist. Gescheiterte Personen kommen in die Liste `ausgenommen`, damit sie nicht endlos wiederholt werden.
- Der Monat muss abgeschlossen sein („Der Monat ist noch nicht abgeschlossen.“).

### 9.5 Fehler der Datenbank → Meldungen

| Datenbank | wird zu |
|---|---|
| `42501` mit „permission denied“ | 401 „Bitte melde dich an.“ |
| `42501` sonst | 403, die Meldung der Datenbank („Nur für Admins.“) |
| `22023` | 422, die Meldung der Datenbank |
| alles andere | 500 „Die Analyse konnte nicht erstellt werden.“ |

Den Code von Konstanten, Ablauf und Agenda-Aufgabe zeigt Anhang D.

---

## 10. Webhook-Protokoll und n8n-Workflow

> **Dieses Kapitel ist die Vorlage für weitere Plattformen.** Der Workflow in `n8n/dawiid-ki.workflow.json` beschreibt genau das, was jede Plattform braucht: einen Webhook, eine Anmeldeprüfung, einen Schalter nach Aufgabe, einen KI-Aufruf je Strang und eine einheitliche Antwort.

### 10.1 Protokoll

**Anfrage** (die Plattform an den Webhook, mit `Authorization: Bearer <Anmeldung>`):

````json
{
  "aufgabe": "agenda",
  "prompt_version": "agenda-ki-v1",
  "auftraege": [
    {
      "ref": "1",
      "system": "…Prompt…",
      "nachricht": "Daten (JSON):\n{…}",
      "eingabe": "{…siehe oben…}"
    }
  ]
}
````

- `aufgabe`: `einzelanalyse`, `gesamtauswertung` oder `agenda`.
- `auftraege`: ein Auftrag je Analyse. `ref` ist eine **laufende Nummer** („1“, „2“, …), **nie** eine Kennung aus der Datenbank.
- `system` ist der Prompt, `nachricht` die Daten als Text („Daten (JSON):\n{…}“), `eingabe` dieselben Daten als Objekt.

**Antwort** (direkt als Antwort des Webhooks):

````json
{
  "aufgabe": "agenda",
  "ergebnisse": [
    { "ref": "1", "code": 200, "ausgabe": { "bloecke": [ … ] },
      "meta": { "strang": "Agenda", "prompt_version": "agenda-ki-v1", "hinweise": [],
                "stop_reason": "end_turn", "ausgabe_token": 410 } },
    { "ref": "2", "code": 502, "fehler": "Die KI ist nicht erreichbar oder hat nicht geantwortet.", "detail": "…" }
  ]
}
````

- Ein Fehler bei einem Auftrag stoppt die anderen nicht.
- Ist **jeder** Auftrag gescheitert, steht das auch im Status (`429` ausgelastet, sonst `502`).
- Unvollständige Anfragen: `400` mit den Gründen unter `details`. Fehlende Anmeldung: `401`.
- `meta` ist nur zur Orientierung beim Testen, die Plattform ignoriert es.

### 10.2 Die Knoten

```
Webhook → Anmeldung prüfen → Angemeldet? ─ja─▶ Anfrage prüfen → Gültig? ─ja─▶ Aufgabe wählen ─┬─▶ Claude Einzelanalyse ───┐
                                  └─nein─▶ Nicht angemeldet (401)        └─nein─▶ Anfrage ungültig (400)   ├─▶ Claude Gesamtauswertung ┤
                                                                                                           └─▶ Claude Agenda ──────────┤
Antwort senden ◀── Antwort bündeln ◀── Zahlencheck (Orientierung) ◀── Antwort lesen ◀─────────────────────────────────────────────────┘
```

| Knoten | Typ | Aufgabe |
|---|---|---|
| **Webhook** | Webhook (POST, Antwort über „Respond to Webhook“, CORS erlaubt) | nimmt die Anfrage an |
| **Anmeldung prüfen** | HTTP Request | fragt bei der Datenbank-Plattform, ob die mitgeschickte Anmeldung gültig ist |
| **Angemeldet?** | IF | ja bei Status 200 (im Editor-Test immer ja) |
| **Nicht angemeldet** | Respond to Webhook | `401` `{"ok": false, "fehler": "Bitte melde dich an."}` |
| **Anfrage prüfen** | Code | Aufgabe bekannt? Aufträge vollständig? Hier steht die Einstellung je Aufgabe (`AUFGABEN`) und der **Zusatzkontext** |
| **Gültig?** / **Anfrage ungültig** | IF / Respond | `400` mit Gründen |
| **Aufgabe wählen** | Switch | leitet nach `aufgabe` an den Strang |
| **Claude …** (drei) | HTTP Request | fragt die Anthropic-API, ein Aufruf je Auftrag, **alle gleichzeitig** |
| **Antwort lesen** | Code (je Auftrag) | holt das JSON aus der Antwort, prüft Form, meldet `stop_reason` |
| **Zahlencheck (Orientierung)** | Code | zeigt schon beim Testen Zahlen, die nicht in den Daten stehen |
| **Antwort bündeln** | Code | eine Antwort für alle Aufträge |
| **Antwort senden** | Respond to Webhook | schickt die Antwort an die Plattform |

Die Parameter der wichtigsten Knoten stehen in **Anhang F**.

### 10.3 Anmeldeprüfung: warum so

Der Webhook steht im Internet, seine Adresse steht im Code. Ohne Schutz könnte jeder, der sie kennt, den Workflow auslösen und Kosten bei der KI verursachen. Eine **gemeinsame Geheimzahl** im Browser wäre keine: Jeder könnte sie im Quelltext lesen. Deshalb gilt:

- Die Plattform schickt die **Anmeldung der Person** mit (`Authorization: Bearer …`).
- Der Knoten **Anmeldung prüfen** schickt sie an die Plattform zurück (bei Supabase: `GET /auth/v1/user` mit dem öffentlichen anon-Schlüssel). Antwortet sie mit 200, geht es weiter, sonst `401`, **bevor irgendetwas an die KI geht**.
- Das funktioniert **unabhängig vom Signaturverfahren** der Anmeldung. Eine Prüfung der Signatur in n8n (JWT-Credential) würde nur bei HS256 mit bekanntem Geheimnis klappen und bei neueren Projekten mit asymmetrischen Schlüsseln scheitern.
- Im **Editor-Test** (`$execution.mode === 'test'`) entfällt die Prüfung, damit Testanfragen ohne Anmeldung laufen.

Bei einer anderen Plattform ersetzt du nur diesen einen HTTP-Aufruf durch deren „Wer bin ich?“-Endpunkt.

### 10.4 Claude direkt über HTTP statt „KI-Agent“-Knoten

Die erste Fassung benutzte den **KI-Agenten-Knoten** von n8n. Er lieferte **zerstückelten, leeren oder abgeschnittenen Text** (Einzelheiten in Kapitel 13). Der Aufruf der Anthropic-API über einen gewöhnlichen **HTTP-Request-Knoten** ist deterministisch:

- Antwort **vollständig**, dazu `stop_reason` (`end_turn` oder `max_tokens`) und `usage.output_tokens`.
- Mehrere Aufträge laufen mit *Batching* **gleichzeitig**.
- Fehler der API (`rate_limit_error`, `overloaded_error`, `authentication_error`, …) kommen als Antwortkörper zurück (`neverError`) und werden in **Antwort lesen** in `429` oder `502` mit dem Grund übersetzt.
- Der Prompt kommt aus der Plattform: `system: $json.system`, `messages: [{ role: 'user', content: $json.nachricht }]`.

### 10.5 Antwort lesen, Zahlencheck, Bündeln

- **Antwort lesen** setzt die Textteile der API-Antwort zusammen, entfernt Code-Zäune, **entfernt Zeilenumbrüche mitten in Wörtern** (siehe Anhang B), sucht das erste vollständige `{…}` und prüft die Form (Blöcke, Minuten, Punktezahlen, Summe). Abweichungen landen als **Hinweise** in `meta.hinweise`, sie sind kein Fehler. Verbindlich prüft die Plattform.
- **Zahlencheck** zeigt `meta.zahlen_nicht_in_daten`. Das ist eine Orientierung beim Testen. Maßgeblich bleibt der Faktencheck der Datenbank.
- **Antwort bündeln** macht aus den Ergebnissen aller Aufträge eine Antwort mit dem richtigen Status.

### 10.6 Einen neuen Strang oder eine neue Plattform anbinden

**Neue Aufgabe** (zum Beispiel eine Quartalsauswertung):

1. In **Anfrage prüfen** die Aufgabe in `AUFGABEN` eintragen (Name, Form, Listenlängen, Zusatzkontext).
2. In **Aufgabe wählen** eine Regel ergänzen.
3. Einen Knoten **Claude …** kopieren, an die neue Regel hängen, den Ausgang mit **Antwort lesen** verbinden.
4. Auf Seiten der Plattform: Prompt, Version, Eingabe-Baustein, Leseregel, Prüfung (Kapitel 5 bis 9).

**Neue Plattform** (derselbe Workflow, andere Quelle):

1. Workflow **duplizieren** und umbenennen (oder denselben Workflow weiterverwenden, wenn die Aufgaben gleich sind).
2. In **Anmeldung prüfen** die Adresse und den öffentlichen Schlüssel der neuen Plattform eintragen.
3. Beim Webhook einen **neuen Pfad** vergeben und die Adresse in den Code der neuen Plattform eintragen.
4. Bei den Claude-Knoten die Anthropic-Zugangsdaten auswählen.
5. Ist die Aufgabe dieselbe, bleibt **alles andere unverändert**: Protokoll, Lesen, Bündeln.

### 10.7 Grenzen von n8n Cloud

- Anfragen werden nach etwa **100 Sekunden** beendet. Darum höchstens zwei Aufträge je Anfrage (Sammellauf in Paketen) und parallele Aufrufe.
- Erfolgreiche Ausführungen werden **nicht gespeichert** (`saveDataSuccessExecution: none`), damit keine Daten dort liegen bleiben.
- n8n braucht **keinen** Zugang zur Datenbank. Es kennt nur die öffentliche Adresse, bei der es eine Anmeldung bestätigen lässt.

---

## 11. Die Oberfläche

Die Oberfläche steuert den Ablauf (Anhang E) und zeigt Zustand und Ergebnis. Anforderungen an jede Plattform:

**Agenda-Seite (nur Admin sieht die KI-Knöpfe)**

| Element | Verhalten |
|---|---|
| **Agenda erzeugen** / **Neu erzeugen** | Vorlage ohne KI, bleibt immer daneben |
| **Mit KI formulieren** / **Neu mit KI formulieren** | startet den KI-Ablauf; während der Arbeit eine Statusanzeige, Knöpfe gesperrt |
| Rückfrage vor „Neu …“ | nur wenn die Agenda **bearbeitet** wurde („Die Agenda wurde bearbeitet. Soll die KI sie neu schreiben?“ mit „Ja, neu formulieren“ und „Abbrechen“) |
| **Abzeichen** | „Von der KI formuliert“, „Faktencheck bestanden“ oder „Faktencheck nicht bestanden“; Anbieter und Versuche („Formuliert von der KI (webhook), 2 Versuche“) |
| **Prüfhinweis** | bei nicht bestandenem Faktencheck der Hinweis der Datenbank („4,71 steht nicht in den Daten“); die **Freigabe bleibt möglich**, die Leitung entscheidet |
| **Bearbeiten, Freigeben, PDF** | wie bei der Vorlage |
| **Hinweis „Stand unvollständig“** | wenn der Monat nicht abgeschlossen ist oder Abgaben fehlen |

**Monatsabschluss-Seite (nur Admin)**

- Je Person **Erstellen** (Einzelanalyse), dazu **Alle fehlenden erstellen** (Sammellauf, Schleife in Paketen, Fortschrittsanzeige, Liste der Gescheiterten mit Grund).
- Die **Gesamtauswertung** des Teams mit demselben Abzeichen und Entwurf-Freigabe-Ablauf.
- Ein Hinweis, dass KI zurzeit nur für Admins ist (`ki-nur-admin`).

**Meldungen, wie sie ein Mensch lesen soll:** Die Oberfläche zeigt die deutsche Meldung der Datenbank oder des Ablaufs („Die KI ist noch nicht eingerichtet.“, „Nur für Admins.“, „Der KI-Zugang wurde abgelehnt …“). Danach lässt sich erneut versuchen oder die Vorlage nehmen.

**Browser-Ablauf mit Rückfall**

```
rufeKi(aufgabe):
  1. kiDirekt(): Browser → Datenbank (Eingabe) → Webhook (mit Anmeldung) → Datenbank (prüfen, speichern)
       Webhook nicht erreichbar (kein Netz, CORS)  →  null
  2. null → Server-Funktion (Edge Function) mit derselben Aufgabe
  3. alle anderen Fehler → deutsche Meldung an die Oberfläche
```

„Nicht erreichbar“ heißt: die **Verbindung kam gar nicht zustande** (ein `TypeError` des Browsers). Zeitüberschreitungen und HTTP-Fehler zählen nicht, sonst würde die Aufgabe doppelt laufen und doppelt kosten. Den Code zeigt Anhang E.

**Für Tests und die Fehlersuche:** `localStorage.setItem('dawiid-ki-weg', 'edge')` erzwingt den Weg über die Server-Funktion, `localStorage.removeItem('dawiid-ki-weg')` stellt den Standard wieder her.

---

## 12. Rechte, Datenschutz, Sicherheit

| Wer | Einzelanalyse, Sammellauf, Gesamtauswertung, Agenda (KI) | Vorlage-Agenda, Lesen, Bearbeiten, Freigeben | PDF mit Freigegebenem |
|---|---|---|---|
| Admin | ✔ | ✔ | ✔ |
| Verantwortliche | nur mit `ki_nur_admin = false` | ✔ (Agenda), Analysen nur mit Schalter | ✔ |
| Mitarbeiter | ✘ (`42501`) | ✘ | ✘ |
| nicht angemeldet | ✘ | ✘ | ✘ |

**Was an die KI geht:** nur die Eingabe aus Kapitel 5 (ohne Namen, ohne Kennungen, bei Team-Aufgaben ohne Kommentartexte, nie die Begründung der Leitung). Der Datenschutzhinweis in der Plattform nennt die Station ehrlich: **vom Browser des Admins an einen Automatisierungsdienst (n8n), der an den KI-Anbieter (Anthropic) weitergibt**. Der Admin weist sich mit seiner Anmeldung aus, ohne gültige Anmeldung nimmt der Dienst nichts an. Die Antwort kommt direkt zurück und wird von der Datenbank geprüft und gespeichert.

**Sicherheitsregeln, die auf jeder Plattform gelten**

- [ ] **Kein `service_role`-Schlüssel** im Browser, in der Server-Funktion der KI, im Workflow oder im Repository. Alle Aufrufe laufen mit der **Anmeldung der Person**.
- [ ] Das Frontend prüft beim Start, dass der eingetragene Schlüssel die Rolle `anon` hat (Schutz vor dem schlimmsten Fehler).
- [ ] Der Webhook verlangt eine **gültige Anmeldung** (10.3). Seine Adresse darf im Code stehen, ein Geheimnis nicht.
- [ ] Jede Datenbankfunktion prüft das **Recht selbst**. Verstecktes Menü oder gesperrte Route in der Oberfläche sind nur Komfort.
- [ ] `ki_nur_admin` (oder der Schalter der neuen Plattform) **standardmäßig an**.
- [ ] Keine erfolgreichen Ausführungen in n8n speichern.
- [ ] Prompts und Prüfregeln liegen **versioniert im Repository**.

---

## 13. Stolpersteine aus der Praxis

Das ist passiert, als die Funktionen zum ersten Mal mit echtem n8n liefen. Wer sie kennt, spart Stunden.

| # | Symptom | Ursache | Lösung |
|---|---|---|---|
| 1 | Antwort enthält **Zeilenumbrüche mitten in Wörtern** („Fe↵edback“, „nul↵l“) und ist deshalb kein gültiges JSON | Der **KI-Agenten-Knoten** von n8n setzte die Antwort aus Stücken zusammen und fügte zwischen ihnen einen Umbruch ein | Claude direkt über HTTP (10.4). Zusätzlich entfernt der **Parser** solche Umbrüche (Anhang B), damit auch andere Wege nicht scheitern. |
| 2 | Einzelanalyse kam **leer** zurück („Der Agent hat keinen Text geliefert“) | derselbe Agenten-Knoten | wie 1 |
| 3 | Agenda und Gesamtauswertung **enden mitten im Satz** (nach etwa 2000 Zeichen) | Token-Limit von 2000 und/oder Verlust von Stücken im Agenten-Knoten | `max_tokens` auf **4096**; im Antwortkörper zeigt `stop_reason` (`max_tokens`), ob das Limit schuld war; bei Abschneiden bittet die Plattform um eine kürzere Fassung |
| 4 | Anfrage bricht nach etwa 100 s ab | n8n Cloud beendet lange Anfragen; ein Agent bearbeitet Aufträge nacheinander | Pakete zu **zwei** Personen, Aufrufe **gleichzeitig** (Batching) |
| 5 | Im Browser „Failed to fetch“, obwohl der Webhook läuft | **CORS**: n8n erlaubte den Aufruf aus dem Browser nicht | im Webhook-Knoten *Allowed Origins (CORS)* setzen; sonst nimmt die Plattform den **Rückfall** über die Server-Funktion |
| 6 | Wohin mit dem Geheimnis des Webhooks? | Ein Geheimnis im Browser ist keines; im Repository ist es für alle sichtbar | **Anmeldung der Person** statt Geheimnis (10.3) |
| 7 | JWT-Prüfung in n8n schlägt fehl | Neuere Projekte signieren Anmeldungen **asymmetrisch**, die Prüfung mit gemeinsamem Geheimnis (HS256) passt dann nicht | die Plattform selbst fragen („Wer bin ich?“) statt die Signatur zu prüfen |
| 8 | Neuer Typ in `analysen` wird abgelehnt | Die Check-Bedingung kennt nur die alten Typen | Bedingung in einem `do`-Block tauschen (Anhang C) |
| 9 | Team-Auswertungen ließen sich doppelt speichern | `person_id` ist `null`, und `unique` behandelt `null` als verschieden | Eindeutigkeit über `coalesce(person_id, '000…')` |
| 10 | Faktencheck lehnt Texte ab, obwohl die KI „nur Kontext“ nutzte | Zahlen im Zusatzkontext stehen nicht in den Daten | keine Zahlen in den Zusatzkontext |
| 11 | Alte Analysen bleiben nach einer Prompt-Änderung „aktuell“ | Prompt geändert, Version nicht erhöht | **Version erhöhen**; dann gilt die Eingabe als neu |
| 12 | Zuordnung der Antworten im Sammellauf falsch | Antworten kommen in anderer Reihenfolge | `ref` je Auftrag (laufende Nummer), Zuordnung über `ref`, **nie** über die Reihenfolge und nie über eine Datenbank-ID |
| 13 | Testlauf im Editor schlägt an der Anmeldung fehl | Beispielanfrage hat keine echte Anmeldung | im Editor-Test (`$execution.mode === 'test'`) entfällt die Prüfung |
| 14 | Webhook-Antwort wirkt „leer“, die Plattform meldet „kein Text“ | `neverError` verschluckt einen Fehler der API | „Antwort lesen“ übersetzt `{ type: 'error', error: { type, message } }` in `429` oder `502` mit dem Grund |

**Lehre aus 1 bis 3:** Wenn eine KI-Antwort unerwartet aussieht, zuerst den **rohen API-Aufruf** ansehen (`stop_reason`, `usage`), bevor man am Prompt dreht.

---

## 14. Checkliste: auf eine neue Plattform übertragen

### 14.1 Was wird ersetzt, was bleibt?

| Baustein | Auf der neuen Plattform | Hinweis |
|---|---|---|
| **Datenbank** (Postgres/Supabase) | übernehmen oder gleichwertig nachbauen | Wichtig sind die **Eigenschaften**: Funktionen mit Rechteprüfung, gesperrte Tabellen, deterministische Eingabe |
| Tabelle `analysen`, Schalter, Zugriffsfunktion | **1:1** übernehmen | Namen ggf. anpassen (Mandant statt Salon) |
| **Eingabe-Baustein** | **neu schreiben** für deine Daten | Regeln aus 5.3 einhalten |
| **Faktencheck** | **1:1** übernehmen | arbeitet nur auf JSON und Text |
| **Agenda-Aufbau und Prüfung** | übernehmen, Blöcke/Minuten anpassen | Zahlen stehen in einem Array, leicht zu ändern |
| **Prompts** | Branche und Begriffe anpassen, **Version erhöhen** | Anhang A |
| **Orchestrierung** (`analyse.ts`) | **1:1** übernehmen | reines TypeScript ohne Laufzeitbezug |
| **Browser-Ablauf** (`ki.ts`) | **1:1**, Client für die Datenbank anpassen | ruft nur `rpc`, `auth.getSession` |
| **Workflow-Dienst** (n8n) | Workflow **duplizieren**; ersetzbar durch Make, Zapier oder einen eigenen kleinen Dienst | muss: Webhook, Anmeldung prüfen, nach `aufgabe` verzweigen, KI aufrufen, Antwort im Protokoll liefern |
| **KI-Anbieter** | Claude über HTTP; ein anderer Anbieter ersetzt nur den Aufrufknoten und **Antwort lesen** | Prompt und Prüfung bleiben |
| **Oberfläche** | Anforderungen aus Kapitel 11 | Knöpfe, Abzeichen, Rückfragen, Schleife |

### 14.2 Reihenfolge

**Phase 1: Daten und Rechte**
- [ ] Tabelle `analysen` mit Eindeutigkeit, Typen und gesperrten Zugriffen anlegen.
- [ ] Schalter `ki_nur_admin` (Standard an) und `ki_salon()` / Entsprechung.
- [ ] Rechteprüfungen für Einzelperson, Team und Monat.

**Phase 2: Eingabe**
- [ ] Eingabe-Baustein je Aufgabe (Person, Team, Agenda) mit den Regeln aus 5.3.
- [ ] Test: **keine Namensteile** in der Eingabe, deterministischer Hash.

**Phase 3: Prüfen und Speichern**
- [ ] Faktencheck (Anhang C) und Tests mit Handrechnung.
- [ ] Agenda-Aufbau, Zeitbudget, Meldungen auf Deutsch (Anhang C).
- [ ] `…_eingabe`, `…_pruefen`, `…_speichern`, `…_lesen`, `…_bearbeiten`, `…_freigeben` je Typ.
- [ ] `geprueft` rechnet **nur** die Datenbank.

**Phase 4: Orchestrierung**
- [ ] `analyse.ts` übernehmen, Prompts und Version anpassen.
- [ ] Server-Funktion (Rückfall) mit **Anmeldung der Person**, ohne Dienstschlüssel.
- [ ] Browser-Ablauf (`ki.ts`) mit Rückfall.

**Phase 5: Workflow**
- [ ] Workflow importieren oder duplizieren, Webhook-Pfad vergeben, CORS setzen.
- [ ] **Anmeldung prüfen** auf die neue Plattform zeigen.
- [ ] Anthropic-Zugangsdaten an den Claude-Knoten, Workflow **veröffentlichen**.
- [ ] Editor-Test mit den Testanfragen (`testanfragen/*.json`), dann Test mit echter Anmeldung.

**Phase 6: Oberfläche**
- [ ] KI-Knöpfe nur für den Admin, Statusanzeige, Abzeichen, Prüfhinweis.
- [ ] Rückfrage bei „Neu …“ nach Bearbeitung.
- [ ] Sammellauf in Paketen mit Fortschritt und Fehlerliste.
- [ ] Datenschutzhinweis mit der Station n8n.

**Phase 7: Abnahme**
- [ ] Alle Tests aus Kapitel 15 grün.
- [ ] Ein echter Durchlauf je Aufgabe, `stop_reason` kontrolliert.
- [ ] Ein Durchlauf mit **bewusst falschem Aufbau** (zeigt die Wiederholung) und mit **nicht erreichbarem Webhook** (zeigt den Rückfall).

---

## 15. Tests

**Was bei DAWIID geprüft ist** (alle bestanden, lokal gegen nachgebaute Dienste):

| Ebene | Umfang | Prüft |
|---|---|---|
| Datenbank (pgTAP) | 887 Prüfungen insgesamt, davon die KI-Teile in drei Dateien (Einzelanalyse 151, Gesamtauswertung 118, Agenda 75) | Rechte, Eingabe ohne Namen, Faktencheck, Zeitbudget, Speichern, Bearbeiten, Mandantengrenze, Schalter |
| Server-Logik | 88 Tests | Orchestrierung, Runden, Zeitbudget, Webhook-Protokoll, Parser, Rückfall, Fehlerabbildung |
| n8n-Workflow | 31 Tests | Aufbau, Code-Knoten mit nachgebautem n8n-Kontext, ganzer Durchlauf, Anmeldeprüfung, API-Antworten |
| Browser (Playwright) | 354 Prüfungen | Knöpfe, Rückfragen, Abzeichen, Sammellauf, direkter Weg und Rückfall |

**Ein Mindestsatz an Testfällen für jede neue Plattform:**

1. Mitarbeiter und nicht Angemeldete bekommen `42501`; Verantwortliche bekommen bei gesetztem Schalter „Nur für Admins.“.
2. Die Eingabe enthält **keinen Namensteil** (Vor-, Nach-, Doppelnamen) und keine Kennung.
3. Der Faktencheck: erlaubt `3,5`/`3.5`/`3,50`, lehnt `4,71` ab, ignoriert Listennummern, erlaubt 1 bis 5.
4. Agenda: falsche Minuten (Meldung **wörtlich** prüfen), falsche Reihenfolge, Summe unter 15 und über 20, zu langer Punkt.
5. Speichern: Entwurf, `geprueft` von der Datenbank, zweites Speichern ersetzt die erste Zeile.
6. Bearbeiten einer KI-Agenda führt den Faktencheck erneut aus und setzt auf Entwurf zurück.
7. Gleiche Eingabe und gleiche Prompt-Version: **kein** KI-Aufruf.
8. Runden: höchstens drei, die letzte lesbare Fassung zählt, Fehler nur für das betroffene Ziel.
9. Antwort **in Stücken mit Zeilenumbrüchen** wird gelesen; **abgeschnittene** Antwort führt zur Bitte um kürzere Fassung.
10. Webhook antwortet `401`: Meldung, **kein** Rückfall und kein zweiter Aufruf. Webhook nicht erreichbar: **Rückfall**, nichts doppelt gespeichert.
11. Datenbank verweigert (kein Admin): deutsche Meldung, der Webhook wird nie gerufen.
12. Sammellauf: Pakete, `ausgenommen`, `verbleibend`, Zuordnung über `ref`.

**Wie die Tests laufen** (ohne echte Dienste): Postgres lokal mit pgTAP, `node --test` für die reine TypeScript-Logik und den Workflow (Code-Knoten werden mit einem nachgebauten n8n-Kontext ausgeführt), Playwright mit nachgebautem Datenbank-Dienst und nachgebautem Webhook.

---

## 16. Stand und offene Punkte

**Nicht live getestet** (in der Entwicklungsumgebung fehlten Zugang oder Schlüssel):
- der **echte Lauf** durch n8n mit echter Anthropic-Antwort,
- die **Anmeldeprüfung** gegen die echte Plattform,
- **CORS** in der echten n8n-Instanz (der Rückfall deckt den Fehlerfall ab).

Vor dem ersten Einsatz diese drei Punkte einmal bewusst durchspielen (Abnahme in 14.2, Phase 7).

**Bekannte Grenzen**
- Der Admin sieht den **ersten** Mandanten. Eine Auswertung über mehrere Mandanten gibt es nicht.
- Der Faktencheck prüft Zahlen, nicht Bedeutung (Kapitel 7).
- KI-Funktionen sind bewusst nur für den Admin offen. Verantwortliche folgen über den Schalter.

**Bewusst nicht Teil dieses Dokuments:** Mailversand der Agenda und die Termine (kommt später).

---

# Anhänge

## Anhang A: Die Prompts im Wortlaut

Branche und Begriffe stehen im ersten Satz. Wer sie ändert, erhöht die Version (`analyse-v1`, `gesamt-v1`, `agenda-ki-v1`).

**Konstanten**

````ts
export const PROMPT_VERSION = 'analyse-v1'
export const PROMPT_VERSION_GESAMT = 'gesamt-v1'
export const PROMPT_VERSION_AGENDA = 'agenda-ki-v1'

/** Höchstens so viele KI-Aufrufe je Analyse (ein erster Versuch und bis zu zwei Wiederholungen). */
export const MAX_AUFRUFE = 3

/**
 * Wie viele Personen ein Aufruf des Sammellaufs höchstens bearbeitet (die Oberfläche ruft so lange auf, bis alle fertig sind).
 * n8n Cloud beendet Anfragen nach etwa 100 Sekunden und der Agent arbeitet die Aufträge nacheinander ab: zwei Personen passen sicher hinein.
 */
export const PAKET_GROESSE = 2

/** Gesamtzeit für eine Anfrage. Die Edge Function antwortet spätestens nach 150 Sekunden, sonst bricht Supabase ab. */
export const ZEITBUDGET_MS = 135_000
const MIN_RUNDE_MS = 20_000
const MAX_KI_ZEIT_MS = 120_000

export const AUFGABE_EINZEL = 'einzelanalyse'
export const AUFGABE_GESAMT = 'gesamtauswertung'
export const AUFGABE_AGENDA = 'agenda'
````

**A.1 Einzelanalyse** (`analyse-v1`)

````text
Du unterstützt die Leitung eines Friseursalons bei Mitarbeitergesprächen. Du bekommst die Auswertung einer Feedback-Umfrage (Selbstbild und Fremdbild, Noten von 1 bis 5) für eine Person. Alle Namen sind entfernt: Die bewertete Person heißt „die bewertete Person“, andere heißen „Kollege A“, „Kollege B“ und so weiter.

Formuliere daraus eine sachliche, wertschätzende Gesprächsgrundlage auf Deutsch.

Regeln:
- Verwende ausschließlich Zahlen, die in den Daten stehen (Noten, Differenzen, Veränderungen, Anzahlen, Monat und Jahr). Rechne nichts selbst nach, runde nicht anders und erfinde keine Prozentwerte. Schreibe Zahlen im deutschen Format mit Komma, so wie in den Daten.
- Nenne keine Namen und keine Buchstaben-Bezeichnungen wie „Kollege A“. Schreibe stattdessen „die Person“ oder „ein Kollege“. Verwende keine Pronomen wie „sie“ oder „er“ für die Person.
- Gib Kommentare nur sinngemäß wieder und erfinde keine. Zitiere keine Kommentare wörtlich, wenn sie Namen oder Details verraten könnten, wer sie geschrieben hat.
- Fehlen Daten (zum Beispiel kein Fremdbild oder kein Vormonat), sage das offen.
- Keine Aussagen zu Gehalt, Kündigung, Gesundheit oder Recht. Keine Bewertung der Person als Mensch, nur des beobachteten Verhaltens.
- Schreibe kurz und konkret. Die Leitung liest den Entwurf, bearbeitet ihn und gibt ihn frei.

Antworte ausschließlich mit einem JSON-Objekt, ohne weiteren Text und ohne Code-Block, mit genau diesen Schlüsseln:
{
  "zusammenfassung": "2 bis 4 Sätze",
  "staerken": ["2 bis 4 Punkte"],
  "entwicklungsfelder": ["2 bis 4 Punkte"],
  "gespraechsfragen": ["3 bis 4 offene Fragen für das Gespräch"],
  "vereinbarungen_vorschlaege": ["2 bis 3 konkrete Vorschläge"],
  "kommentar_qualitaet_hinweis": "ein Satz, falls Kommentare auffallend kurz oder unspezifisch sind, sonst null"
}
````

**A.2 Gesamtauswertung** (`gesamt-v1`)

````text
Du unterstützt die Leitung eines Friseursalons bei der Vorbereitung eines Teamgesprächs. Du bekommst die Auswertung einer Feedback-Umfrage (Selbstbild und Fremdbild, Noten von 1 bis 5) für das gesamte Team in einem Monat. Es gibt nur Teamwerte: keine Namen, keine Einzelpersonen und keine Kommentartexte.

Formuliere daraus eine sachliche, wertschätzende Auswertung für die Leitung auf Deutsch.

Regeln:
- Verwende ausschließlich Zahlen, die in den Daten stehen (Noten, Differenzen, Veränderungen, Anzahlen, Monat und Jahr). Rechne nichts selbst nach, runde nicht anders und erfinde keine Prozentwerte. Schreibe Zahlen im deutschen Format mit Komma, so wie in den Daten.
- Sprich vom „Team“. Leite nichts über einzelne Personen ab, auch nicht aus der Beteiligung oder aus der Zahl der Kommentare.
- Beschreibe Verhalten mit der Nummer und dem Titel aus den Daten.
- Fehlen Daten (zum Beispiel kein Vormonat oder eine geringe Beteiligung), sage das offen.
- Keine Aussagen zu Gehalt, Kündigung, Gesundheit oder Recht.
- Schreibe kurz und konkret. Die Leitung liest den Entwurf, bearbeitet ihn und gibt ihn frei.

Antworte ausschließlich mit einem JSON-Objekt, ohne weiteren Text und ohne Code-Block, mit genau diesen Schlüsseln:
{
  "zusammenfassung": "2 bis 4 Sätze",
  "staerken": ["2 bis 4 Punkte"],
  "entwicklungsfelder": ["2 bis 4 Punkte"],
  "gespraechsfragen": ["3 bis 4 offene Fragen für das Teamgespräch"],
  "vereinbarungen_vorschlaege": ["2 bis 3 konkrete Vorschläge"],
  "datenlage_hinweis": "ein Satz, falls die Datenlage dünn ist (geringe Beteiligung, kein Vormonat, kaum Kommentare), sonst null"
}
````

**A.3 Agenda** (`agenda-ki-v1`)

````text
Du unterstützt die Leitung eines Friseursalons bei der Vorbereitung des nächsten Teammeetings (15 bis 20 Minuten). Du bekommst die Auswertung der Feedback-Umfrage des Monats für das gesamte Team (Selbstbild und Fremdbild, Noten von 1 bis 5), die aktuellen Fokus-Verhalten und das Zeitbudget je Block. Es gibt nur Teamwerte: keine Namen, keine Einzelpersonen und keine Kommentartexte.

Erstelle daraus die Agenda für das Meeting auf Deutsch mit genau fünf Blöcken in dieser Reihenfolge: einstieg, kennzahlen, fokus, entwicklung, vereinbarungen. Je Block gibst du die Minuten an (eine ganze Zahl zwischen min und max aus dem Zeitbudget) und die Gesprächspunkte.

Regeln:
- Verwende ausschließlich Zahlen, die in den Daten stehen (Noten, Differenzen, Veränderungen, Anzahlen, Monat und Jahr). Rechne nichts selbst nach, runde nicht anders und erfinde keine Prozentwerte. Schreibe Zahlen im deutschen Format mit Komma, so wie in den Daten.
- einstieg: Dank an das Team und die Beteiligung (abgegeben von erwartet).
- kennzahlen: Selbstbild, Fremdbild und Differenz des Teams, die Einordnung und, wenn vorhanden, der Vergleich zum Vormonat.
- fokus: zuerst die Fokus-Verhalten (fokus_aktuell), danach die größten Differenzen und Veränderungen. Höchstens drei Verhalten insgesamt. Nenne die Nummer und den Titel. Gibt es kein Fokus-Verhalten und keine Auffälligkeiten, sage das und schlage vor, gemeinsam eines festzulegen.
- entwicklung: die Entwicklungsfelder (niedrigste Fremdbilder), ohne Wiederholung aus dem Fokus-Block.
- vereinbarungen: offene Leitfragen: Was nehmen wir uns vor? Wer übernimmt welchen Schritt? Woran merken wir, dass es besser wird?
- Jeder Punkt ist ein kurzer, in sich verständlicher Satz (höchstens 300 Zeichen), je Block zwei bis vier Punkte. Keine Nummerierung.
- Sprich vom „Team“. Leite nichts über einzelne Personen ab, auch nicht aus der Beteiligung. Keine Namen, keine Aussagen zu Gehalt, Kündigung, Gesundheit oder Recht.
- Fehlen Daten (zum Beispiel kein Vormonat oder eine geringe Beteiligung), sage das offen.

Antworte ausschließlich mit einem JSON-Objekt, ohne weiteren Text und ohne Code-Block, in genau dieser Form (die Minuten sind Beispiele):
{
  "bloecke": [
    { "id": "einstieg", "minuten": 2, "punkte": ["…"] },
    { "id": "kennzahlen", "minuten": 3, "punkte": ["…"] },
    { "id": "fokus", "minuten": 7, "punkte": ["…"] },
    { "id": "entwicklung", "minuten": 4, "punkte": ["…"] },
    { "id": "vereinbarungen", "minuten": 2, "punkte": ["…"] }
  ]
}
````

## Anhang B: Antwort der KI lesen (Parser)

Der Parser entfernt Code-Zäune, entfernt Zeilenumbrüche mitten in Texten, Wörtern und Zahlen und sucht das erste vollständige JSON-Objekt. Bricht die Antwort ab, wirft er genau `JSON unvollständig`, daran erkennt der Ablauf die Bitte um eine kürzere Fassung.

````ts
/**
 * Entfernt Zeilenumbrüche, die mitten in einem Wort, einer Zahl oder einem Text stehen, und Tabs in Texten. Sie machen JSON ungültig.
 * Manche Wege (Streaming in n8n) liefern Text in Stücken mit einem Umbruch dazwischen („Fe↵edback“, „nul↵l“); ohne die Umbrüche stimmt
 * der Text wieder. Zwischen zwei JSON-Teilen ist ein Umbruch nie nötig, ihn zu entfernen kostet nichts.
 */
export function repariereJson(text: string): string {
  let aus = ''
  let inText = false
  let escape = false
  for (const c of text) {
    if (c === '\n' || c === '\r') continue
    if (!inText) {
      if (c === '"') inText = true
      aus += c
    } else if (escape) {
      escape = false
      aus += c
    } else if (c === '\\') {
      escape = true
      aus += c
    } else if (c === '"') {
      inText = false
      aus += c
    } else {
      aus += c === '\t' ? ' ' : c
    }
  }
  return aus
}

export const JSON_UNVOLLSTAENDIG = 'JSON unvollständig'

function ersteJsonStelle(text: string): unknown {
  const ohneZaun = text.replace(/```(?:json)?/gi, '')
  try {
    return JSON.parse(ohneZaun.trim())
  } catch {
    // weiter: Umbrüche in Texten entfernen, dann das erste vollständige {...} suchen
  }
  const von = ohneZaun.indexOf('{')
  if (von < 0) throw new Error('kein JSON')
  const t = repariereJson(ohneZaun.slice(von))
  let tiefe = 0
  let inText = false
  let escape = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inText) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inText = false
    } else if (c === '"') inText = true
    else if (c === '{') tiefe++
    else if (c === '}' && --tiefe === 0) return JSON.parse(t.slice(0, i + 1))
  }
  throw new Error(JSON_UNVOLLSTAENDIG)
}
````

Dasselbe steht im n8n-Knoten **Antwort lesen** (Anhang F), damit schon der Workflow sauber liest.

## Anhang C: SQL-Bausteine

Diese Auszüge stammen aus den Migrationen der Plattform. Vollständig sind sie in Anhang G aufgeführt.

**C.1 Tabelle `analysen`:** siehe Kapitel 4.1.

**C.2 Schalter und Zugriffsfunktion:** siehe Kapitel 4.2.

Beim Nachrüsten eines Typs (hier `team_gesamt`) die Check-Bedingung tauschen:

````sql
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.analysen'::regclass and conname = 'analysen_typ_check'
      and pg_get_constraintdef(oid) like '%team_gesamt%'
  ) then
    alter table public.analysen drop constraint if exists analysen_typ_check;
    alter table public.analysen
      add constraint analysen_typ_check check (typ in ('person', 'team_agenda', 'team_gesamt'));
  end if;
end
$$;
````

**C.3 Faktencheck**

````sql
-- Zahlen aus einem Text: „3,5“ = „3.5“ = „3,50“, das Vorzeichen zählt nicht, Listennummern am Zeilenanfang zählen nicht
create or replace function private.analyse_zahlen(p_text text, p_liste_ignorieren boolean default false)
returns numeric[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct abs(replace(m[1], ',', '.')::numeric)), '{}'::numeric[])
  from regexp_matches(
    case when p_liste_ignorieren
         then regexp_replace(coalesce(p_text, ''), '(^|\n)[ \t]*(?:[-*][ \t]+)?\d+[.)][ \t]+', '\1', 'g')
         else coalesce(p_text, '') end,
    '(\d+(?:[.,]\d+)?)', 'g') as m
$$;

-- Zahlen aus allen Zahlen und Texten eines JSON-Dokuments
create or replace function private.analyse_json_zahlen(p_json jsonb, p_liste_ignorieren boolean default false)
returns numeric[]
language sql stable set search_path = ''
as $$
  select coalesce(array_agg(distinct s.z), '{}'::numeric[])
  from (
    select unnest(
             case jsonb_typeof(w)
               when 'number' then array[abs((w #>> '{}')::numeric)]
               when 'string' then private.analyse_zahlen(w #>> '{}', p_liste_ignorieren)
               else '{}'::numeric[]
             end) as z
    from jsonb_path_query(coalesce(p_json, 'null'::jsonb), 'strict $.**') as w
  ) s
$$;

-- Faktencheck: jede Zahl im Text und in der strukturierten Ausgabe muss in der Eingabe vorkommen.
-- 1 bis 5 sind immer erlaubt (Notenskala). Ergebnis: { geprueft, abweichungen[], hinweis }
create or replace function private.analyse_faktencheck(p_eingabe jsonb, p_text text, p_ausgabe jsonb default null)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_erlaubt  numeric[] := array[1, 2, 3, 4, 5]::numeric[] || private.analyse_json_zahlen(p_eingabe, false);
  v_gefunden numeric[] := private.analyse_zahlen(p_text, true) || private.analyse_json_zahlen(p_ausgabe, true);
  v_fehlt    text[];
  v_n        integer;
  v_hinweis  text;
begin
  select coalesce(array_agg(replace(trim_scale(s.z)::text, '.', ',') order by s.z), '{}'::text[])
    into v_fehlt
  from (select distinct u.z from unnest(v_gefunden) as u(z) where u.z <> all (v_erlaubt)) s;

  v_n := coalesce(array_length(v_fehlt, 1), 0);
  if v_n = 1 then
    v_hinweis := 'Faktencheck nicht bestanden: ' || v_fehlt[1] || ' steht nicht in den Daten';
  elsif v_n > 1 then
    v_hinweis := 'Faktencheck nicht bestanden: ' || array_to_string(v_fehlt[1:v_n - 1], ', ')
                 || ' und ' || v_fehlt[v_n] || ' stehen nicht in den Daten';
  end if;

  return jsonb_build_object('geprueft', v_n = 0, 'abweichungen', to_jsonb(v_fehlt), 'hinweis', v_hinweis);
end
$$;
````

**C.4 Aufbau und Zeitbudget der Agenda prüfen**

Die Reihenfolge, die Minuten je Block und die Summe stehen in drei Arrays. Wer andere Blöcke oder Zeiten will, ändert sie hier **und** im Zeitbudget der Eingabe (C.5) **und** im Prompt.

````sql
create or replace function private.agenda_validieren(p_agenda jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_ids   text[] := array['einstieg', 'kennzahlen', 'fokus', 'entwicklung', 'vereinbarungen'];
  v_namen text[] := array['Einstieg und Beteiligung', 'Team-Kennzahlen des Monats', 'Fokus-Verhalten', 'Entwicklungsfelder und Differenzen', 'Vereinbarungen'];
  v_min   integer[] := array[2, 3, 6, 3, 2];
  v_max   integer[] := array[2, 3, 8, 4, 3];
  b       jsonb;
  p       jsonb;
  m       numeric;
  v_summe numeric := 0;
  i       integer;
begin
  if p_agenda is null or jsonb_typeof(p_agenda->'bloecke') is distinct from 'array' or jsonb_array_length(p_agenda->'bloecke') <> 5 then
    raise exception 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.' using errcode = '22023';
  end if;
  for i in 1..5 loop
    b := p_agenda->'bloecke'->(i - 1);
    if b->>'id' is distinct from v_ids[i] then
      raise exception 'Die Agenda braucht fünf Blöcke in fester Reihenfolge.' using errcode = '22023';
    end if;
    if jsonb_typeof(b->'minuten') is distinct from 'number' or (b->>'minuten')::numeric <> trunc((b->>'minuten')::numeric) then
      raise exception 'Die Minuten von „%“ müssen eine ganze Zahl sein.', v_namen[i] using errcode = '22023';
    end if;
    m := (b->>'minuten')::numeric;
    if m < v_min[i] or m > v_max[i] then
      if v_min[i] = v_max[i] then
        raise exception 'Der Block „%“ dauert genau % Minuten.', v_namen[i], v_min[i] using errcode = '22023';
      end if;
      raise exception 'Der Block „%“ darf % bis % Minuten dauern.', v_namen[i], v_min[i], v_max[i] using errcode = '22023';
    end if;
    if jsonb_typeof(b->'punkte') is distinct from 'array' then
      raise exception 'Der Block „%“ braucht eine Liste von Punkten.', v_namen[i] using errcode = '22023';
    end if;
    for p in select x from jsonb_array_elements(b->'punkte') x loop
      if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'text') is distinct from 'string'
         or btrim(p->>'text') = '' or char_length(p->>'text') > 600 then
        raise exception 'Jeder Punkt braucht einen Text (höchstens 600 Zeichen).' using errcode = '22023';
      end if;
    end loop;
    v_summe := v_summe + m;
  end loop;
  if v_summe < 15 or v_summe > 20 then
    raise exception 'Die Agenda soll 15 bis 20 Minuten dauern (jetzt % Minuten).', v_summe using errcode = '22023';
  end if;
end
$$;
````

**C.5 Eingabe der Agenda (Fokus und Zeitbudget)**

`private.gesamt_eingabe_bauen` liefert die Team-Eingabe aus Kapitel 5; sie ist plattformspezifisch und wird neu geschrieben.

````sql
create or replace function private.agenda_ki_eingabe_bauen(p_salon uuid, p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fokus jsonb;
begin
  -- die Fokus-Verhalten von heute (nur Nummer und Titel; die Begründung der Leitung geht nicht an die KI)
  select coalesce(jsonb_agg(jsonb_build_object('nr', t.nr, 'titel', t.titel) order by t.nr), '[]'::jsonb)
    into v_fokus
  from (select distinct v.nr, v.titel
        from public.fokus_verhalten f join public.verhalten v on v.id = f.verhalten_id
        where f.salon_id = p_salon and f.gueltig_ab <= private.heute() and (f.gueltig_bis is null or f.gueltig_bis >= private.heute())) t;

  return jsonb_build_object(
    'aufgabe', 'Agenda für das nächste Teammeeting',
    'monat', to_char(p_monat, 'YYYY-MM'),
    'team', private.gesamt_eingabe_bauen(p_salon, p_monat),
    'fokus_aktuell', v_fokus,
    'zeitbudget', jsonb_build_object(
      'gesamt_min', 15, 'gesamt_max', 20,
      'bloecke', jsonb_build_array(
        jsonb_build_object('id', 'einstieg',       'titel', 'Einstieg und Beteiligung',          'min', 2, 'max', 2, 'vorschlag', 2),
        jsonb_build_object('id', 'kennzahlen',     'titel', 'Team-Kennzahlen des Monats',        'min', 3, 'max', 3, 'vorschlag', 3),
        jsonb_build_object('id', 'fokus',          'titel', 'Fokus-Verhalten',                   'min', 6, 'max', 8, 'vorschlag', 7),
        jsonb_build_object('id', 'entwicklung',    'titel', 'Entwicklungsfelder und Differenzen', 'min', 3, 'max', 4, 'vorschlag', 4),
        jsonb_build_object('id', 'vereinbarungen', 'titel', 'Vereinbarungen',                    'min', 2, 'max', 3, 'vorschlag', 2)))
  );
end
$$;
````

**C.6 Die öffentlichen Funktionen der KI-Agenda**

Drei Funktionen, jeweils nur für Angemeldete mit Recht: Eingabe holen, prüfen, speichern. Die Prüfung gibt `struktur_fehler` als Text zurück, damit die KI den Fehler korrigieren kann.

````sql
create or replace function public.agenda_ki_eingabe(p_monat date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon uuid := private.gesamt_zugriff(p_monat, false);
  v_e     jsonb;
begin
  v_e := private.agenda_ki_eingabe_bauen(v_salon, private.monatsanfang(p_monat));
  return jsonb_build_object('eingabe', v_e, 'hash', md5(v_e::text));
end
$$;

-- Ergebnis: { geprueft, abweichungen[], hinweis, struktur_fehler }. Stimmt der Aufbau nicht, ist struktur_fehler der Grund.
create or replace function public.agenda_ki_pruefen(p_monat date, p_bloecke jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon  uuid := private.gesamt_zugriff(p_monat, false);
  v_monat  date := private.monatsanfang(p_monat);
  v_agenda jsonb;
  v_check  jsonb;
begin
  begin
    v_agenda := private.agenda_ki_bauen(v_salon, v_monat, p_bloecke);
    perform private.agenda_validieren(v_agenda);
  exception when others then
    return jsonb_build_object(
      'geprueft', false, 'abweichungen', '[]'::jsonb, 'struktur_fehler',
      case when sqlstate = '22023' then sqlerrm else 'Die Agenda hat nicht das vorgegebene Format.' end,
      'hinweis', null);
  end;
  v_check := private.analyse_faktencheck(private.agenda_ki_eingabe_bauen(v_salon, v_monat), private.agenda_punkte_text(v_agenda), null);
  return v_check || jsonb_build_object('struktur_fehler', null);
end
$$;

create or replace function public.agenda_ki_speichern(
  p_monat date, p_bloecke jsonb, p_prompt_version text,
  p_anbieter text default null, p_modell text default null, p_versuche integer default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salon   uuid := private.gesamt_zugriff(p_monat, false);
  v_monat   date := private.monatsanfang(p_monat);
  v_agenda  jsonb;
  v_eingabe jsonb;
  v_check   jsonb;
  v_zeile   public.analysen;
begin
  if p_prompt_version is null or btrim(p_prompt_version) = '' then
    raise exception 'Die Prompt-Version fehlt.' using errcode = '22023';
  end if;

  -- Aufbau und Zeitbudget prüft die Datenbank (22023), „geprueft“ rechnet sie selbst
  v_agenda := private.agenda_ki_bauen(v_salon, v_monat, p_bloecke);
  perform private.agenda_validieren(v_agenda);
  v_eingabe := private.agenda_ki_eingabe_bauen(v_salon, v_monat);
  v_check := private.analyse_faktencheck(v_eingabe, private.agenda_punkte_text(v_agenda), null);

  insert into public.analysen
    (salon_id, monat, typ, person_id, status, text, ausgabe, eingabe_hash, prompt_version, anbieter, modell, versuche,
     geprueft, pruef_hinweis)
  values
    (v_salon, v_monat, 'team_agenda', null, 'entwurf', private.agenda_text(v_agenda), v_agenda, md5(v_eingabe::text),
     p_prompt_version, p_anbieter, p_modell, p_versuche, (v_check->>'geprueft')::boolean, v_check->>'hinweis')
  on conflict (salon_id, monat, typ, (coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid))) do update
    set status = 'entwurf', text = excluded.text, ausgabe = excluded.ausgabe, eingabe_hash = excluded.eingabe_hash,
        prompt_version = excluded.prompt_version, anbieter = excluded.anbieter, modell = excluded.modell,
        versuche = excluded.versuche, geprueft = excluded.geprueft, pruef_hinweis = excluded.pruef_hinweis,
        bearbeitet = false, bearbeitet_am = null, bearbeitet_von = null,
        freigegeben_am = null, freigegeben_von = null, aktualisiert_am = now()
  returning * into v_zeile;

  return private.agenda_zeile(v_zeile);
end
$$;
````

## Anhang D: Orchestrierung

**D.1 Rundenlogik (`arbeiteZiele`)**

````ts
const KEIN_JSON = 'Deine letzte Antwort war kein gültiges JSON im vorgegebenen Format. Antworte nur mit dem JSON-Objekt und allen Schlüsseln.'
const KEIN_JSON_ABGESCHNITTEN = 'Deine letzte Antwort war abgeschnitten (das JSON war nicht zu Ende). Fasse dich kürzer: je Punkt ein kurzer Satz, höchstens drei Punkte je Block. Antworte nur mit dem vollständigen JSON-Objekt.'

/**
 * Alle Ziele einer Aufgabe in Runden: Jede Runde schickt die noch offenen Ziele gemeinsam an die KI (bei einem Webhook in
 * einem Aufruf). Stimmt die Form nicht oder der Faktencheck nicht, kommt das Ziel in die nächste Runde, mit Hinweis.
 * Höchstens MAX_AUFRUFE Runden und höchstens ZEITBUDGET_MS. Die letzte lesbare Fassung zählt auch ohne bestandenen Faktencheck.
 * Scheitern in einer Runde alle Aufträge am Anbieter, wird dessen Fehler geworfen.
 */
export async function arbeiteZiele(
  d: Abhaengigkeiten, config: AnbieterConfig, aufgabe: string, promptVersion: string, ziele: Ziel[],
): Promise<Map<string, ZielErgebnis>> {
  const jetzt = d.jetzt ?? Date.now
  const start = jetzt()
  const kiBatch: NonNullable<Abhaengigkeiten['kiBatch']> =
    d.kiBatch ??
    (async (c, a, v, auftraege, o) => {
      const r: Record<string, KiAntwort> = {}
      await Promise.all(auftraege.map(async (x) => {
        try {
          r[x.ref] = { roh: await d.ki(c, x.nachricht, x.eingabe, { system: x.system, promptVersion: v, aufgabe: a, timeoutMs: o.timeoutMs }) }
        } catch (e) {
          r[x.ref] = { fehler: e instanceof AnalyseFehler ? e : new AnalyseFehler(KEINE_ANTWORT, 502) }
        }
      }))
      return r
    })

  interface Stand {
    ziel: Ziel
    ref: string
    korrektur?: string
    letzte: { ausgabe: unknown; text: string } | null
    aufrufe: number
    fehler: AnalyseFehler | null
    fertig: boolean
  }
  const staende: Stand[] = ziele.map((ziel, i) => ({ ziel, ref: String(i + 1), letzte: null, aufrufe: 0, fehler: null, fertig: false }))
  let offen = staende.filter((s) => !s.fertig)

  for (let runde = 0; offen.length > 0 && runde < MAX_AUFRUFE; runde++) {
    const uebrig = ZEITBUDGET_MS - (jetzt() - start)
    if (runde > 0 && uebrig < MIN_RUNDE_MS) break
    const timeoutMs = Math.max(10_000, Math.min(MAX_KI_ZEIT_MS, uebrig - 5_000))

    const auftraege: Auftrag[] = offen.map((s) => ({
      ref: s.ref, system: s.ziel.system, nachricht: baueNachricht(s.ziel.eingabe, s.korrektur), eingabe: s.ziel.eingabe,
    }))
    const antworten = await kiBatch(config, aufgabe, promptVersion, auftraege, { timeoutMs })

    const fehlgeschlagen = offen.map((s) => antworten[s.ref]).filter((a): a is { fehler: AnalyseFehler } => !a || 'fehler' in a)
    if (fehlgeschlagen.length === offen.length) {
      // Der Anbieter hat in dieser Runde für niemanden geliefert. Gibt es überall schon eine lesbare Fassung, zählt sie.
      if (offen.every((s) => s.letzte)) break
      throw fehlgeschlagen[0]?.fehler ?? new AnalyseFehler(KEINE_ANTWORT, 502)
    }

    const weiter: Stand[] = []
    for (const s of offen) {
      s.aufrufe++
      const a = antworten[s.ref]
      if (!a || 'fehler' in a) {
        s.fehler = a?.fehler ?? new AnalyseFehler(KEINE_ANTWORT, 502)
        weiter.push(s)
        continue
      }
      let gelesen: { ausgabe: unknown; text: string }
      try {
        gelesen = s.ziel.parse(a.roh)
      } catch (e) {
        s.korrektur = e instanceof Error && e.message === JSON_UNVOLLSTAENDIG ? KEIN_JSON_ABGESCHNITTEN : KEIN_JSON
        weiter.push(s)
        continue
      }
      s.letzte = gelesen
      s.fehler = null
      let pruefung: { geprueft: boolean; abweichungen?: string[]; korrektur?: string }
      try {
        pruefung = await s.ziel.pruefen(gelesen.text, gelesen.ausgabe)
      } catch (e) {
        s.fehler = e instanceof AnalyseFehler ? e : new AnalyseFehler('Die Analyse konnte nicht erstellt werden.', 500)
        s.fertig = true
        s.letzte = null
        continue
      }
      if (pruefung.geprueft) {
        s.fertig = true
        continue
      }
      s.korrektur =
        pruefung.korrektur ??
        `Deine letzte Antwort enthielt Zahlen, die nicht in den Daten stehen: ${(pruefung.abweichungen ?? []).join(', ')}. Formuliere neu und verwende nur Zahlen aus den Daten.`
      weiter.push(s)
    }
    offen = weiter
  }

  const ergebnis = new Map<string, ZielErgebnis>()
  for (const s of staende) {
    if (s.letzte) ergebnis.set(s.ziel.schluessel, { ok: true, text: s.letzte.text, ausgabe: s.letzte.ausgabe, versuche: s.aufrufe })
    else {
      ergebnis.set(s.ziel.schluessel, {
        ok: false,
        fehler: s.fehler ?? new AnalyseFehler('Die KI hat keine verwertbare Antwort geliefert. Bitte später erneut versuchen.', 502),
      })
    }
  }
  return ergebnis
}
````

**D.2 Agenda-Aufgabe (`erstelleAgenda`)**

Einzelanalyse, Sammellauf und Gesamtauswertung folgen demselben Muster mit anderen Funktionsnamen.

````ts
/**
 * Wie erstelleGesamt, für die Agenda. Die Datenbank setzt Überschriften und Hinweise „Stand unvollständig“, prüft Aufbau,
 * Zeitbudget (15 bis 20 Minuten) und jede Zahl; ein Fehler im Aufbau geht als Hinweis zurück an die KI.
 * Die Agenda aus der Vorlage (ohne KI) bleibt unberührt, bis dieser Aufruf erfolgreich speichert.
 */
export async function erstelleAgenda(
  d: Abhaengigkeiten,
  p: { monat: string; neu: boolean },
): Promise<Ergebnis> {
  const basis = { p_monat: `${p.monat}-01` }

  const eingabeAntwort = (await rpcOderFehler(d, 'agenda_ki_eingabe', basis)) as { eingabe: unknown; hash: string }
  const vorhanden = (await rpcOderFehler(d, 'agenda_lesen', basis)) as { eingabe_hash?: string; prompt_version?: string; anbieter?: string } | null

  if (
    vorhanden && !p.neu && vorhanden.anbieter !== 'vorlage' &&
    vorhanden.eingabe_hash === eingabeAntwort.hash && vorhanden.prompt_version === PROMPT_VERSION_AGENDA
  ) {
    return { uebersprungen: true, versuche: 0, analyse: vorhanden }
  }

  const config = d.anbieter()
  const ziel: Ziel = {
    schluessel: 'agenda',
    system: SYSTEM_PROMPT_AGENDA,
    eingabe: eingabeAntwort.eingabe,
    parse: (roh) => {
      const a = parseAgendaAusgabe(roh)
      return { ausgabe: a, text: textAusAgenda(a) }
    },
    pruefen: async (_text, ausgabe) => {
      const r = (await rpcOderFehler(d, 'agenda_ki_pruefen', { ...basis, p_bloecke: (ausgabe as AgendaAusgabe).bloecke })) as {
        geprueft: boolean
        abweichungen?: string[]
        struktur_fehler?: string | null
      }
      if (r.struktur_fehler) {
        return {
          geprueft: false,
          korrektur: `Deine letzte Antwort passt nicht zur Vorgabe: ${r.struktur_fehler} Halte dich genau an die fünf Blöcke, ihre Reihenfolge und die Minuten aus dem Zeitbudget.`,
        }
      }
      return { geprueft: r.geprueft, abweichungen: r.abweichungen }
    },
  }
  const r = (await arbeiteZiele(d, config, AUFGABE_AGENDA, PROMPT_VERSION_AGENDA, [ziel])).get('agenda')!
  if (!r.ok) throw r.fehler

  // Passt der Aufbau auch nach der letzten Runde nicht, lehnt die Datenbank beim Speichern mit einer deutschen Meldung ab (422)
  const analyse = await rpcOderFehler(d, 'agenda_ki_speichern', {
    ...basis,
    p_bloecke: (r.ausgabe as AgendaAusgabe).bloecke,
    p_prompt_version: PROMPT_VERSION_AGENDA,
    p_anbieter: config.name,
    p_modell: config.modell,
    p_versuche: r.versuche,
  })
  return { uebersprungen: false, versuche: r.versuche, analyse }
}
````

**D.3 Webhook-Aufruf (`rufeAnbieterBatch`)**

Ein Aufruf mit allen Aufträgen. Fehler für die ganze Anfrage (Zugang, Auslastung, Zeit) werden geworfen, Fehler einzelner Aufträge kommen als `{ fehler }` zurück. Die Anmeldung der Person geht als `Bearer` mit.

````ts
/**
 * Mehrere Aufträge einer Aufgabe. Claude direkt: ein Aufruf je Auftrag, gleichzeitig. Webhook: EIN Aufruf mit allen Aufträgen,
 *   Anfrage:  { aufgabe, prompt_version, auftraege: [{ ref, system, nachricht, eingabe }] }
 *   Antwort:  { ergebnisse: [{ ref, code?, ausgabe | fehler }] }
 * Fehler des Anbieters für die ganze Anfrage (Zugang, Auslastung, Zeitüberschreitung) werden geworfen, Fehler einzelner
 * Aufträge kommen als { fehler } zurück.
 */
export async function rufeAnbieterBatch(
  config: AnbieterConfig, aufgabe: string, promptVersion: string, auftraege: Auftrag[], fetchFn: FetchFn, optionen: { timeoutMs?: number } = {},
): Promise<Record<string, KiAntwort>> {
  const timeoutMs = optionen.timeoutMs ?? 90_000
  const ergebnis: Record<string, KiAntwort> = {}

  if (config.name === 'claude') {
    await Promise.all(auftraege.map(async (a) => {
      try {
        ergebnis[a.ref] = { roh: await rufeClaude(config, a, fetchFn, timeoutMs) }
      } catch (e) {
        ergebnis[a.ref] = { fehler: e instanceof AnalyseFehler ? e : new AnalyseFehler(KEINE_ANTWORT, 502) }
      }
    }))
    return ergebnis
  }

  const antwort = await anfrage(fetchFn, config.url ?? '', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Die Anmeldung der Person hat Vorrang: Der Webhook prüft sie bei Supabase. Ein Geheimnis ist nur noch ein Zusatz.
      ...(config.token ? { authorization: `Bearer ${config.token}` } : config.geheimnis ? { authorization: `Bearer ${config.geheimnis}` } : {}),
      ...(config.geheimnis ? { 'x-webhook-secret': config.geheimnis } : {}),
    },
    body: JSON.stringify({
      aufgabe,
      prompt_version: promptVersion,
      auftraege: auftraege.map(({ ref, system, nachricht, eingabe }) => ({ ref, system, nachricht, eingabe })),
    }),
  }, timeoutMs)
  const daten = (await antwort.json().catch(() => null)) as Record<string, unknown> | null
  if (!daten || typeof daten !== 'object') throw new AnalyseFehler(KEINE_ANTWORT, 502)

  if (Array.isArray(daten.ergebnisse)) {
    for (const e of daten.ergebnisse as Record<string, unknown>[]) {
      if (!e || typeof e !== 'object' || typeof e.ref !== 'string') continue
      const code = typeof e.code === 'number' ? e.code : 200
      const roh = ausgabeAusFeldern(e)
      ergebnis[e.ref] = code >= 400 || e.fehler || roh === undefined
        ? { fehler: new AnalyseFehler(KEINE_ANTWORT, code === 429 ? 503 : 502) }
        : { roh }
    }
  } else if (auftraege.length === 1) {
    // ältere Webhooks antworten direkt oder verpackt
    ergebnis[auftraege[0].ref] = { roh: ausgabeAusFeldern(daten) ?? daten }
  }
  for (const a of auftraege) {
    ergebnis[a.ref] ??= { fehler: new AnalyseFehler(KEINE_ANTWORT, 502) }
  }
  return ergebnis
}
````

## Anhang E: Browser-Ablauf (`ki.ts`)

Dieselbe Logik wie in der Server-Funktion, nur im Browser des Admins. Er benutzt `analyse.ts` aus Anhang D.

````ts
// KI direkt aus der Oberfläche: Der Browser holt die Eingabe von der Datenbank (nur Admin), schickt sie mit der Anmeldung
// des Admins an den n8n-Webhook und lässt die Antwort von der Datenbank prüfen und speichern. Es ist dieselbe Logik wie in
// der Edge Function `analyse-erstellen` (supabase/functions/analyse-erstellen/analyse.ts), nur ohne den Umweg über Supabase.
//
// Was dabei nicht aus der Hand gegeben wird: Wer die Eingabe bekommt, wer speichert und ob jede Zahl stimmt, entscheiden weiter
// die Datenbankfunktionen (agenda_ki_eingabe, agenda_ki_pruefen, …) mit der Anmeldung des Admins. Der Webhook bekommt nur die
// Eingabe ohne Namen und ohne Kommentartexte. Ein Geheimnis steckt nicht in der Oberfläche; der Webhook lässt die Anmeldung
// bei Supabase prüfen.
import { supabase } from './supabase'
import {
  AnalyseFehler, STANDARD_WEBHOOK_URL, erstelleAgenda, erstelleAlle, erstelleAnalyse, erstelleGesamt, rufeAnbieter, rufeAnbieterBatch,
  type Abhaengigkeiten,
} from '../../supabase/functions/analyse-erstellen/analyse'

/** Die Adresse des n8n-Webhooks: dieselbe wie in der Edge Function (eine Quelle). */
export const KI_WEBHOOK_URL = STANDARD_WEBHOOK_URL

const fetchFn = (url: string, init?: RequestInit) => fetch(url, init)

/** Schalter für die Fehlersuche: `localStorage.setItem('dawiid-ki-weg', 'edge')` nimmt immer die Edge Function (zurück: removeItem). */
export const KI_WEG_SCHLUESSEL = 'dawiid-ki-weg'
function nurEdgeFunction(): boolean {
  try {
    return localStorage.getItem(KI_WEG_SCHLUESSEL) === 'edge'
  } catch {
    return false
  }
}

/**
 * Führt eine KI-Aufgabe im Browser aus. Das Ergebnis hat dieselbe Form wie die Antwort der Edge Function (`{ ok: true, … }`).
 * `null`: Der Webhook war vom Browser aus nicht erreichbar (kein Netz, CORS) und hat nichts erhalten; der Aufrufer nimmt dann die
 * Edge Function. Alle anderen Fehler kommen als Error mit deutscher Meldung.
 */
export async function kiDirekt(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (nurEdgeFunction()) return null
  const aufgabe = body.aufgabe ?? 'person'
  const monat = typeof body.monat === 'string' ? body.monat : ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) throw new Error('Der Monat fehlt oder ist ungültig.')

  const { data: sitzung } = await supabase.auth.getSession()
  const token = sitzung.session?.access_token
  if (!token) throw new Error('Bitte melde dich an.')

  const d: Abhaengigkeiten = {
    rpc: async (name, args) => {
      const { data, error } = await supabase.rpc(name, args)
      return { data, error: error ? { code: error.code, message: error.message } : null }
    },
    anbieter: () => ({ name: 'webhook', modell: null, url: KI_WEBHOOK_URL, token }),
    ki: (c, n, e, o) => rufeAnbieter(c, n, e, fetchFn, o),
    kiBatch: (c, a, v, auftraege, o) => rufeAnbieterBatch(c, a, v, auftraege, fetchFn, o),
  }

  try {
    const neu = body.neu === true
    switch (aufgabe) {
      case 'alle': {
        const ausgenommen = Array.isArray(body.ausgenommen) ? (body.ausgenommen as string[]) : []
        return { ok: true, aufgabe: 'alle', ...(await erstelleAlle(d, { monat, ausgenommen })) }
      }
      case 'gesamt':
        return { ok: true, ...(await erstelleGesamt(d, { monat, neu })) }
      case 'agenda':
        return { ok: true, ...(await erstelleAgenda(d, { monat, neu })) }
      case 'person':
        if (typeof body.person_id !== 'string') throw new Error('Person oder Monat fehlt oder ist ungültig.')
        return { ok: true, ...(await erstelleAnalyse(d, { personId: body.person_id, monat, neu })) }
      default:
        throw new Error('Die Aufgabe ist unbekannt.')
    }
  } catch (e) {
    if (e instanceof AnalyseFehler && e.netzwerk) return null
    throw e instanceof Error ? new Error(e.message) : new Error('Die Analyse konnte nicht erstellt werden.')
  }
}
````

In der Datenzugriffsschicht ruft jede KI-Aufgabe zuerst `kiDirekt`; liefert es `null`, geht dieselbe Aufgabe an die Server-Funktion:

````ts
async function rufeKi(body) {
  const direkt = await kiDirekt(body)
  if (direkt) return direkt
  const { data, error } = await supabase.functions.invoke('analyse-erstellen', { body })
  if (error) throw await funktionsFehler(error)
  if (!data?.ok) throw new Error(data?.fehler ?? 'Die Analyse konnte nicht erstellt werden.')
  return data
}
````

## Anhang F: n8n-Knoten

Der vollständige Workflow ist `n8n/dawiid-ki.workflow.json` (18 Knoten, **keine Zugangsdaten** in der Datei). Hier die Parameter, auf die es ankommt.

**F.1 Webhook**

````json
{
  "httpMethod": "POST",
  "path": "dawiid-ki",
  "authentication": "none",
  "responseMode": "responseNode",
  "options": {
    "allowedOrigins": "*"
  }
}
````

**F.2 Anmeldung prüfen** (HTTP Request an die „Wer bin ich?“-Adresse der Plattform)

````json
{
  "method": "GET",
  "url": "https://<PROJEKT-REF>.supabase.co/auth/v1/user",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Authorization",
        "value": "={{ $json.headers.authorization || '' }}"
      },
      {
        "name": "apikey",
        "value": "<ANON-KEY>"
      }
    ]
  },
  "options": {
    "timeout": 10000,
    "response": {
      "response": {
        "fullResponse": true,
        "neverError": true
      }
    }
  }
}
````

**F.3 Angemeldet?** (Bedingung des IF-Knotens)

````json
{
  "id": "d4a11d00-0000-4000-8000-000000000025",
  "leftValue": "={{ $execution.mode === 'test' || $json.statusCode === 200 }}",
  "rightValue": "",
  "operator": {
    "type": "boolean",
    "operation": "true",
    "singleValue": true
  }
}
````

**F.4 Aufgabe wählen** (eine Regel des Switch-Knotens; die zwei anderen sind gleich aufgebaut mit `gesamtauswertung` und `agenda`)

````json
{
  "conditions": {
    "options": {
      "caseSensitive": true,
      "leftValue": "",
      "typeValidation": "strict",
      "version": 2
    },
    "conditions": [
      {
        "id": "d4a11d00-0000-4000-8000-000000000008",
        "leftValue": "={{ $json.aufgabe }}",
        "rightValue": "einzelanalyse",
        "operator": {
          "type": "string",
          "operation": "equals"
        }
      }
    ],
    "combinator": "and"
  },
  "renameOutput": true,
  "outputKey": "Einzelanalyse"
}
````

**F.5 Claude (HTTP Request an die Anthropic-API)**

Authentifizierung: *Predefined Credential Type → Anthropic* (oder *Generic → Header Auth* mit `x-api-key`). Modell, `max_tokens` und `temperature` stehen im Body.

````json
{
  "method": "POST",
  "url": "https://api.anthropic.com/v1/messages",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "anthropicApi",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "anthropic-version",
        "value": "2023-06-01"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 4096, temperature: 0.3, system: $json.system, messages: [{ role: 'user', content: $json.nachricht }] }) }}",
  "options": {
    "timeout": 90000,
    "batching": {
      "batch": {
        "batchSize": 10,
        "batchInterval": 0
      }
    },
    "response": {
      "response": {
        "neverError": true
      }
    }
  }
}
````

**F.6 Anfrage prüfen** (Code, einmal für alle Aufträge). Hier stehen die Einstellung je Aufgabe und der Zusatzkontext.

````js
// Einstellungen je Aufgabe (= je Strang). Eine neue Aufgabe: hier eintragen, im Knoten „Aufgabe wählen“ eine Regel
// ergänzen und einen Strang (Agent + Claude-Modell) kopieren.
const AUFGABEN = {
  einzelanalyse: {
    strang: 'Einzelanalyse',
    form: 'analyse',
    hinweisSchluessel: 'kommentar_qualitaet_hinweis',
    listen: { staerken: [2, 4], entwicklungsfelder: [2, 4], gespraechsfragen: [3, 4], vereinbarungen_vorschlaege: [2, 3] },
    // Laut Prompt nicht erlaubt: Buchstaben-Bezeichnungen wie „Kollege A“
    verbotenMuster: '\\bKollege\\s+[A-Z]\\b',
    verbotenText: 'Enthält eine Buchstaben-Bezeichnung wie „Kollege A“ (laut Prompt nicht erlaubt)',
    // Zusätzlicher Kontext für den Agenten (Salon, Begriffe). Keine Zahlen hineinschreiben: Der Faktencheck der Datenbank lehnt Zahlen ab, die nicht in den Daten stehen.
    zusatzkontext: '',
  },
  gesamtauswertung: {
    strang: 'Gesamtauswertung',
    form: 'analyse',
    hinweisSchluessel: 'datenlage_hinweis',
    listen: { staerken: [2, 4], entwicklungsfelder: [2, 4], gespraechsfragen: [3, 4], vereinbarungen_vorschlaege: [2, 3] },
    verbotenMuster: '',
    verbotenText: '',
    zusatzkontext: '',
  },
  agenda: {
    strang: 'Agenda',
    form: 'agenda',
    // Reihenfolge, Minuten (von, bis) und Gesamtdauer der Agenda; die Datenbank prüft sie verbindlich
    bloecke: [['einstieg', 2, 2], ['kennzahlen', 3, 3], ['fokus', 6, 8], ['entwicklung', 3, 4], ['vereinbarungen', 2, 3]],
    gesamt: [15, 20],
    punkteProBlock: [2, 4],
    zusatzkontext: '',
  },
};
const MAX_AUFTRAEGE = 10;

// Die Anfrage steckt im Body des Webhooks. Beim Testen im Editor darf auch der reine Inhalt einer Testanfrage
// (n8n/testanfragen/*.json) eingefügt werden: Dann steht sie direkt im Datensatz.
const eingang = $('Webhook').first().json;
const b = eingang.body ?? eingang;
const fehler = [];
const aufgabe = AUFGABEN[b.aufgabe];
if (!aufgabe) fehler.push('aufgabe ist unbekannt (erlaubt: ' + Object.keys(AUFGABEN).join(', ') + ')');
if (!Array.isArray(b.auftraege) || b.auftraege.length === 0) fehler.push('auftraege fehlt oder ist leer');
else if (b.auftraege.length > MAX_AUFTRAEGE) fehler.push('auftraege: höchstens ' + MAX_AUFTRAEGE);
else {
  const refs = new Set();
  b.auftraege.forEach((a, i) => {
    const wo = 'auftraege[' + i + ']';
    if (!a || typeof a !== 'object') return fehler.push(wo + ' ist kein Objekt');
    if (typeof a.ref !== 'string' || !a.ref) fehler.push(wo + ': ref fehlt');
    else if (refs.has(a.ref)) fehler.push(wo + ': ref ist doppelt');
    else refs.add(a.ref);
    if (typeof a.nachricht !== 'string' || !a.nachricht.trim()) fehler.push(wo + ': nachricht fehlt');
    else if (a.nachricht.length > 60000) fehler.push(wo + ': nachricht ist zu lang');
    if (typeof a.system !== 'string' || !a.system.trim()) fehler.push(wo + ': system fehlt');
    if (!a.eingabe || typeof a.eingabe !== 'object' || Array.isArray(a.eingabe)) fehler.push(wo + ': eingabe fehlt');
  });
}

if (fehler.length > 0) return [{ json: { gueltig: false, fehler } }];

return b.auftraege.map((a) => ({
  json: {
    gueltig: true,
    fehler: [],
    aufgabe: b.aufgabe,
    strang: aufgabe.strang,
    ref: a.ref,
    prompt_version: b.prompt_version ?? null,
    // Prompt aus der Plattform, danach der Kontext aus diesem Workflow
    system: aufgabe.zusatzkontext ? a.system + '\n\nZusätzlicher Kontext:\n' + aufgabe.zusatzkontext : a.system,
    nachricht: a.nachricht,
    eingabe: a.eingabe,
    form: aufgabe.form,
    hinweisSchluessel: aufgabe.hinweisSchluessel ?? null,
    listen: aufgabe.listen ?? null,
    verbotenMuster: aufgabe.verbotenMuster ?? '',
    verbotenText: aufgabe.verbotenText ?? '',
    bloecke: aufgabe.bloecke ?? null,
    gesamt: aufgabe.gesamt ?? null,
    punkteProBlock: aufgabe.punkteProBlock ?? null,
  },
}));
````

**F.7 Antwort lesen** (Code, einmal je Auftrag)

````js
// Liest die Antwort des Agenten und macht daraus das Ergebnis für diesen Auftrag.
let k;
try {
  k = $('Anfrage prüfen').item.json;
} catch (e) {
  k = $('Anfrage prüfen').all()[$itemIndex].json;
}
const r = $input.item.json;
const fertig = (code, rest) => ({ json: { ref: k.ref, aufgabe: k.aufgabe, code, ...rest } });

// Die Antwort der Anthropic-API: { content: [{ type: 'text', text }], stop_reason, usage }. Ein Fehler kommt als { error: { type, message } }
// (oder als Text bei einer Zeitüberschreitung). Auch die Form { output: '…' } wird gelesen.
const teile = Array.isArray(r.content) ? r.content.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text) : null;
const text = teile ? teile.join('') : (typeof r.output === 'string' ? r.output : undefined);
const api = teile
  ? { stop_reason: r.stop_reason ?? null, ausgabe_token: r.usage?.output_tokens ?? null }
  : {};
if (r.error || typeof text !== 'string') {
  const meldung = typeof r.error === 'string' ? r.error : ([r.error?.type, r.error?.message].filter(Boolean).join(': ') || 'Die KI hat keine Antwort geliefert.');
  if (/429|rate.?limit|overloaded/i.test(meldung)) return fertig(429, { fehler: 'Die KI ist gerade ausgelastet.', detail: meldung });
  return fertig(502, { fehler: 'Die KI ist nicht erreichbar oder hat nicht geantwortet.', detail: meldung });
}
if (!text.trim()) return fertig(502, { fehler: 'Die KI hat keinen Text geliefert.', detail: api.stop_reason ? 'stop_reason: ' + api.stop_reason : null });

// Wie die Edge Function: Code-Zaun entfernen, Umbrüche mitten in Wörtern entfernen (Streaming liefert Text in Stücken mit einem
// Umbruch dazwischen), sonst das erste vollständige {...} suchen
function reparieren(t) {
  let aus = '';
  let inText = false;
  let escape = false;
  for (const c of t) {
    if (c === '\n' || c === '\r') continue;
    if (!inText) {
      if (c === '"') inText = true;
      aus += c;
    } else if (escape) {
      escape = false;
      aus += c;
    } else if (c === '\\') {
      escape = true;
      aus += c;
    } else if (c === '"') {
      inText = false;
      aus += c;
    } else {
      aus += c === '\t' ? ' ' : c;
    }
  }
  return aus;
}
function ersteJsonStelle(t) {
  const ohneZaun = t.replace(/```(?:json)?/gi, '');
  try {
    return JSON.parse(ohneZaun.trim());
  } catch (e) {
    // weiter
  }
  const von = ohneZaun.indexOf('{');
  if (von < 0) throw new Error('kein JSON');
  const r = reparieren(ohneZaun.slice(von));
  let tiefe = 0;
  let inText = false;
  let escape = false;
  for (let i = 0; i < r.length; i++) {
    const c = r[i];
    if (inText) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inText = false;
    } else if (c === '"') inText = true;
    else if (c === '{') tiefe++;
    else if (c === '}' && --tiefe === 0) return JSON.parse(r.slice(0, i + 1));
  }
  throw new Error('JSON unvollständig');
}

const hinweise = [];
if (api.stop_reason === 'max_tokens') hinweise.push('Die Antwort wurde wegen des Token-Limits abgeschnitten (stop_reason max_tokens). Im Knoten „Claude …“ max_tokens im Body erhöhen.');
let ausgabe;
try {
  ausgabe = ersteJsonStelle(text);
} catch (e) {
  // Die Plattform fragt dann selbst noch einmal nach (höchstens dreimal)
  hinweise.push('Die Antwort ist kein gültiges JSON: ' + e.message + (e.message === 'JSON unvollständig' ? ' (abgeschnitten? Dann am Knoten „Claude …“ die Option „Maximum Number of Tokens“ erhöhen)' : ''));
  ausgabe = text;
}

// Form prüfen (nur zur Orientierung; die Plattform prüft die Form beim Lesen selbst)
function pruefeAnalyse(a) {
  if (typeof a.zusammenfassung !== 'string' || !a.zusammenfassung.trim()) hinweise.push('zusammenfassung fehlt');
  for (const [name, [min, max]] of Object.entries(k.listen)) {
    const liste = a[name];
    if (!Array.isArray(liste) || liste.length === 0) hinweise.push(name + ' fehlt oder ist leer');
    else if (liste.length < min || liste.length > max) hinweise.push(name + ': ' + liste.length + ' Punkte (erwartet ' + min + ' bis ' + max + ')');
  }
  if (!(k.hinweisSchluessel in a)) hinweise.push(k.hinweisSchluessel + ' fehlt (wird als leer gewertet)');
  if (k.verbotenMuster && new RegExp(k.verbotenMuster).test(JSON.stringify(a))) hinweise.push(k.verbotenText);
}

function pruefeAgenda(a) {
  const bloecke = a.bloecke;
  if (!Array.isArray(bloecke) || bloecke.length !== k.bloecke.length) {
    hinweise.push('bloecke: ' + k.bloecke.length + ' Blöcke erwartet');
    return;
  }
  let summe = 0;
  k.bloecke.forEach(([id, min, max], i) => {
    const b = bloecke[i];
    if (!b || typeof b !== 'object') return hinweise.push('Block ' + (i + 1) + ': id „' + id + '“ erwartet');
    const ganz = typeof b.minuten === 'number' && Number.isInteger(b.minuten);
    if (ganz) summe += b.minuten;
    if (b.id !== id) return hinweise.push('Block ' + (i + 1) + ': id „' + id + '“ erwartet');
    if (!ganz) hinweise.push(id + ': minuten ist keine ganze Zahl');
    else if (b.minuten < min || b.minuten > max) hinweise.push(id + ': ' + b.minuten + ' Minuten (erlaubt ' + min + ' bis ' + max + ')');
    const anzahl = Array.isArray(b.punkte) ? b.punkte.length : 0;
    if (anzahl === 0) hinweise.push(id + ': punkte fehlt oder ist leer');
    else if (anzahl < k.punkteProBlock[0] || anzahl > k.punkteProBlock[1]) hinweise.push(id + ': ' + anzahl + ' Punkte (erwartet ' + k.punkteProBlock[0] + ' bis ' + k.punkteProBlock[1] + ')');
  });
  if (summe < k.gesamt[0] || summe > k.gesamt[1]) hinweise.push('Summe ' + summe + ' Minuten (erlaubt ' + k.gesamt[0] + ' bis ' + k.gesamt[1] + ')');
}

if (typeof ausgabe === 'object' && ausgabe !== null && !Array.isArray(ausgabe)) {
  if (k.form === 'agenda') pruefeAgenda(ausgabe);
  else pruefeAnalyse(ausgabe);
} else if (typeof ausgabe === 'object') {
  hinweise.push('Die Antwort ist kein JSON-Objekt');
}

return fertig(200, { ausgabe, meta: { strang: k.strang, prompt_version: k.prompt_version, hinweise, ...api } });
````

**F.8 Antwort bündeln** (Code, einmal für alle)

````js
// Fasst die Ergebnisse aller Aufträge zur Antwort des Webhooks zusammen (geht direkt an die Plattform zurück).
const ergebnisse = $input.all().map((i) => ({
  ref: i.json.ref,
  code: i.json.code,
  ...(i.json.code === 200
    ? { ausgabe: i.json.ausgabe, meta: i.json.meta }
    : { fehler: i.json.fehler, detail: i.json.detail ?? null }),
}));

// Hat für keinen Auftrag etwas geklappt, steht der Fehler auch im Status der Antwort
const alleFehler = ergebnisse.every((e) => e.code >= 400);
const code = alleFehler ? (ergebnisse.some((e) => e.code === 429) ? 429 : 502) : 200;

return [{ json: { code, body: { aufgabe: $input.first().json.aufgabe, ergebnisse } } }];
````

## Anhang G: Dateien, die du mitnimmst

| Zweck | Datei im Repository `salonplattform` |
|---|---|
| Tabelle, Faktencheck, Einzelanalyse | `supabase/migrations/20261105104052_monatsabschluss_analysen.sql` |
| Schalter, Gesamtauswertung | `supabase/migrations/20261105162418_ki_admin_gesamtauswertung.sql` |
| Agenda mit KI | `supabase/migrations/20261105173245_agenda_ki.sql` |
| Agenda-Vorlage (`agenda_bauen`, `agenda_validieren`, `agenda_text`) und Fokus | `supabase/migrations/20261105115919_fokus_agenda_termine.sql` (**nur diese Teile**; der Rest betrifft Termine und Mailversand) |
| Logik und Prompts | `supabase/functions/analyse-erstellen/analyse.ts`, `index.ts`, `analyse.test.ts` |
| Browser-Ablauf | `src/lib/ki.ts`, `src/lib/api.ts` (`rufeKi`), `src/lib/abschluss.ts`, `src/lib/agenda.ts` |
| Oberfläche | `src/pages/app/leitung/Agenda.tsx`, `src/pages/app/leitung/Abschluss.tsx`, `src/pages/app/Info.tsx` (Datenschutzhinweis) |
| **Workflow (Inspiration und Vorlage)** | `n8n/dawiid-ki.workflow.json`, `n8n/README.md`, `n8n/testanfragen/*.json`, `n8n/workflow.test.mjs`, `n8n/testanfragen-erzeugen.mjs` |
| Datenbanktests | `supabase/tests/database/07_…`, `09_ki_admin_gesamt.test.sql`, `10_agenda_ki.test.sql`, `supabase/tests/lokal/` |
| Browsertests | `tests/browser/phase-e.test.mjs`, `phase-f.test.mjs`, `phase-g.test.mjs`, `helfer.mjs` |
| Beschreibung | `docs/einzelanalyse.md`, `docs/agenda-termine.md` (ohne den Abschnitt zu Termine und Versand) |

**Platzhalter und Einrichtung**

| Platzhalter | Bedeutung | Wo eintragen |
|---|---|---|
| `<PROJEKT-REF>` | Referenz des Datenbank-Projekts | Adresse der Anmeldeprüfung im Workflow, Umgebungsvariable des Frontends |
| `<ANON-KEY>` | öffentlicher Schlüssel (Rolle `anon`) | Header `apikey` der Anmeldeprüfung, Frontend |
| `<WEBHOOK-URL>` | Production-Adresse des Webhooks | `STANDARD_WEBHOOK_URL` in `analyse.ts` |
| `<ANTHROPIC-KEY>` | Schlüssel für die KI | **nur** als Zugangsdaten in n8n |

Optionale Einstellungen der Server-Funktion (alle optional): `AI_PROVIDER` (`webhook` Standard, `claude`), `AI_WEBHOOK_URL` (überschreibt die Adresse im Code), `AI_WEBHOOK_SECRET` (nur für Webhooks mit Header-Prüfung), `ANTHROPIC_API_KEY` und `ANTHROPIC_MODEL` (nur bei `claude`).

## Anhang H: Auftrag für einen KI-Assistenten (zum Kopieren)

````text
Du sollst in diese Plattform dieselben KI-Funktionen einbauen, die in der Plattform „DAWIID“ (Version 1.3)
bereits laufen: Einzelanalyse, Sammellauf, Gesamtauswertung und die Agenda fürs Teammeeting, alle nur für den
Admin. Grundlage ist das beigefügte Master-Dokument MASTER-KI-TEAMMEETING.md und die Dateien aus Anhang G.

Gehe in dieser Reihenfolge vor und halte nach jeder Phase die Tests an (Kapitel 14 und 15):
1. Lies Kapitel 1 bis 3, 5, 7 und 13. Fasse in fünf Sätzen zusammen, was du verstanden hast, und nenne, was bei
   dieser Plattform anders ist (Datenbank, Rollen, Mandanten, Daten für die Eingabe).
2. Lege Tabelle, Schalter und Zugriffsfunktion an (Anhang C.1, C.2).
3. Schreibe den Eingabe-Baustein für DIESE Plattform nach Kapitel 5.3. Der Rest bleibt wie im Dokument.
4. Übernimm Faktencheck, Agenda-Prüfung und die Funktionen eingabe/pruefen/speichern/lesen/bearbeiten/freigeben.
5. Übernimm analyse.ts und ki.ts, passe Prompts (Branche, Begriffe) an und erhöhe die Prompt-Versionen.
6. Dupliziere den n8n-Workflow, vergib einen neuen Webhook-Pfad, zeige „Anmeldung prüfen“ auf diese Plattform.
7. Baue die Oberfläche nach Kapitel 11.
8. Schreibe die Tests nach dem Mindestsatz in Kapitel 15.

Regeln, die du nicht änderst: Zahlen kommen aus SQL und nie von der KI. Die Datenbank prüft jede Zahl und rechnet
„geprueft“ selbst. Die KI bekommt keine Namen, keine Kennungen und bei Team-Aufgaben keine Kommentartexte. Es gibt
keinen Dienstschlüssel im Browser, in der Server-Funktion oder im Repository. Jedes Ergebnis ist ein Entwurf, den ein
Mensch freigibt. Nenne mir am Ende, was du nicht live testen konntest.
````
