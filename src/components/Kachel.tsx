import { Link } from 'react-router-dom'
import { zielFuer, type Bereich } from '../lib/navigation'
import { Icon } from './Icon'

export function Kachel({ bereich }: { bereich: Bereich }) {
  return (
    <Link to={zielFuer(bereich)} className="kachel">
      <span className="kachel__icon">
        <Icon name={bereich.icon} />
      </span>
      <span className="kachel__titel">{bereich.titel}</span>
      <span className="kachel__text">{bereich.kurz}</span>
      {!bereich.live && <span className="badge badge--akzent kachel__badge">Kommt bald</span>}
    </Link>
  )
}
