import { MARKE } from '../lib/marke'

export function Fuss() {
  return (
    <footer className="fuss">
      <div className="container fuss__innen">
        <span>
          {MARKE.name} · {MARKE.zusatz}
        </span>
        <span>Nur für eingeladene Personen</span>
      </div>
    </footer>
  )
}
