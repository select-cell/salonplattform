// react-pdf zeigt kein SVG und keine CSS-Masken: Die Logo-Maske wird im Browser in der PDF-Logofarbe
// vierfach vergrößert in ein PNG gezeichnet.
import { LOGO_MASKE, pdfFarben } from '../config/brand'

export async function ladeLogoPng(): Promise<string | null> {
  try {
    const bild = new Image()
    bild.src = LOGO_MASKE
    await bild.decode()
    const leinwand = document.createElement('canvas')
    leinwand.width = bild.naturalWidth
    leinwand.height = bild.naturalHeight
    const stift = leinwand.getContext('2d')
    if (!stift) return null
    stift.fillStyle = pdfFarben.logo
    stift.fillRect(0, 0, leinwand.width, leinwand.height)
    stift.globalCompositeOperation = 'destination-in'
    stift.drawImage(bild, 0, 0)
    return leinwand.toDataURL('image/png')
  } catch {
    return null
  }
}

/** Seitenverhältnis der Maske (Breite ÷ Höhe), passend zu logo-maske.png */
export const LOGO_VERHAELTNIS = 992 / 336
