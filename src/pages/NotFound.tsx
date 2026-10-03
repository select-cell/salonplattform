import { Link } from 'react-router-dom'

export default function NotFound({ zu = '/' }: { zu?: string }) {
  return (
    <div className="leer">
      <span className="leer__zahl">404</span>
      <h1 style={{ fontSize: '1.75rem' }}>Diese Seite gibt es nicht</h1>
      <p className="muted">Vielleicht hat sich der Link geändert oder er enthält einen Tippfehler.</p>
      <Link to={zu} className="btn">
        Zur Startseite
      </Link>
    </div>
  )
}
