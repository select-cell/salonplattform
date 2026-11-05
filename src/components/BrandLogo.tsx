import type { CSSProperties } from 'react'
import { LOGO_MASKE, MARKE } from '../config/brand'

/** Das Logo der Plattform. Höhe über die Eigenschaft, die Breite folgt dem Seitenverhältnis. */
export function BrandLogo({ hoehe }: { hoehe?: number }) {
  const stil = { '--logo-maske': `url(${LOGO_MASKE})`, ...(hoehe ? { height: hoehe } : {}) } as CSSProperties
  return <span className="marke__logo" role="img" aria-label={MARKE.name} style={stil} />
}
