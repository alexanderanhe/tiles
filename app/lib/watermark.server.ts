import sharp from "sharp";
import { env } from "./env.server";

function buildWatermarkSvg(width: number, height: number) {
  const text = env.WATERMARK_TEXT?.trim() || "Login to download";
  const opacity = Math.min(0.6, Math.max(0.08, env.WATERMARK_OPACITY));
  const scale = env.WATERMARK_SCALE;
  const baseFontSize = Math.max(14, Math.floor(width * scale));
  const patternSize = Math.max(180, Math.floor(baseFontSize * 6));
  const lineHeight = Math.max(28, Math.floor(baseFontSize * 2.2));

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="tile" patternUnits="userSpaceOnUse" width="${patternSize}" height="${patternSize}" patternTransform="rotate(-30)">
          <text x="0" y="${baseFontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${baseFontSize}" fill="white" fill-opacity="${opacity * 0.25}">${text}</text>
          <text x="${Math.floor(patternSize / 2)}" y="${baseFontSize}" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${baseFontSize}" fill="white" fill-opacity="${opacity * 0.25}">${text}</text>
          <text x="0" y="${baseFontSize + lineHeight}" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${baseFontSize}" fill="white" fill-opacity="${opacity * 0.25}">${text}</text>
          <text x="${Math.floor(patternSize / 2)}" y="${baseFontSize + lineHeight}" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${baseFontSize}" fill="white" fill-opacity="${opacity * 0.25}">${text}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#tile)" />
      <text x="98%" y="98%" text-anchor="end" font-family="'Helvetica Neue', Arial, sans-serif" font-size="${baseFontSize * 1.15}" fill="white" fill-opacity="${opacity}">${text}</text>
    </svg>
  `;
}

export async function applyWatermark(input: Buffer, targetWidth: number) {
  const resized = await sharp(input)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const width = resized.info.width ?? targetWidth;
  const height = resized.info.height ?? Math.floor(targetWidth * 0.75);
  const svg = Buffer.from(buildWatermarkSvg(width, height));

  return sharp(resized.data)
    .composite([{ input: svg, blend: "over" }])
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true });
}

export async function getImageMetadata(input: Buffer) {
  const image = sharp(input);
  const metadata = await image.metadata();
  return metadata;
}
