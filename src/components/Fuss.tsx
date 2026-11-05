import { Link } from 'react-router-dom'
import { MARKE } from '../config/brand'

export function Fuss() {
  return (
    <footer className="fuss">
      <div className="container fuss__innen">
        <span>
          {MARKE.name} · {MARKE.zusatz}
        </span>
        <span>
          <Link to="/app/info" className="textlink">
            Info und Datenschutz
          </Link>
          {' · '}Nur für eingeladene Personen
        </span>
      </div>
    </footer>
  )
}
