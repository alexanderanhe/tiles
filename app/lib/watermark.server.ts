import sharp from "sharp";
import { env } from "./env.server";

function buildWatermarkSvg(width: number, height: number) {
  const text = env.WATERMARK_TEXT;
  const opacity = env.WATERMARK_OPACITY;
  const scale = env.WATERMARK_SCALE;
  const baseFontSize = Math.max(14, Math.floor(width * scale));
  const patternSize = Math.max(180, Math.floor(baseFontSize * 6));

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="tile" patternUnits="userSpaceOnUse" width="${patternSize}" height="${patternSize}" patternTransform="rotate(-30)">
          <text x="0" y="${baseFontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${baseFontSize}" fill="white" fill-opacity="${opacity * 0.25}">${text}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#tile)" />
      <text x="98%" y="98%" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${baseFontSize * 1.15}" fill="white" fill-opacity="${opacity}">${text}</text>
    </svg>
  `;
}

export async function applyWatermark(input: Buffer, targetWidth: number) {
  const base = sharp(input).resize({ width: targetWidth, withoutEnlargement: true });
  const metadata = await base.metadata();
  const width = metadata.width ?? targetWidth;
  const height = metadata.height ?? Math.floor(targetWidth * 0.75);
  const svg = Buffer.from(buildWatermarkSvg(width, height));

  return base
    .composite([{ input: svg, blend: "over" }])
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true });
}

export async function getImageMetadata(input: Buffer) {
  const image = sharp(input);
  const metadata = await image.metadata();
  return metadata;
}
