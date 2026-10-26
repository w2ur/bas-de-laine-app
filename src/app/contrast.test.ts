import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// WCAG 2.x contrast of the colour tokens in globals.css, computed from the
// oklch values themselves so the test cannot drift from the stylesheet.

type RGB = [number, number, number];

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  return css.slice(start, css.indexOf("\n}", start));
}

function tokens(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block(css, selector).matchAll(/--([\w-]+):\s*(oklch\([^)]*\));/g)) out[m[1]] = m[2];
  return out;
}

function toRgb(oklch: string): RGB {
  const [L, C, h] = oklch.match(/oklch\(([^)]*)\)/)![1].trim().split(/\s+/).map(Number);
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return lin.map((c) => Math.min(1, Math.max(0, enc(c)))) as RGB;
}

const toHex = (c: RGB) => "#" + c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function contrast(x: RGB, y: RGB) {
  const [a, b] = [luminance(x), luminance(y)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const over = (fg: RGB, bg: RGB, alpha: number) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as RGB;

const root = join(process.cwd());
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const schemes = { light: tokens(css, ":root"), dark: tokens(css, ".dark") };
const WHITE: RGB = [1, 1, 1];
const AA = 4.5;

describe.each(["light", "dark"] as const)("%s scheme contrast (WCAG AA 4.5:1)", (scheme) => {
  const t = schemes[scheme];
  const rgb = (name: string) => toRgb(t[name]);

  // Regression: this commit — .text-spend (#c16d45) on the page ground was 3.5:1
  it.each(["background", "card"])("text-spend on %s", (surface) => {
    expect(contrast(rgb("spend"), rgb(surface))).toBeGreaterThanOrEqual(AA);
  });

  it("text on a bg-spend button (white in light, background in dark)", () => {
    const text = scheme === "light" ? WHITE : rgb("background");
    expect(contrast(text, rgb("spend"))).toBeGreaterThanOrEqual(AA);
  });

  it("text-destructive on background and card", () => {
    for (const surface of ["background", "card"]) {
      expect(contrast(rgb("destructive"), rgb(surface))).toBeGreaterThanOrEqual(AA);
    }
  });

  // Regression: this commit — active nav link (bg-primary/10 text-primary) was 3.85:1
  it.each(["sidebar", "background", "card"])("active nav link: primary on primary/10 over %s", (surface) => {
    const bg = over(rgb("primary"), rgb(surface), 0.1);
    expect(contrast(rgb("primary"), bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(["background", "card"])("text-primary on %s", (surface) => {
    expect(contrast(rgb("primary"), rgb(surface))).toBeGreaterThanOrEqual(AA);
  });
});

describe("DESIGN.md colour table", () => {
  const design = readFileSync(join(root, "DESIGN.md"), "utf8");
  it.each([
    ["primary", /`--primary` \/ `--success`[^\n]*\|\s*`(#\w+)`\s*\|\s*`(#\w+)`/],
    ["spend", /`--spend` \/ `--destructive`[^\n]*\|\s*`(#\w+)`\s*\|\s*`(#\w+)`/],
  ])("lists the real %s hex for both schemes", (token, row) => {
    const m = design.match(row)!;
    expect(m).not.toBeNull();
    expect(m[1]).toBe(toHex(toRgb(schemes.light[token])));
    expect(m[2]).toBe(toHex(toRgb(schemes.dark[token])));
  });
});
