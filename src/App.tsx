import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CubePage } from './pages/CubePage'
import { CubesPage } from './pages/CubesPage'
import { GeneratePage } from './pages/GeneratePage'
import { ImportPage } from './pages/ImportPage'
import { LibraryPage } from './pages/LibraryPage'
import { ThemeDetailPage } from './pages/ThemeDetailPage'
import { ThemesPage } from './pages/ThemesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LibraryPage />} />
          <Route path="themes" element={<ThemesPage />} />
          <Route path="themes/:themeId" element={<ThemeDetailPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="cubes" element={<CubesPage />} />
          <Route path="cubes/:cubeId" element={<CubePage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
