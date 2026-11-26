import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useDataVersion } from './data/DataVersionContext'
import { HomePage } from './pages/Home'
import { SampleDataPage } from './pages/SampleData'
import { AccountPage } from './pages/Account'
import { MarketPage } from './features/market/MarketPage'
import { ComparePage } from './features/market/ComparePage'
import { CoursesPage } from './features/profile/CoursesPage'
import { ProfileSkillsPage } from './features/profile/ProfileSkillsPage'
import { PathwaysPage } from './features/pathways/PathwaysPage'
import { OpportunitiesPage } from './features/opportunities/OpportunitiesPage'
import { FavoritesPage } from './features/favorites/FavoritesPage'
import { NotFoundPage } from './pages/NotFound'
import { PublicHomePage } from './public/PublicHomePage'
import { ResourcesPage } from './features/pathways/ResourcesPage'

export default function App() {
  const { config } = useDataVersion()
  const published = config.mode === 'published'
  return (
    <Layout>
      <Routes>
        <Route path="/" element={published ? <PublicHomePage /> : <HomePage />} />
        {!published ? <Route path="/sample" element={<SampleDataPage />} /> : null}
        <Route path="/account" element={<AccountPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/profile" element={<ProfileSkillsPage />} />
        <Route path="/pathways" element={<PathwaysPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
