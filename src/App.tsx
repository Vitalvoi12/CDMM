import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AuthPage } from './components/auth/AuthPage';
import { CalendarPage } from './pages/CalendarPage';
import { StudyPage } from './pages/StudyPage';
import { TodoPage } from './pages/TodoPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { getToken, clearSession, onUnauthorized } from './services/auth';
import { clearAllLocalData } from './services/repositories';
import { useServerSync } from './hooks/useServerSync';

function Shell() {
  const { ready } = useServerSync();
  if (!ready) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <p className="font-body-lg text-body-lg text-on-surface-variant">Syncing…</p>
      </div>
    );
  }
  return <AppShell />;
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => getToken() !== null);

  const handleLogout = useCallback(() => {
    clearSession();
    clearAllLocalData();
    setAuthed(false);
  }, []);

  useEffect(() => onUnauthorized(handleLogout), [handleLogout]);

  if (!authed) {
    return <AuthPage onDone={() => setAuthed(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/study" element={<StudyPage />} />
          <Route path="/todo" element={<TodoPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage onLogout={handleLogout} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
