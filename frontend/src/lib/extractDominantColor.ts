/**
 * Extract a card-friendly dominant color from an image (File or data URL).
 * Skips near-white / near-black pixels and prefers saturated mid-tones
 * so the result works as a menu card accent.
 */

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

/** Deepen slightly so pale food photos still make a rich card accent. */
function deepenForCard(r: number, g: number, b: number): { r: number; g: number; b: number } {
  const factor = 0.72;
  return {
    r: r * factor,
    g: g * factor,
    b: b * factor,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for color extraction"));
    img.src = src;
  });
}

export type ExtractedColorResult = {
  hex: string;
  /** Top alternate accents (up to 4) for quick picks */
  alternatives: string[];
};

/**
 * Quantize image colors and pick the most “product-like” accent.
 */
export async function extractDominantColorFromImage(
  source: File | string
): Promise<ExtractedColorResult> {
  const dataUrl =
    typeof source === "string"
      ? source
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Failed to read image file"));
          reader.readAsDataURL(source);
        });

  const img = await loadImage(dataUrl);
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");

  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Bucket by 16-step RGB (coarse palette)
  const buckets = new Map<string, { r: number; g: number; b: number; weight: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = luminance(r, g, b);
    const sat = saturation(r, g, b);

    // Skip washed-out backgrounds / pure black
    if (lum > 0.92 || lum < 0.08) continue;
    if (sat < 0.08 && lum > 0.75) continue;

    const qr = Math.round(r / 16) * 16;
    const qg = Math.round(g / 16) * 16;
    const qb = Math.round(b / 16) * 16;
    const key = `${qr},${qg},${qb}`;

    // Prefer colorful mid-tones (food hues)
    const score = 1 + sat * 2.5 + (1 - Math.abs(lum - 0.45)) * 1.2;
    const existing = buckets.get(key);
    if (existing) {
      existing.weight += score;
    } else {
      buckets.set(key, { r: qr, g: qg, b: qb, weight: score });
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.weight - a.weight);
  if (ranked.length === 0) {
    return { hex: "#523122", alternatives: ["#5b2c6f", "#c47a2c", "#2f5d50"] };
  }

  const top = ranked.slice(0, 5).map((c) => {
    const deep = deepenForCard(c.r, c.g, c.b);
    return rgbToHex(deep.r, deep.g, deep.b);
  });

  // Dedupe near-identical hexes
  const unique: string[] = [];
  for (const hex of top) {
    if (!unique.includes(hex)) unique.push(hex);
  }

  return {
    hex: unique[0],
    alternatives: unique.slice(0, 4),
  };
}
