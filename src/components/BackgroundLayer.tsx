import { useEffect, useRef, useState } from "react";

interface BackgroundLayerProps {
  style: "solid" | "grid" | "glow" | "chrome" | "custom";
  accent: string;
  intensity: number;
  opacity: number;
  spacing: number;
  highlights: boolean;
  animate: boolean;
  performanceMode: boolean;
  image?: string;
  imagePosition: string;
  imageFit: "cover" | "contain";
  imageBlur: number;
  imageOverlay: number;
  animationSpeed?: number;
  reflectionStrength?: number;
  accentInfluence?: number;
  cursorReactive?: boolean;
}

const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentShader = `
#extension GL_OES_standard_derivatives : enable
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_reflection;
uniform float u_accentInfluence;
uniform vec3 u_accent;

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec3 permute(vec3 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}
float snoise(vec2 v) {
  const vec4 C = vec4(0.2113248654, 0.3660254038, -0.5773502692, 0.0243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m *= m;
  m *= m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
  float value = 0.0;
  value += 0.58 * snoise(p);
  p = mat2(1.62, -1.18, 1.18, 1.62) * p;
  value += 0.29 * snoise(p);
  p = mat2(1.62, -1.18, 1.18, 1.62) * p;
  value += 0.13 * snoise(p);
  return value;
}
void main() {
  vec2 p = (v_uv - 0.5) * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  float t = u_time;
  vec2 drift = vec2(t * 0.12, -t * 0.085);
  float warpX = snoise(p * 1.05 + drift);
  vec2 rotated = vec2(p.y * -0.22 - p.x, p.x * -0.22 + p.y);
  float warpY = snoise(rotated * 1.05 - drift * 1.3 + vec2(17.4, -8.3));
  vec2 fluid = p + vec2(warpX, warpY) * 0.52;
  float field = fbm(fluid * 2.15 + drift);
  float contour = exp(-abs(field) * 8.5);
  float energy = pow(max(1.0 - abs(field), 0.0), 11.0);
  float metallic = smoothstep(-0.46, 0.48, field);
  vec3 normal = normalize(vec3(-dFdx(field) * 2.8, -dFdy(field) * 2.8, 1.0));
  vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
  vec3 keyLight = normalize(vec3(-0.52, 0.62, 0.86));
  vec3 fillLight = normalize(vec3(0.7, -0.35, 0.74));
  float specular = pow(max(dot(reflect(-keyLight, normal), viewDir), 0.0), 24.0);
  float fill = pow(max(dot(reflect(-fillLight, normal), viewDir), 0.0), 12.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  float highlight = clamp((contour * 0.28 + specular * 0.54 + fill * 0.2 + fresnel * 0.12) * u_reflection, 0.0, 1.0);
  vec3 silver = mix(vec3(0.055, 0.068, 0.082), vec3(0.68, 0.73, 0.78), clamp(metallic * 0.38 + highlight * 0.82, 0.0, 1.0));
  vec3 color = mix(silver, u_accent, u_accentInfluence * (0.1 + energy * 0.12));
  color += vec3(0.035, 0.045, 0.055) * energy;
  float alpha = u_intensity * (0.035 + highlight * 0.42 + energy * 0.08);
  gl_FragColor = vec4(color, alpha);
}`;

function makeShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "WebGL shader compilation failed.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return [0.65, 0.55, 0.83];
  return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

