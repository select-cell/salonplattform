import { Link } from 'react-router-dom'
import logo from '../assets/logo-dawiid.png'
import { MARKE } from '../lib/marke'

export function Marke({ zu = '/' }: { zu?: string }) {
  return (
    <Link to={zu} className="marke" aria-label={`${MARKE.name} ${MARKE.zusatz}, zur Startseite`}>
      <img className="marke__logo" src={logo} alt={MARKE.name} width={212} height={86} />
    </Link>
  )
}
