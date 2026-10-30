import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useLanguage } from './i18n/LanguageContext'
import { PublicHomePage } from './public/PublicHomePage'
import { NotFoundPage } from './pages/NotFound'

const MarketPage = lazy(() => import('./features/market/MarketPage').then(m => ({ default: m.MarketPage })))
const ComparePage = lazy(() => import('./features/market/ComparePage').then(m => ({ default: m.ComparePage })))
const CoursesPage = lazy(() => import('./public/PublicCoursesPage').then(m => ({ default: m.PublicCoursesPage })))
const ResourcesPage = lazy(() => import('./public/PublicResourcesPage').then(m => ({ default: m.PublicResourcesPage })))

/** Only the five public pages are reachable; no AuthProvider or private gateways. */
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
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
