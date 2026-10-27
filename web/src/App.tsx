import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { usePageTitle } from './usePageTitle'
import { useLanguage } from './i18n/LanguageContext'
import { HomePage } from './pages/Home'
import { SampleDataPage } from './pages/SampleData'
import { PlaceholderPage, type PlaceholderSpec } from './pages/Placeholder'
import { NotFoundPage } from './pages/NotFound'

const PLACEHOLDERS: Record<string, PlaceholderSpec> = {
  market: { navKey: 'nav.market', descKey: 'ph.market.desc', planRef: 'A2' },
  compare: { navKey: 'nav.compare', descKey: 'ph.compare.desc', planRef: 'A2' },
  courses: { navKey: 'nav.courses', descKey: 'ph.courses.desc', planRef: 'A3' },
  opportunities: { navKey: 'nav.opportunities', descKey: 'ph.opportunities.desc', planRef: 'A5' },
  profile: { navKey: 'nav.profile', descKey: 'ph.profile.desc', planRef: 'A1/A4/A6' },
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
        {Object.entries(PLACEHOLDERS).map(([path, spec]) => (
          <Route key={path} path={`/${path}`} element={<TitledPlaceholder spec={spec} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
