import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import CoverPage from './pages/CoverPage'
import JourneyPage from './pages/JourneyPage'
import PlaceholderPage from './pages/PlaceholderPage'
import './carepilot.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<CoverPage />} />
        <Route path="journey" element={<JourneyPage />} />
        <Route path="summary" element={<PlaceholderPage title="Summary" />} />
        <Route path="plan" element={<PlaceholderPage title="Plan" />} />
        <Route path="explanation" element={<PlaceholderPage title="Explanation" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