export function BackgroundLayer({
  style,
  accent,
  intensity,
  opacity,
  spacing,
  highlights,
  animate,
  performanceMode,
  image,
  imagePosition,
  imageFit,
  imageBlur,
  imageOverlay,
  animationSpeed = 0.32,
  reflectionStrength = 0.64,
  accentInfluence = 0.28,
  cursorReactive = false,
}: BackgroundLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [canvasSupported, setCanvasSupported] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  const drawEnabled = animate && !performanceMode && !reducedMotion && animationSpeed > 0;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    return () => media.removeEventListener("change", updateMotion);
  }, []);

  useEffect(() => {
    if (style !== "chrome") return;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: true, antialias: false, powerPreference: performanceMode ? "low-power" : "default" });
    if (!canvas || !gl) {
      setCanvasSupported(false);
      return;
    }
    if (!gl.getExtension("OES_standard_derivatives")) {
      setCanvasSupported(false);
      return;
    }

    let program: WebGLProgram | undefined;
    let frame = 0;
    let nextFrame = 0;
    let visible = !document.hidden;
    let disposed = false;
    try {
      const vertex = makeShader(gl, gl.VERTEX_SHADER, vertexShader);
      const fragment = makeShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("Unable to create WebGL program.");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "WebGL program linking failed.");

      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Unable to create WebGL buffer.");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const resolution = gl.getUniformLocation(program, "u_resolution");
      const time = gl.getUniformLocation(program, "u_time");
      const strength = gl.getUniformLocation(program, "u_intensity");
      const reflection = gl.getUniformLocation(program, "u_reflection");
      const accentMix = gl.getUniformLocation(program, "u_accentInfluence");
      const accentColor = gl.getUniformLocation(program, "u_accent");
      const rgb = hexToRgb(accent);
      gl.uniform1f(strength, intensity);
      gl.uniform1f(reflection, reflectionStrength);
      gl.uniform1f(accentMix, accentInfluence);
      gl.uniform3f(accentColor, rgb[0], rgb[1], rgb[2]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      setCanvasSupported(true);

      const render = (now: number) => {
        if (disposed || !visible) return;
        const interval = drawEnabled ? 1000 / 60 : Number.POSITIVE_INFINITY;
        if (!nextFrame || now >= nextFrame) {
          const scale = Math.min(window.devicePixelRatio || 1, performanceMode ? 0.8 : 1.25);
          const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
          const height = Math.max(1, Math.floor(canvas.clientHeight * scale));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
          }
          gl.uniform2f(resolution, width, height);
          gl.uniform1f(time, drawEnabled ? now * animationSpeed * 0.001 : 0);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          nextFrame = drawEnabled ? (nextFrame ? nextFrame + interval : now + interval) : Number.POSITIVE_INFINITY;
        }
        if (drawEnabled) frame = window.requestAnimationFrame(render);
      };
      const onVisibility = () => {
        visible = !document.hidden;
        nextFrame = 0;
        if (visible && !frame) frame = window.requestAnimationFrame(render);
        if (!visible) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      };
      const resize = new ResizeObserver(() => {
        if (visible && !drawEnabled) {
          nextFrame = 0;
          frame = window.requestAnimationFrame(render);
        }
      });
      resize.observe(canvas);
      document.addEventListener("visibilitychange", onVisibility);
      frame = window.requestAnimationFrame(render);
      return () => {
        disposed = true;
        window.cancelAnimationFrame(frame);
        resize.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        if (program) gl.deleteProgram(program);
      };
    } catch (error) {
      console.warn("Liquid Chrome renderer unavailable; using the static fallback.", error);
      if (program) gl.deleteProgram(program);
      setCanvasSupported(false);
    }
  }, [accent, accentInfluence, animationSpeed, drawEnabled, intensity, performanceMode, reflectionStrength, style]);

  useEffect(() => {
    if (!cursorReactive || performanceMode || reducedMotion || style === "solid" || style === "custom") return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    let frame = 0;
    let visible = !document.hidden;
    let x = -1000;
    let y = -1000;
    let initialized = false;
    let targetX = x;
    let targetY = y;
    const move = (event: PointerEvent) => {
      if (!visible) return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (!initialized) {
        x = targetX;
        y = targetY;
        initialized = true;
      }
      if (!frame) frame = requestAnimationFrame(track);
    };
    const track = () => {
      x += (targetX - x) * 0.27;
      y += (targetY - y) * 0.27;
      cursor.style.transform = `translate3d(${x - 220}px, ${y - 220}px, 0)`;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.7) frame = requestAnimationFrame(track);
      else frame = 0;
    };
    const onVisibility = () => {
      visible = !document.hidden;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(frame);
    };
  }, [cursorReactive, performanceMode, reducedMotion, style]);

  const backgroundStyle = {
    "--background-opacity": opacity,
    "--background-intensity": intensity,
    "--grid-size": `${spacing}px`,
    "--background-accent": accent,
    "--image-blur": `${imageBlur}px`,
    "--image-position": imagePosition,
    "--image-fit": imageFit,
    "--image-overlay": imageOverlay,
  } as React.CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={`background-layer background-layer--${style}${highlights ? " background-layer--highlights" : ""}`}
      style={backgroundStyle}
    >
      {style === "chrome" && canvasSupported
        ? <canvas ref={canvasRef} className="background-layer__canvas" />
        : style === "chrome"
          ? <div className="background-layer__chrome-fallback" />
          : null}
      {cursorReactive && !performanceMode && !reducedMotion && <div className="background-layer__cursor-light" ref={cursorRef} />}
      {style === "custom" && image && <div className="background-layer__image" style={{ backgroundImage: `url("${image}")` }} />}
      {style === "custom" && <div className="background-layer__overlay" />}
    </div>
  );
}
