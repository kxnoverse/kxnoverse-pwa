import type { Appearance } from "../stores/ui-store";

export interface ThemePreset {
  id: string;
  name: string;
  appearance: Partial<Appearance>;
  builtIn?: boolean;
}

export const defaultThemePresets: ThemePreset[] = [
  { id: "obsidian", name: "Obsidian", builtIn: true, appearance: { mode: "dark", background: "#101316", surface: "#191e23", accent: "#9bb9d0", backgroundStyle: "solid", intensity: 0.45, opacity: 0.28 } },
  { id: "amethyst", name: "Amethyst", builtIn: true, appearance: { mode: "dark", background: "#111014", surface: "#1b1920", accent: "#a58bd4", backgroundStyle: "glow", intensity: 0.34, opacity: 0.26 } },
  { id: "arctic", name: "Arctic", builtIn: true, appearance: { mode: "dark", background: "#10161b", surface: "#192229", accent: "#8dbfd0", backgroundStyle: "glow", intensity: 0.26, opacity: 0.22 } },
  { id: "graphite", name: "Graphite", builtIn: true, appearance: { mode: "dark", background: "#111214", surface: "#191a1d", accent: "#a5a9ad", backgroundStyle: "solid", borderIntensity: 0.35, intensity: 0.2, opacity: 0 } },
  { id: "pearl", name: "Pearl", builtIn: true, appearance: { mode: "light", background: "#f2f1ee", surface: "#fbfaf8", accent: "#718da8", backgroundStyle: "solid", borderIntensity: 0.65, intensity: 0.2, opacity: 0 } },
  { id: "custom", name: "Custom", builtIn: true, appearance: {} },
];

export const builtInThemes = defaultThemePresets.map((preset) => ({
  ...preset,
  appearance: { ...preset.appearance },
}));
