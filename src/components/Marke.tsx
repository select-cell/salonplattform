import { Link } from 'react-router-dom'
import { MARKE } from '../lib/marke'

/** Kopf-Logo: eine Maske in der Logo-Farbe des Designs, damit es im hellen und im Nachtmodus mitwechselt. */
export function Marke({ zu = '/' }: { zu?: string }) {
  return (
    <Link to={zu} className="marke" aria-label={`${MARKE.name} ${MARKE.zusatz}, zur Startseite`}>
      <span className="marke__logo" role="img" aria-label={MARKE.name} />
    </Link>
  )
}
