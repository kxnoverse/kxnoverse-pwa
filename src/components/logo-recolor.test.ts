import { describe, expect, it } from "vitest";
import { builtInThemes } from "../data/theme-presets";
import { recolorLogoPixels } from "./logo-recolor";

function hueOf(r: number, g: number, b: number): number {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return 0;
  const hue = max === red
    ? ((green - blue) / delta) % 6
    : max === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return ((hue * 60) + 360) % 360;
}

function saturationOf(r: number, g: number, b: number): number {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

describe("recolorLogoPixels", () => {
  it.each(builtInThemes.filter((theme) => theme.id !== "custom"))(
    "maps chromatic logo pixels to the $name accent while preserving luminance and alpha",
    (theme) => {
      const source = new Uint8ClampedArray([190, 105, 226, 201, 128, 128, 128, 111, 225, 55, 150, 0]);
      const originalLuminance = relativeLuminance(source[0], source[1], source[2]);
      const targetRgb: [number, number, number] = [
        parseInt(theme.appearance.accent!.slice(1, 3), 16),
        parseInt(theme.appearance.accent!.slice(3, 5), 16),
        parseInt(theme.appearance.accent!.slice(5, 7), 16),
      ];

      recolorLogoPixels(source, theme.appearance.accent!);

      if (saturationOf(...targetRgb) > 0.1) {
        const hueDifference = Math.abs(hueOf(source[0], source[1], source[2]) - hueOf(...targetRgb));
        expect(Math.min(hueDifference, 360 - hueDifference)).toBeLessThan(2);
      } else {
        expect(saturationOf(source[0], source[1], source[2])).toBeLessThan(0.1);
      }
      expect(relativeLuminance(source[0], source[1], source[2])).toBeCloseTo(originalLuminance, 2);
      expect(source[3]).toBe(201);
      expect(Array.from(source.slice(4, 8))).toEqual([128, 128, 128, 111]);
      expect(Array.from(source.slice(8, 12))).toEqual([225, 55, 150, 0]);
    },
  );

  it("uses custom HEX accents and preserves partial transparency", () => {
    const pixels = new Uint8ClampedArray([190, 105, 226, 87]);
    recolorLogoPixels(pixels, "#00a6d6");

    expect(hueOf(pixels[0], pixels[1], pixels[2])).toBeCloseTo(hueOf(0, 166, 214), 0);
    expect(pixels[3]).toBe(87);
  });

  it("rejects invalid accent values rather than silently displaying a mismatched color", () => {
    expect(() => recolorLogoPixels(new Uint8ClampedArray([10, 20, 30, 255]), "cyan")).toThrow(/Invalid logo accent color/);
  });
});
