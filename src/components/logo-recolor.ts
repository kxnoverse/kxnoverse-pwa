interface HslColor {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (delta > 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, l };
}

function hslToRgb({ h, s, l }: HslColor): [number, number, number] {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let rgb: [number, number, number];

  if (section < 1) rgb = [chroma, x, 0];
  else if (section < 2) rgb = [x, chroma, 0];
  else if (section < 3) rgb = [0, chroma, x];
  else if (section < 4) rgb = [0, x, chroma];
  else if (section < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  const lightnessOffset = l - chroma / 2;
  return rgb.map((channel) => channel + lightnessOffset) as [number, number, number];
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function parseAccent(accent: string): HslColor {
  const match = /^#([0-9a-f]{6})$/i.exec(accent);
  if (!match) throw new Error(`Invalid logo accent color: ${accent}`);
  const value = match[1];
  return rgbToHsl(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

export function recolorLogoPixels(pixels: Uint8ClampedArray, accent: string): void {
  if (pixels.length % 4 !== 0) throw new Error("Logo pixel data must contain RGBA channels.");
  const target = parseAccent(accent);

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;

    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const source = rgbToHsl(r, g, b);
    if (source.s < 0.12) continue;

    const originalLuminance = luminance(r, g, b);
    const saturation = target.s * Math.min(source.s / 0.38, 1);
    let low = 0;
    let high = 1;
    let mapped: [number, number, number] = [source.l, source.l, source.l];

    for (let step = 0; step < 12; step += 1) {
      const lightness = (low + high) / 2;
      mapped = hslToRgb({ h: target.h, s: saturation, l: lightness });
      const mappedLuminance = luminance(...mapped);
      if (mappedLuminance < originalLuminance) low = lightness;
      else high = lightness;
    }

    pixels[i] = Math.round(mapped[0] * 255);
    pixels[i + 1] = Math.round(mapped[1] * 255);
    pixels[i + 2] = Math.round(mapped[2] * 255);
  }
}
