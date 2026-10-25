import { useLayoutEffect, useRef } from "react";
import { useUiStore } from "../stores/ui-store";
import { recolorLogoPixels } from "./logo-recolor";

let sourceLogo: { width: number; height: number; pixels: Uint8ClampedArray } | undefined;
let colorizedLogo: { accent: string; pixels: Uint8ClampedArray } | undefined;

function drawLogo(canvas: HTMLCanvasElement | null, image: HTMLImageElement | null, accent: string) {
  if (!canvas || !image?.complete || !image.naturalWidth) return;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    console.error("Unable to create a canvas context for the Kxno Desk logo.");
    return;
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  if (!sourceLogo || sourceLogo.width !== width || sourceLogo.height !== height) {
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    sourceLogo = { width, height, pixels: context.getImageData(0, 0, width, height).data.slice() };
    colorizedLogo = undefined;
  }

  if (!colorizedLogo || colorizedLogo.accent !== accent) {
    const pixels = sourceLogo.pixels.slice();
    recolorLogoPixels(pixels, accent);
    colorizedLogo = { accent, pixels };
  }

  const pixels = context.createImageData(width, height);
  pixels.data.set(colorizedLogo.pixels);
  context.putImageData(pixels, 0, 0);
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const accent = useUiStore((state) => state.appearance.accent);
  const accentRef = useRef(accent);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  accentRef.current = accent;

  useLayoutEffect(() => {
    drawLogo(canvasRef.current, imageRef.current, accent);
  }, [accent]);

  return (
    <div className={`brand${compact ? " brand--compact" : ""}`} aria-label="Kxno Desk">
      <canvas className="brand__mark" ref={canvasRef} aria-hidden="true" />
      <img
        ref={imageRef}
        className="brand__source"
        src={`${import.meta.env.BASE_URL}kxnodesk-logo.png`}
        alt=""
        onLoad={() => drawLogo(canvasRef.current, imageRef.current, accentRef.current)}
      />
      {!compact && (
        <span className="brand__wordmark">
          <span className="brand__wordmark-primary">KXNO</span>
          <span className="brand__wordmark-secondary">DESK</span>
        </span>
      )}
    </div>
  );
}
