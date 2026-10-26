import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundLayer } from "./BackgroundLayer";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (matchMediaDescriptor) Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  else Reflect.deleteProperty(window, "matchMedia");
});

describe("background motion preferences", () => {
  it("does not render cursor lighting when reduced motion is enabled", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const { container } = render(
      <BackgroundLayer
        accent="#a58bd4"
        accentInfluence={0.28}
        animate
        animationSpeed={0.32}
        cursorReactive
        highlights
        imageFit="cover"
        imageOverlay={0.5}
        imagePosition="center"
        imageBlur={0}
        intensity={0.8}
        opacity={0.5}
        performanceMode={false}
        reflectionStrength={0.64}
        spacing={32}
        style="grid"
      />,
    );

    expect(container.querySelector(".background-layer__cursor-light")).toBeNull();
  });
});
