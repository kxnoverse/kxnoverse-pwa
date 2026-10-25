import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import "./i18n";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { ModulePage } from "./pages/ModulePage";
import { TimetablePage } from "./pages/TimetablePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AssistantPage } from "./pages/AssistantPage";
import { TasksPage } from "./pages/TasksPage";
import { CalendarPage } from "./pages/CalendarPage";
import { NotesPage } from "./pages/NotesPage";
import { FocusPage } from "./pages/FocusPage";
import { FilesPage } from "./pages/FilesPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="focus" element={<FocusPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path=":module" element={<ModulePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
