import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { PublicLayout as Layout } from './components/PublicLayout'
import { useLanguage } from './i18n/LanguageContext'
import { PublicHomePage } from './public/PublicHomePage'
import { NotFoundPage } from './pages/NotFound'

const OpportunitiesPage = lazy(() => import('./features/opportunities/OpportunitiesPage').then(m => ({ default: m.OpportunitiesPage })))
const MarketPage = lazy(() => import('./features/market/MarketPage').then(m => ({ default: m.MarketPage })))
const ComparePage = lazy(() => import('./features/market/ComparePage').then(m => ({ default: m.ComparePage })))
const CoursesPage = lazy(() => import('./public/PublicCoursesPage').then(m => ({ default: m.PublicCoursesPage })))
const ResourcesPage = lazy(() => import('./public/PublicResourcesPage').then(m => ({ default: m.PublicResourcesPage })))

/** Only reviewed public pages are reachable; no AuthProvider or private gateways. */
export default function App() {
  const { t } = useLanguage()
  return (
    <Layout>
      <Suspense fallback={<p role="status">{t('public.loading')}</p>}>
        <Routes>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/pathways" element={<ResourcesPage />} />
          <Route path="/opportunities" element={<OpportunitiesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
