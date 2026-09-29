import { randomBytes } from 'node:crypto';
import { badRequest } from '../errors';

/**
 * Upload validation. The declared MIME type is never trusted: the file signature (magic bytes)
 * decides the type. Images are decoded and re-encoded with sharp (strips metadata and neutralises
 * polyglot files); videos are limited to MP4/WebM containers.
 */
export type SniffedType =
  'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'video/mp4' | 'video/webm';

export function sniffType(buffer: Buffer): SniffedType | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    return 'video/mp4';
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3)
    return 'video/webm';
  return null;
}

export interface ProcessedMedia {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  duration: number;
  kind: 'image' | 'video';
}

export async function processUpload(
  file: { buffer: Buffer; originalname: string; size: number },
  options: {
    maxImageBytes: number;
    maxVideoBytes: number;
    duration?: number;
    width?: number;
    height?: number;
  },
) {
  const type = sniffType(file.buffer);
  if (!type)
    throw badRequest(
      'Unsupported file type. Upload JPEG, PNG, WebP or AVIF images, or MP4/WebM videos.',
    );
  if (type.startsWith('image/')) {
    if (file.size > options.maxImageBytes)
      throw badRequest(
        `Images must be ${Math.round(options.maxImageBytes / 1024 / 1024)} MB or smaller.`,
      );
    const { default: sharp } = await import('sharp');
    let pipeline;
    try {
      pipeline = sharp(file.buffer, { limitInputPixels: 80_000_000 }).rotate();
      const meta = await pipeline.metadata();
      if (!meta.width || !meta.height) throw new Error('No dimensions');
    } catch {
      throw badRequest('This image could not be read. Please export it again and retry.');
    }
    const output = await pipeline
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: output.data,
      mimeType: 'image/webp',
      extension: 'webp',
      width: output.info.width,
      height: output.info.height,
      duration: 0,
      kind: 'image',
    } satisfies ProcessedMedia;
  }
  if (file.size > options.maxVideoBytes)
    throw badRequest(
      `Videos must be ${Math.round(options.maxVideoBytes / 1024 / 1024)} MB or smaller.`,
    );
  const duration = Number(options.duration ?? 0);
  if (!Number.isFinite(duration) || duration < 0 || duration > 600)
    throw badRequest('Video duration must be between 0 and 600 seconds.');
  return {
    buffer: file.buffer,
    mimeType: type,
    extension: type === 'video/webm' ? 'webm' : 'mp4',
    width: Math.max(0, Math.round(options.width ?? 0)),
    height: Math.max(0, Math.round(options.height ?? 0)),
    duration: Math.round(duration * 10) / 10,
    kind: 'video',
  } satisfies ProcessedMedia;
}

export function mediaKey(originalName: string, extension: string) {
  const base = originalName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'media'}-${randomBytes(5).toString('hex')}.${extension}`;
}
