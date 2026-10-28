import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays,
  CalendarRange,
  Calculator,
  House,
  ListTodo,
  Gamepad2,
  MessageSquareText,
  NotebookPen,
  FileText,
  Settings,
  Timer,
  Languages,
  PanelsTopLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import { defaultAppearance, useUiStore } from "../stores/ui-store";
import { BrandMark } from "./BrandMark";
import { BackgroundLayer } from "./BackgroundLayer";
import { PwaUpdateNotice } from "./PwaUpdateNotice";

const navigation = [
  { key: "home", path: "/", icon: House },
  { key: "workspace", path: "/workspace", icon: PanelsTopLeft },
  { key: "timetable", path: "/timetable", icon: CalendarRange },
  { key: "assistant", path: "/assistant", icon: MessageSquareText },
  { key: "tasks", path: "/tasks", icon: ListTodo },
  { key: "calendar", path: "/calendar", icon: CalendarDays },
  { key: "timer", path: "/timer", icon: Timer },
  { key: "notes", path: "/notes", icon: NotebookPen },
  { key: "docs", path: "/docs", icon: FileText },
  { key: "minigames", path: "/minigames", icon: Gamepad2 },
  { key: "calculator", path: "/calculator", icon: Calculator },
  { key: "translate", path: "/translate", icon: Languages },
] as const;

export function AppShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isWorkspace = location.pathname === "/workspace";
  const [workspaceSidebarCollapsed, setWorkspaceSidebarCollapsed] = useState(false);
  const appearance = useUiStore((state) => state.appearance);
  const image = useLiveQuery(() => db.settings.get("backgroundImage"), [], undefined)?.value;
  const pageName =
    location.pathname === "/settings"
      ? "settings"
      : location.pathname === "/solve"
        ? "solve"
      : location.pathname === "/files"
        ? "files"
        : location.pathname.startsWith("/minigames")
          ? "minigames"
          : navigation.find((item) => item.path === location.pathname)?.key ?? "home";

  useEffect(() => {
    document.title = `${t("appName")} — ${t(`nav.${pageName}`)}`;
  }, [i18n.language, pageName, t]);

  return (
    <div
      className={`app-frame${isWorkspace ? " app-frame--workspace" : ""}${isWorkspace && workspaceSidebarCollapsed ? " app-frame--workspace-collapsed" : ""}`}
      data-theme={appearance.mode}
      data-performance-mode={appearance.performanceMode}
      style={
        {
          "--accent": appearance.accent,
          "--surface-0":
            appearance.mode === "light" && appearance.background === defaultAppearance.background
              ? "#f0f1f3"
              : appearance.background,
          "--surface-1":
            appearance.mode === "light" && appearance.surface === defaultAppearance.surface
              ? "#f7f8fa"
              : appearance.surface,
          "--text-contrast": appearance.textContrast,
          "--border-intensity": appearance.borderIntensity,
          "--radius": `${appearance.cornerRadius}px`,
          "--ui-scale": appearance.uiScale,
        } as React.CSSProperties
      }
    >
      <BackgroundLayer
        accentInfluence={appearance.accentInfluence}
        accent={appearance.accent}
        animationSpeed={appearance.animationSpeed}
        animate={appearance.animateBackground}
        highlights={appearance.highlights}
        image={image}
        imageBlur={appearance.imageBlur}
        imageFit={appearance.imageFit}
        imageOverlay={appearance.imageOverlay}
        imagePosition={appearance.imagePosition}
        intensity={appearance.intensity}
        opacity={appearance.opacity}
        performanceMode={appearance.performanceMode}
        reflectionStrength={appearance.reflectionStrength}
        cursorReactive={appearance.cursorReactive}
        spacing={appearance.gridSpacing}
        style={appearance.backgroundStyle}
      />
      <aside className="sidebar">
        {!isWorkspace || !workspaceSidebarCollapsed ? (
          <>
            <Link className="sidebar__brand" to="/" aria-label={t("appName")}>
              <BrandMark />
            </Link>
            <nav id="main-navigation" className="sidebar__nav" aria-label={t("nav.landmark")}>
              <span className="sidebar__section-label">{t("nav.main")}</span>
              {navigation.map(({ key, path, icon: Icon }) => (
                <NavLink
                  aria-label={t(`nav.${key}`)}
                  className={({ isActive }) =>
                    `nav-link${isActive ? " nav-link--active" : ""}`
                  }
                  end={path === "/"}
                  key={path}
                  title={t(`nav.${key}`)}
                  to={path}
                >
                  <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>{t(`nav.${key}`)}</span>
                </NavLink>
              ))}
            </nav>
            <div className="sidebar__bottom">
              <NavLink
                aria-label={t("nav.settings")}
                className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
                title={t("nav.settings")}
                to="/settings"
              >
                <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{t("nav.settings")}</span>
              </NavLink>
            </div>
          </>
        ) : null}
        {isWorkspace && (
          <button
            className="workspace-sidebar-toggle"
            type="button"
            aria-label={t(workspaceSidebarCollapsed ? "workspace.expandNavigation" : "workspace.collapseNavigation")}
            aria-expanded={!workspaceSidebarCollapsed}
            aria-controls="main-navigation"
            title={t(workspaceSidebarCollapsed ? "workspace.expandNavigation" : "workspace.collapseNavigation")}
            onClick={() => setWorkspaceSidebarCollapsed((collapsed) => !collapsed)}
          >
            {workspaceSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </aside>
      <main className={`main-column${isWorkspace ? " main-column--workspace" : ""}`}>
        <div className={`page-scroll${isWorkspace ? " page-scroll--workspace" : ""}`}>
          <Suspense fallback={<p className="route-loading" role="status">{t("app.loading")}</p>}>
            <Outlet />
          </Suspense>
          <footer className="app-footer">Kxno Desk · Made By Kxno (Shero)</footer>
        </div>
      </main>
      <PwaUpdateNotice />
    </div>
  );
}
