// Alles, was von Salon zu Salon verschieden ist, steht hier an einer Stelle:
// Name, Logo, Farben fürs PDF. Austausch = Datei ersetzen und neu bauen.
import logoMaske from '../assets/brand/dawiid/logo-maske.png'

/** Kurzname ohne Leerzeichen: bestimmt u. a. den Präfix der Entwürfe im Browser (`<slug>-umfrage:`). */
export const SALON_SLUG = 'dawiid'
export const SALON_NAME = 'DAWIID'
export const MARKE = { name: SALON_NAME, zusatz: 'Team-Plattform' } as const

/**
 * Logo als Maske (nur die Form, transparent). Die Farbe kommt aus dem Design (--logo in tokens.css),
 * dadurch wechselt es mit Hell und Nacht.
 */
export const LOGO_MASKE = logoMaske

/** Feste Farbwerte fürs PDF (react-pdf kennt keine CSS-Variablen). Gleich der hellen Palette in tokens.css. */
export const pdfFarben = {
  text: '#1a1208',
  text2: '#6b5b45',
  linie: '#e8e0d0',
  flaeche: '#f0ebe0',
  akzent: '#a86840',
  selbstbild: '#c4845a',
  fremdbild: '#4a7fa5',
  gruen: '#3b6d11',
  rot: '#a32d2d',
  gelb: '#854f0b',
  logo: '#353532',
} as const
