#!/usr/bin/env node
// Erzeugt druckbare QR-Codes für die Plätze des Bestellsystems (docs/bestellsystem.md §4).
//
//   npm install                                  (einmalig, in diesem Ordner)
//   npm run erzeugen -- https://deine-domain.de  (alle Plätze 1 bis 7)
//   npm run erzeugen -- https://deine-domain.de --plaetze 1-9 --ausgabe ../../qr-codes
//
// Je Platz entstehen eine SVG- und eine PNG-Datei: Karte 70 × 90 mm, QR-Code mit Fehlerkorrektur
// Stufe H (übersteht Kratzer und Laminat), 4 Module Ruhezone, beschriftet mit „Platz N“.
// PNG mit 600 dpi, SVG in Millimetern. Die Schrift ist in Pfade umgewandelt, die Dateien
// brauchen also keine installierte Schriftart.
import { Resvg } from '@resvg/resvg-js'
import opentype from 'opentype.js'
import QRCode from 'qrcode'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))

// ---- Layout in Millimetern -------------------------------------------------------------------
const KARTE = { breite: 70, hoehe: 90 }
const QR_KANTE = 54 // Kantenlänge inklusive Ruhezone (4 Module je Seite)
const RUHEZONE = 4 // Module; der QR-Standard verlangt mindestens 4
const QR_OBEN = 6
const DPI = 600

const FARBE = { qr: '#000000', text: '#1a1208', akzent: '#a86840', klein: '#6b5b45', rand: '#d9d2c5' }

// ---- Aufruf lesen ------------------------------------------------------------------------------
function hilfeUndEnde(meldung) {
  if (meldung) console.error(`\nFehler: ${meldung}\n`)
  console.error('Aufruf: npm run erzeugen -- <https://domain> [--plaetze 1-7] [--ausgabe <ordner>]')
  process.exit(meldung ? 1 : 0)
}

function leseArgumente(argv) {
  const opt = { plaetze: '1-7', ausgabe: resolve(HIER, '../../qr-codes') }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plaetze') opt.plaetze = argv[++i]
    else if (argv[i] === '--ausgabe') opt.ausgabe = resolve(process.cwd(), argv[++i] ?? '')
    else if (argv[i] === '--hilfe' || argv[i] === '-h') hilfeUndEnde()
    else rest.push(argv[i])
  }
  if (rest.length !== 1) hilfeUndEnde('Bitte genau eine Basis-Adresse angeben.')
  return { ...opt, basis: rest[0] }
}

export function basisAdresse(roh) {
  let url
  try {
    url = new URL(roh)
  } catch {
    throw new Error(`„${roh}“ ist keine gültige Adresse (Beispiel: https://bestellen.deinsalon.de).`)
  }
  const lokal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(lokal && url.protocol === 'http:')) {
    throw new Error('Die Adresse muss mit https:// beginnen.')
  }
  if (url.pathname.replace(/\/+$/, '') !== '' || url.search || url.hash) {
    throw new Error('Bitte nur die Domain angeben, ohne Pfad (z. B. https://bestellen.deinsalon.de).')
  }
  return url.origin
}

export function leseDiePlaetze(roh) {
  const plaetze = new Set()
  for (const teil of String(roh).split(',')) {
    const bereich = /^(\d{1,3})-(\d{1,3})$/.exec(teil.trim())
    const einzeln = /^(\d{1,3})$/.exec(teil.trim())
    const [von, bis] = bereich ? [Number(bereich[1]), Number(bereich[2])] : einzeln ? [Number(einzeln[1]), Number(einzeln[1])] : []
    if (von === undefined || von < 1 || bis < von) throw new Error(`„${teil}“ ist keine gültige Platzangabe (Beispiele: 1-7 oder 1,3,5).`)
    for (let n = von; n <= bis; n++) plaetze.add(n)
  }
  return [...plaetze].sort((a, b) => a - b)
}

// ---- Schrift als Pfade -------------------------------------------------------------------------
function ladeSchrift(datei) {
  const puffer = readFileSync(resolve(HIER, 'node_modules/@fontsource', datei))
  return opentype.parse(puffer.buffer.slice(puffer.byteOffset, puffer.byteOffset + puffer.byteLength))
}

const serif = () => ladeSchrift('dm-serif-display/files/dm-serif-display-latin-400-normal.woff')
const sans = () => ladeSchrift('dm-sans/files/dm-sans-latin-400-normal.woff')

/**
 * Text Zeichen für Zeichen setzen (ohne Kerning und Ligaturen). Die Layout-Regeln von DM Sans
 * (GSUB Typ 6) kann opentype.js nicht auswerten; für Platznummer und Hinweiszeile reicht das.
 * Liefert die Breite in mm und den fertigen <path>, x = linke Kante, y = Grundlinie.
 */
