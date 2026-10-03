import { Link } from 'react-router-dom'
import { MARKE } from '../lib/marke'

export function Marke({ zu = '/' }: { zu?: string }) {
  return (
    <Link to={zu} className="marke" aria-label={`${MARKE.name} ${MARKE.zusatz}, zur Startseite`}>
      <span className="marke__zeichen" aria-hidden="true">
        {MARKE.name.charAt(0)}
      </span>
      <span className="marke__text">
        <span className="marke__name">{MARKE.name}</span>
        <span className="marke__zusatz">{MARKE.zusatz}</span>
      </span>
    </Link>
  )
}
