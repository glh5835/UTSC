import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { usePageTitle } from './usePageTitle'
import { useLanguage } from './i18n/LanguageContext'
import { HomePage } from './pages/Home'
import { SampleDataPage } from './pages/SampleData'
import { AccountPage } from './pages/Account'
import { MarketPage } from './features/market/MarketPage'
import { ComparePage } from './features/market/ComparePage'
import { PlaceholderPage, type PlaceholderSpec } from './pages/Placeholder'
import { NotFoundPage } from './pages/NotFound'

const PLACEHOLDERS: Record<string, PlaceholderSpec> = {
  courses: { navKey: 'nav.courses', descKey: 'ph.courses.desc', planRef: 'A3' },
  opportunities: { navKey: 'nav.opportunities', descKey: 'ph.opportunities.desc', planRef: 'A5' },
  profile: { navKey: 'nav.profile', descKey: 'ph.profile.desc', planRef: 'A4/A6' },
}

/** Placeholder wrapper that also sets the page title for its route. */
function TitledPlaceholder({ spec }: { spec: PlaceholderSpec }) {
  const { t } = useLanguage()
  usePageTitle(t(spec.navKey))
  return <PlaceholderPage spec={spec} />
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sample" element={<SampleDataPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/compare" element={<ComparePage />} />
        {Object.entries(PLACEHOLDERS).map(([path, spec]) => (
          <Route key={path} path={`/${path}`} element={<TitledPlaceholder spec={spec} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