function setze(schrift, text, groesse, farbe) {
  const skala = groesse / schrift.unitsPerEm
  const glyphen = []
  let breite = 0
  for (const zeichen of text) {
    const glyphe = schrift.charToGlyph(zeichen)
    glyphen.push({ glyphe, versatz: breite })
    breite += glyphe.advanceWidth * skala
  }
  const pfad = (x, y) =>
    `<path d="${glyphen.map(({ glyphe, versatz }) => glyphe.getPath(x + versatz, y, groesse).toPathData(3)).join('')}" fill="${farbe}"/>`
  return { breite, pfad }
}

// ---- Karte bauen -------------------------------------------------------------------------------
export function baueKarteSvg(url, platz, schriften) {
  // Fehlerkorrektur H: bis etwa 30 % des Codes dürfen unlesbar sein
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
  const n = qr.modules.size
  const modul = QR_KANTE / (n + 2 * RUHEZONE)

  let rechtecke = ''
  for (let zeile = 0; zeile < n; zeile++) {
    for (let spalte = 0; spalte < n; ) {
      if (!qr.modules.get(zeile, spalte)) {
        spalte++
        continue
      }
      let laenge = 0
      while (spalte + laenge < n && qr.modules.get(zeile, spalte + laenge)) laenge++
      rechtecke += `M${spalte} ${zeile}h${laenge}v1h-${laenge}z`
      spalte += laenge
    }
  }

  const qrX = (KARTE.breite - QR_KANTE) / 2
  const mitte = KARTE.breite / 2

  // „Platz 4“: Wort in Dunkelbraun, Zahl in Akzentfarbe, zusammen mittig
  const wort = setze(schriften.serif, 'Platz ', 12, FARBE.text)
  const zahl = setze(schriften.serif, String(platz), 12, FARBE.akzent)
  const startX = mitte - (wort.breite + zahl.breite) / 2
  const grundlinie = QR_OBEN + QR_KANTE + 16
  const hinweis = setze(schriften.sans, 'QR-Code scannen und anfordern', 3.4, FARBE.klein)

  const titel = `QR-Code für Platz ${platz}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${KARTE.breite}mm" height="${KARTE.hoehe}mm" viewBox="0 0 ${KARTE.breite} ${KARTE.hoehe}" role="img" aria-labelledby="t d">
  <title id="t">${titel}</title>
  <desc id="d">${url}</desc>
  <rect width="${KARTE.breite}" height="${KARTE.hoehe}" fill="#ffffff"/>
  <rect x="0.1" y="0.1" width="${KARTE.breite - 0.2}" height="${KARTE.hoehe - 0.2}" fill="none" stroke="${FARBE.rand}" stroke-width="0.2"/>
  <g transform="translate(${qrX} ${QR_OBEN}) scale(${modul}) translate(${RUHEZONE} ${RUHEZONE})" shape-rendering="crispEdges">
    <rect x="${-RUHEZONE}" y="${-RUHEZONE}" width="${n + 2 * RUHEZONE}" height="${n + 2 * RUHEZONE}" fill="#ffffff"/>
    <path d="${rechtecke}" fill="${FARBE.qr}"/>
  </g>
  ${wort.pfad(startX, grundlinie)}
  ${zahl.pfad(startX + wort.breite, grundlinie)}
  ${hinweis.pfad(mitte - hinweis.breite / 2, grundlinie + 8)}
</svg>
`
}

export function svgZuPng(svg) {
  const breitePx = Math.round((KARTE.breite / 25.4) * DPI)
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: breitePx },
    background: '#ffffff',
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng()
}

// ---- Hauptprogramm -----------------------------------------------------------------------------
function main() {
  const opt = leseArgumente(process.argv.slice(2))
  let basis, plaetze
  try {
    basis = basisAdresse(opt.basis)
    plaetze = leseDiePlaetze(opt.plaetze)
  } catch (fehler) {
    hilfeUndEnde(fehler.message)
  }
  if (/netlify\.app$/.test(new URL(basis).hostname)) {
    console.warn(
      '\nACHTUNG: Das ist eine netlify.app-Adresse. Gedruckte und laminierte Codes zeigen dann für immer\n' +
        'dorthin. Erzeuge die Codes für den Druck erst mit der endgültigen Domain.\n',
    )
  }

  const schriften = { serif: serif(), sans: sans() }
  mkdirSync(opt.ausgabe, { recursive: true })
  for (const platz of plaetze) {
    const url = `${basis}/p/${platz}`
    const svg = baueKarteSvg(url, platz, schriften)
    writeFileSync(resolve(opt.ausgabe, `platz-${platz}.svg`), svg)
    writeFileSync(resolve(opt.ausgabe, `platz-${platz}.png`), svgZuPng(svg))
    console.log(`Platz ${platz}: ${url}`)
  }
  console.log(`\n${plaetze.length} Karten (SVG und PNG, ${KARTE.breite} × ${KARTE.hoehe} mm) in ${opt.ausgabe}`)
  console.log('Druck: mindestens 100 % Größe, QR-Code ca. 4 cm. Vor dem Laminieren einen Platz mit dem Handy testen.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
