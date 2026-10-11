import { Link } from 'react-router-dom'
import logo from '../assets/logo-dawiid.png'
import { MARKE } from '../lib/marke'

export function Marke({ zu = '/' }: { zu?: string }) {
  return (
    <Link to={zu} className="marke" aria-label={`${MARKE.name} ${MARKE.zusatz}, zur Startseite`}>
      <span className="marke__text">
        <span className="marke__name">{MARKE.name}</span>
        <span className="marke__zusatz">{MARKE.zusatz}</span>
      </span>
      <img className="marke__logo" src={logo} alt="" width={212} height={86} />
    </Link>
  )
}
