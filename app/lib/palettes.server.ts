import crypto from "node:crypto";
import { getRedis } from "./redis.server";

export interface PaletteSuggestion {
  backgroundColor: string;
  crayonColors: string[];
  name?: string;
  meta?: Record<string, unknown>;
}

export function isHexColor(value: string) {
  return /^#([0-9a-fA-F]{6})$/.test(value);
}

export function normalizeHex(value: string) {
  const hex = value.trim().toLowerCase();
  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    return (
      "#" +
      hex[1] +
      hex[1] +
      hex[2] +
      hex[2] +
      hex[3] +
      hex[3]
    ).toUpperCase();
  }
  return hex.toUpperCase();
}

export function dedupeColors(colors: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const color of colors) {
    const hex = normalizeHex(color);
    if (!isHexColor(hex) || seen.has(hex)) continue;
    seen.add(hex);
    result.push(hex);
  }
  return result;
}

export function clampPalette(
  palette: PaletteSuggestion,
  minColors = 3,
  maxColors = 5
) {
  const background = normalizeHex(palette.backgroundColor);
  const colors = dedupeColors(palette.crayonColors).slice(0, maxColors);
  if (colors.length < minColors) return null;
  return {
    backgroundColor: background,
    crayonColors: colors,
    name: palette.name,
    meta: palette.meta,
  } satisfies PaletteSuggestion;
}

export function seedToHex(seed: string) {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  return `#${hash.slice(0, 6).toUpperCase()}`;
}

function lighten(hex: string, amount = 0.65) {
  const normalized = normalizeHex(hex).replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return (
    "#" +
    mix(r).toString(16).padStart(2, "0") +
    mix(g).toString(16).padStart(2, "0") +
    mix(b).toString(16).padStart(2, "0")
  ).toUpperCase();
}

async function theColorApiScheme(seedHex: string, mode = "analogic", count = 5) {
  const hex = seedHex.replace("#", "");
  const url = new URL("https://www.thecolorapi.com/scheme");
  url.searchParams.set("hex", hex);
  url.searchParams.set("mode", mode);
  url.searchParams.set("count", String(count));
  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const data = (await response.json()) as {
    colors?: Array<{ hex?: { value?: string } }>;
  };
  const colors = (data.colors ?? [])
    .map((item) => item.hex?.value ?? "")
    .filter(Boolean);
  if (!colors.length) return null;
  return colors;
}

async function colormindPalette() {
  const response = await fetch("http://colormind.io/api/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "default" }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { result?: number[][] };
  const colors = (data.result ?? []).map(
    (rgb) =>
      "#" +
      rgb
        .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"))
        .join("")
  );
  return colors.length ? colors : null;
}

const FALLBACK_PALETTES: PaletteSuggestion[] = [
  {
    backgroundColor: "#FFF7E6",
    crayonColors: ["#FF6B6B", "#FFD93D", "#6BCB77"],
    name: "Pastel",
  },
  {
    backgroundColor: "#F5F1FF",
    crayonColors: ["#7C83FD", "#96BAFF", "#7DEDFF"],
    name: "Cool",
  },
  {
    backgroundColor: "#FFF2F2",
    crayonColors: ["#FFB5E8", "#FF9CEE", "#A79AFF"],
    name: "Candy",
  },
];

export async function suggestPalettes({
  templateId,
  engine,
  strategy,
  seed,
  limits,
  cacheTtlSeconds,
}: {
  templateId: string;
  engine: string;
  strategy?: { id: string; mode?: string; count?: number; backgroundPolicy?: string };
  seed: string;
  limits: { palettes: number; minColors: number; maxColors: number };
  cacheTtlSeconds?: number;
}) {
  const redis = getRedis();
  const cacheKey = `palettes:${templateId}:${engine}:${strategy?.id ?? "default"}:${seed}`;
  if (redis && cacheTtlSeconds) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return {
        palettes: JSON.parse(cached) as PaletteSuggestion[],
        cache: { hit: true, ttlSeconds: cacheTtlSeconds },
      };
    }
  }

  const palettes: PaletteSuggestion[] = [];
  const mode = strategy?.mode ?? "analogic";
  const count = strategy?.count ?? 5;
  const backgroundPolicy = strategy?.backgroundPolicy ?? "pastel";
  const seedHex = isHexColor(seed) ? seed : seedToHex(seed);

  let colors: string[] | null = null;
  if (engine === "thecolorapi") {
    colors = await theColorApiScheme(seedHex, mode, count);
  } else if (engine === "colormind") {
    colors = await colormindPalette();
  }

  if (colors?.length) {
    const base = dedupeColors(colors);
    const backgroundColor =
      backgroundPolicy === "pastel" || backgroundPolicy === "light"
        ? lighten(base[0] ?? seedHex, backgroundPolicy === "pastel" ? 0.7 : 0.5)
        : base[0] ?? seedHex;
    const palette = clampPalette(
      {
        backgroundColor,
        crayonColors: base,
        meta: { engine, strategy: strategy?.id },
      },
      limits.minColors,
      limits.maxColors
    );
    if (palette) palettes.push(palette);
  }

  if (!palettes.length) {
    for (const fallback of FALLBACK_PALETTES) {
      const palette = clampPalette(fallback, limits.minColors, limits.maxColors);
      if (palette) palettes.push(palette);
      if (palettes.length >= limits.palettes) break;
    }
  }

  const result = palettes.slice(0, limits.palettes);
  if (redis && cacheTtlSeconds) {
    await redis.set(cacheKey, JSON.stringify(result), "EX", cacheTtlSeconds);
  }
  return { palettes: result, cache: { hit: false, ttlSeconds: cacheTtlSeconds } };
}
