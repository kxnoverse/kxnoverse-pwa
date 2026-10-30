import { create } from "zustand";
import { persist } from "zustand/middleware";

export const defaultAppearance = {
  accent: "#8dbfd0",
  background: "#10161b",
  surface: "#192229",
  mode: "dark" as "dark" | "light",
  textContrast: 1,
  borderIntensity: 0.72,
  cornerRadius: 5,
  backgroundStyle: "chrome" as "solid" | "grid" | "glow" | "chrome" | "custom",
  intensity: 0.26,
  opacity: 0.22,
  gridSpacing: 32,
  highlights: true,
  cursorReactive: false,
  animateBackground: true,
  performanceMode: false,
  animationSpeed: 0.32,
  reflectionStrength: 0.64,
  accentInfluence: 0.28,
  imagePosition: "center",
  imageFit: "cover" as "cover" | "contain",
  imageBlur: 0,
  imageOverlay: 0.52,
  hourFormat: "24" as "12" | "24",
  uiScale: 1,
};

export type Appearance = typeof defaultAppearance;
export type HomeTypography = "default" | "pixel";
export type HomeWidgetId =
  | "tasks"
  | "upcoming"
  | "workspace"
  | "assistant"
  | "docs"
  | "minigames"
  | "calculator"
  | "translate";
export type HomeWidgetSlots = [HomeWidgetId, HomeWidgetId];

export const defaultHomeWidgets: HomeWidgetSlots = ["tasks", "upcoming"];

const homeWidgetIds: HomeWidgetId[] = [
  "tasks",
  "upcoming",
  "workspace",
  "assistant",
  "docs",
  "minigames",
  "calculator",
  "translate",
];

function isHomeWidgetId(value: unknown): value is HomeWidgetId {
  return homeWidgetIds.some((widget) => widget === value);
}

function normalizeHomeWidgets(value: unknown): HomeWidgetSlots {
  const saved = Array.isArray(value) ? value : [];
  const first = isHomeWidgetId(saved[0]) ? saved[0] : defaultHomeWidgets[0];
  const second = isHomeWidgetId(saved[1]) && saved[1] !== first
    ? saved[1]
    : defaultHomeWidgets.find((widget) => widget !== first) ?? "upcoming";
  return [first, second];
}

interface UiState {
  appearance: Appearance;
  homeTypography: HomeTypography;
  homeDemoData: boolean;
  homeWidgets: HomeWidgetSlots;
  setAppearance: <K extends keyof Appearance>(key: K, value: Appearance[K]) => void;
  updateAppearance: (values: Partial<Appearance>) => void;
  setHomeTypography: (value: HomeTypography) => void;
  setHomeDemoData: (value: boolean) => void;
  setHomeWidgets: (value: HomeWidgetSlots) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      appearance: defaultAppearance,
      homeTypography: "pixel",
      homeDemoData: false,
      homeWidgets: defaultHomeWidgets,
      setAppearance: (key, value) =>
        set((state) => ({ appearance: { ...state.appearance, [key]: value } })),
      updateAppearance: (values) =>
        set((state) => ({ appearance: { ...state.appearance, ...values } })),
      setHomeTypography: (value) => set({ homeTypography: value }),
      setHomeDemoData: (value) => set({ homeDemoData: value }),
      setHomeWidgets: (value) => set({ homeWidgets: normalizeHomeWidgets(value) }),
    }),
    {
      name: "kxnodesk-ui",
      version: 6,
      migrate: (persisted, version) => {
        const old = persisted as Partial<UiState> & { accent?: string };
        const previousAccent =
          version < 2
            ? ({ steel: "#89a9c4", sage: "#91b3a3", amber: "#c6a777", lilac: "#a99cc8" }[
                old.accent ?? ""
              ] ?? old.accent)
            : undefined;
        return {
          appearance: {
            ...defaultAppearance,
            ...old.appearance,
            ...(previousAccent ? { accent: previousAccent } : {}),
          },
          homeTypography:
            version < 5
              ? "pixel"
              : old.homeTypography === "default"
                ? "default"
                : "pixel",
          homeDemoData: old.homeDemoData === true,
          homeWidgets:
            version < 6
              ? defaultHomeWidgets
              : normalizeHomeWidgets(old.homeWidgets),
        };
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<UiState> | undefined;
        return {
          ...current,
          ...saved,
          appearance: { ...defaultAppearance, ...saved?.appearance },
          homeTypography:
            saved?.homeTypography === "default" ? "default" : "pixel",
          homeDemoData: saved?.homeDemoData === true,
          homeWidgets: normalizeHomeWidgets(saved?.homeWidgets),
        };
      },
    },
  ),
);
