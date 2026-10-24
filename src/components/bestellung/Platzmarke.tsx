/** Platznummer groß, damit ein falscher QR-Code sofort auffällt (Plan §4) */
export function Platzmarke({ platz }: { platz: number }) {
  return (
    <p className="platzmarke" aria-label={`Platz ${platz}`}>
      <span className="platzmarke__label" aria-hidden="true">
        Platz
      </span>
      <span className="platzmarke__zahl" aria-hidden="true">
        {platz}
      </span>
    </p>
  )
}
