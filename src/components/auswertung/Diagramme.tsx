import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { FARBE_FB, FARBE_SB, monatKurz, zahl } from '../../lib/auswertung'

const ACHSE = { fontSize: 12, fill: '#6b5b45' }
const tooltipWert = (v: unknown) => (typeof v === 'number' ? zahl(v, 2) : '–')

export interface BalkenDaten {
  name: string
  voll?: string
  sb: number | null
  fb: number | null
}

/** Gruppierte Balken: Kupfer = Selbstbild, Blau = Fremdbild (Plan §5.6) */
export function SbFbDiagramm({ daten, beschreibung }: { daten: BalkenDaten[]; beschreibung: string }) {
  return (
    <div className="diagramm" role="img" aria-label={beschreibung}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e0d0" />
          <XAxis dataKey="name" tick={ACHSE} interval={0} />
          <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={ACHSE} />
          <Tooltip
            formatter={tooltipWert}
            labelFormatter={(l, p) => (p?.[0]?.payload as BalkenDaten | undefined)?.voll ?? String(l)}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="sb" name="Selbstbild" fill={FARBE_SB} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="fb" name="Fremdbild" fill={FARBE_FB} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Differenz Selbstbild − Fremdbild je Person: grün = ausgewogen, rot = Abweichung */
export function DifferenzDiagramm({
  daten,
  schwelle,
}: {
  daten: { name: string; differenz: number | null }[]
  schwelle: number
}) {
  return (
    <div className="diagramm" role="img" aria-label="Differenz zwischen Selbstbild und Fremdbild je Person">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daten} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e0d0" />
          <XAxis dataKey="name" tick={ACHSE} interval={0} />
          <YAxis tick={ACHSE} />
          <Tooltip formatter={tooltipWert} />
          <ReferenceLine y={0} stroke="#6b5b45" />
          <Bar dataKey="differenz" name="Selbstbild − Fremdbild" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {daten.map((d) => (
              <Cell key={d.name} fill={d.differenz !== null && Math.abs(d.differenz) <= schwelle ? '#3B6D11' : '#A32D2D'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface VerlaufDaten {
  monat: string
  sb: number | null
  fb: number | null
}

export function VerlaufDiagramm({ daten }: { daten: VerlaufDaten[] }) {
  const beschriftet = daten.map((d) => ({ ...d, name: monatKurz(d.monat) }))
  return (
    <div className="diagramm" role="img" aria-label="Verlauf von Selbstbild und Fremdbild über alle Monate">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={beschriftet} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e0d0" />
          <XAxis dataKey="name" tick={ACHSE} />
          <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={ACHSE} />
          <Tooltip formatter={tooltipWert} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line type="monotone" dataKey="sb" name="Ø Selbstbild" stroke={FARBE_SB} strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="fb" name="Ø Fremdbild" stroke={FARBE_FB} strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
