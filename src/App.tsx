import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './AppContext'
import { Jobs } from './screens/Jobs'
import { Login } from './screens/Login'
import { Materials } from './screens/Materials'

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

function Shell() {
  const { status } = useApp()

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <img src="/favicon.svg" alt="" className="size-20 animate-pulse" />
      </div>
    )
  }

  if (status !== 'ready') return <Login />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Jobs />} />
        <Route path="/job/:id" element={<Materials />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
