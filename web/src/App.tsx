import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { usePageTitle } from './usePageTitle'
import { useLanguage } from './i18n/LanguageContext'
import { HomePage } from './pages/Home'
import { SampleDataPage } from './pages/SampleData'
import { AccountPage } from './pages/Account'
import { MarketPage } from './features/market/MarketPage'
import { ComparePage } from './features/market/ComparePage'
import { CoursesPage } from './features/profile/CoursesPage'
import { ProfileSkillsPage } from './features/profile/ProfileSkillsPage'
import { PathwaysPage } from './features/pathways/PathwaysPage'
import { PlaceholderPage, type PlaceholderSpec } from './pages/Placeholder'
import { NotFoundPage } from './pages/NotFound'

const PLACEHOLDERS: Record<string, PlaceholderSpec> = {
  opportunities: { navKey: 'nav.opportunities', descKey: 'ph.opportunities.desc', planRef: 'A5' },
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
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/profile" element={<ProfileSkillsPage />} />
        <Route path="/pathways" element={<PathwaysPage />} />
        {Object.entries(PLACEHOLDERS).map(([path, spec]) => (
          <Route key={path} path={`/${path}`} element={<TitledPlaceholder spec={spec} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
