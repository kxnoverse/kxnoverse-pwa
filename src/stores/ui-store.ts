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

interface UiState {
  appearance: Appearance;
  setAppearance: <K extends keyof Appearance>(key: K, value: Appearance[K]) => void;
  updateAppearance: (values: Partial<Appearance>) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      appearance: defaultAppearance,
      setAppearance: (key, value) =>
        set((state) => ({ appearance: { ...state.appearance, [key]: value } })),
      updateAppearance: (values) =>
        set((state) => ({ appearance: { ...state.appearance, ...values } })),
    }),
    {
      name: "kxnodesk-ui",
      version: 3,
      migrate: (persisted, version) => {
        const old = persisted as { accent?: string; appearance?: Partial<Appearance> };
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
        };
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<UiState> | undefined;
        return {
          ...current,
          ...saved,
          appearance: { ...defaultAppearance, ...saved?.appearance },
        };
      },
    },
  ),
);
