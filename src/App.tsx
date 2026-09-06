import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CalendarPage } from './pages/CalendarPage';
import { StudyPage } from './pages/StudyPage';
import { TodoPage } from './pages/TodoPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/study" element={<StudyPage />} />
          <Route path="/todo" element={<TodoPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
