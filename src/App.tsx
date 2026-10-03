import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireRolle, RequireTeilnahme } from './auth/Guards'
import { AppLayout } from './components/AppLayout'
import { Ladeanzeige } from './components/Ladeanzeige'
import { OeffentlichLayout } from './components/OeffentlichLayout'
import Callback from './pages/Callback'
import GaesteUmfrage from './pages/GaesteUmfrage'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Start from './pages/Start'
import Dashboard from './pages/app/Dashboard'
import Platzhalter from './pages/app/Platzhalter'
import UmfrageSeite from './pages/app/UmfrageSeite'

// Die Auswertungen bringen die Diagramm-Bibliothek mit und werden erst bei Bedarf geladen.
const ErgebnissePage = lazy(() => import('./pages/app/ErgebnissePage'))
const TeamSeite = lazy(() => import('./pages/app/TeamSeite'))
const MitgliederSeite = lazy(() => import('./pages/app/MitgliederSeite'))
const MitgliedSeite = lazy(() => import('./pages/app/MitgliedSeite'))

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Ladeanzeige text="Wird geladen …" />}>
      <Routes>
        {/* öffentlich */}
        <Route element={<OeffentlichLayout />}>
          <Route index element={<Start />} />
          <Route path="login" element={<Login />} />
          <Route path="auth/callback" element={<Callback />} />
          <Route path="gaeste-umfrage" element={<GaesteUmfrage />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* nach dem Login, Rechte pro Route (Plan §3) */}
        <Route path="app" element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />

            <Route element={<RequireTeilnahme />}>
              <Route path="umfrage" element={<UmfrageSeite />} />
              <Route path="umfrage/:monat" element={<UmfrageSeite />} />
              <Route path="ergebnisse" element={<ErgebnissePage />} />
            </Route>

            <Route path="team" element={<TeamSeite />} />
            <Route path="chefumfrage" element={<Platzhalter />} />
            <Route path="coaching" element={<Platzhalter />} />

            <Route element={<RequireRolle rollen={['verantwortlicher', 'admin']} />}>
              <Route path="mitglieder" element={<MitgliederSeite />} />
              <Route path="mitglieder/:id" element={<MitgliedSeite />} />
              <Route path="gaeste" element={<Platzhalter />} />
              <Route path="meine-umfrage" element={<Platzhalter />} />
            </Route>

            <Route path="*" element={<NotFound zu="/app" />} />
          </Route>
        </Route>
      </Routes>
      </Suspense>
    </AuthProvider>
  )
}
