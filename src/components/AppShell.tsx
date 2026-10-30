import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays,
  CalendarRange,
  Calculator,
  House,
  Gamepad2,
  MessageSquareText,
  FileText,
  Settings,
  Timer,
  Languages,
  PanelsTopLeft,
  ChevronLeft,
  ChevronRight,
  Code2,
  Music2,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import { defaultAppearance, useUiStore } from "../stores/ui-store";
import { BrandMark } from "./BrandMark";
import { BackgroundLayer } from "./BackgroundLayer";
import { PwaUpdateNotice } from "./PwaUpdateNotice";
import { disposeMusicPlayer } from "../stores/music-store";
import {
  ScreensaverOverlay,
  ScreensaverProvider,
  useScreensaver,
} from "./Screensaver";
import { MusicMiniPlayer } from "./MusicMiniPlayer";

const navigation = [
  { key: "home", path: "/", icon: House },
  { key: "workspace", path: "/workspace", icon: PanelsTopLeft },
  { key: "timetable", path: "/timetable", icon: CalendarRange },
  { key: "assistant", path: "/assistant", icon: MessageSquareText },
  { key: "calendar", path: "/calendar", icon: CalendarDays },
  { key: "timer", path: "/timer", icon: Timer },
  { key: "docs", path: "/docs", icon: FileText },
  { key: "codeLab", path: "/code-lab", icon: Code2 },
  { key: "music", path: "/music", icon: Music2 },
  { key: "minigames", path: "/minigames", icon: Gamepad2 },
  { key: "calculator", path: "/calculator", icon: Calculator },
  { key: "translate", path: "/translate", icon: Languages },
] as const;

export function AppShell() {
  return (
    <ScreensaverProvider>
      <AppShellLayout />
    </ScreensaverProvider>
  );
}

function AppShellLayout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { isActive: isScreensaverActive, dismiss } = useScreensaver();
  const isHome = location.pathname === "/";
  const isWorkspace = location.pathname === "/workspace";
  const isCodeLab = location.pathname === "/code-lab";
  const [workspaceSidebarCollapsed, setWorkspaceSidebarCollapsed] = useState(false);
  const previousPath = useRef(location.pathname);
  const appearance = useUiStore((state) => state.appearance);
  const homeTypography = useUiStore((state) => state.homeTypography);
  const image = useLiveQuery(() => db.settings.get("backgroundImage"), [], undefined)?.value;
  const pageName =
    location.pathname === "/settings"
      ? "settings"
      : location.pathname === "/solve"
        ? "solve"
      : location.pathname === "/code-lab"
        ? "codeLab"
      : location.pathname === "/files"
        ? "files"
        : location.pathname.startsWith("/minigames")
          ? "minigames"
          : navigation.find((item) => item.path === location.pathname)?.key ?? "home";

  useEffect(() => () => disposeMusicPlayer(), []);

  useEffect(() => {
    document.title = `${t("appName")} — ${t(`nav.${pageName}`)}`;
  }, [i18n.language, pageName, t]);

  useEffect(() => {
    if (previousPath.current !== location.pathname && isScreensaverActive) {
      dismiss();
    }
    previousPath.current = location.pathname;
  }, [dismiss, isScreensaverActive, location.pathname]);

  return (
    <div
      className={`app-frame${isHome ? " app-frame--home" : ""}${isWorkspace ? " app-frame--workspace" : ""}${isCodeLab ? " app-frame--code-lab" : ""}${isWorkspace && workspaceSidebarCollapsed ? " app-frame--workspace-collapsed" : ""}${isScreensaverActive ? " app-frame--screensaver" : ""}`}
      data-theme={appearance.mode}
      data-performance-mode={appearance.performanceMode}
      data-home-typography={homeTypography}
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
      <aside className="sidebar glass">
        {!isWorkspace || !workspaceSidebarCollapsed || isScreensaverActive ? (
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
                    `nav-link${isActive ? " nav-link--active nm-inset" : ""}`
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
                className={({ isActive }) => `nav-link${isActive ? " nav-link--active nm-inset" : ""}`}
                title={t("nav.settings")}
                to="/settings"
              >
                <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{t("nav.settings")}</span>
              </NavLink>
            </div>
          </>
        ) : null}
        {isWorkspace && !isScreensaverActive && (
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
      <MusicMiniPlayer hidden={isScreensaverActive} />
      <ScreensaverOverlay />
      <PwaUpdateNotice />
    </div>
  );
}
