import { Link } from 'react-router-dom'
import { MARKE } from '../config/brand'
import { BrandLogo } from './BrandLogo'

export function Marke({ zu = '/' }: { zu?: string }) {
  return (
    <Link to={zu} className="marke" aria-label={`${MARKE.name} ${MARKE.zusatz}, zur Startseite`}>
      <BrandLogo />
    </Link>
  )
}
