import { lazy } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import "./i18n";
import { AppShell } from "./components/AppShell";

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const ModulePage = lazy(() => import("./pages/ModulePage").then((module) => ({ default: module.ModulePage })));
const TimetablePage = lazy(() => import("./pages/TimetablePage").then((module) => ({ default: module.TimetablePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const AssistantPage = lazy(() => import("./pages/AssistantPage").then((module) => ({ default: module.AssistantPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((module) => ({ default: module.TasksPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((module) => ({ default: module.CalendarPage })));
const NotesPage = lazy(() => import("./pages/NotesPage").then((module) => ({ default: module.NotesPage })));
const DocsPage = lazy(() => import("./pages/DocsPage").then((module) => ({ default: module.DocsPage })));
const TimerPage = lazy(() => import("./pages/TimerPage").then((module) => ({ default: module.TimerPage })));
const FilesPage = lazy(() => import("./pages/FilesPage").then((module) => ({ default: module.FilesPage })));
const ArcadePage = lazy(() => import("./pages/ArcadePage").then((module) => ({ default: module.ArcadePage })));
const CalculatorPage = lazy(() => import("./pages/CalculatorPage").then((module) => ({ default: module.CalculatorPage })));
const TranslatePage = lazy(() => import("./pages/TranslatePage").then((module) => ({ default: module.TranslatePage })));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage").then((module) => ({ default: module.WorkspacePage })));
const SolvePage = lazy(() => import("./pages/SolvePage").then((module) => ({ default: module.SolvePage })));

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
          <Route path="docs" element={<DocsPage />} />
          <Route path="timer" element={<TimerPage />} />
          <Route path="focus" element={<Navigate to="/timer" replace />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="minigames/*" element={<ArcadePage />} />
          <Route path="calculator" element={<CalculatorPage />} />
          <Route path="translate" element={<TranslatePage />} />
          <Route path="workspace" element={<WorkspacePage />} />
          <Route path="solve" element={<SolvePage />} />
          <Route path=":module" element={<ModulePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
