import { Navigate, useParams } from 'react-router-dom'
import { aktuellerMonat, istMonat, monatLabel } from '../../lib/monat'
import NotFound from '../NotFound'
import Platzhalter from './Platzhalter'

/** /app/umfrage → laufender Monat. /app/umfrage/:monat mit monat = YYYY-MM. */
export default function UmfrageSeite() {
  const { monat } = useParams()
  if (!monat) return <Navigate to={`/app/umfrage/${aktuellerMonat()}`} replace />
  if (!istMonat(monat)) return <NotFound zu="/app" />
  return <Platzhalter titel={`Umfrage ${monatLabel(monat)}`} />
}
