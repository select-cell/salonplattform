# QR-Codes für die Plätze

Erzeugt je Platz eine druckbare Karte (SVG und PNG, 70 × 90 mm) mit QR-Code und der Beschriftung „Platz N“.

```bash
cd tools/qr-codes
npm install                                   # einmalig
npm run erzeugen -- https://deine-domain.de   # Plätze 1 bis 7 nach ../../qr-codes/
```

Weitere Möglichkeiten:

```bash
npm run erzeugen -- https://deine-domain.de --plaetze 1-9
npm run erzeugen -- https://deine-domain.de --plaetze 3,5 --ausgabe ~/Desktop/karten
```

## Wichtig vor dem Druck

- **Erst mit der endgültigen Domain erzeugen.** Gedruckte, laminierte Codes zeigen für immer auf die Adresse, die beim Erzeugen angegeben war. Das Skript warnt bei `netlify.app`-Adressen.
- Nur die Domain angeben, ohne Pfad. Der Link je Platz entsteht von selbst: `https://deine-domain.de/p/4`.
- Mit dem Handy einen Platz testen, bevor alle laminiert werden.
- Auf 100 % drucken. Der QR-Code ist dann rund 4 cm groß, mehr als die empfohlenen 3 cm.
- Auf die Ecken des Codes nichts aufkleben. Das Muster unten rechts hilft dem Handy beim Entzerren.

## Technik

- Fehlerkorrektur **Stufe H**: Der Code bleibt auch lesbar, wenn ein Teil verkratzt oder verdeckt ist.
- 4 Module Ruhezone rund um den Code, wie vom QR-Standard verlangt (wichtig beim Laminieren).
- Die Schrift (DM Serif Display, DM Sans) ist in Pfade umgewandelt: Die Dateien brauchen keine installierte Schrift.
- Eigene `package.json`: Die Abhängigkeiten gehören nicht zur Plattform und beeinflussen den Netlify-Build nicht.
