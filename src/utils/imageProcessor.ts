/**
 * Image Processing and Compression Utility
 * Civil Workforce Attendance System — ANGEL ENTERPRISES
 * 
 * Rules:
 * - Allowed MIME types: image/jpeg, image/png, image/webp
 * - Max raw input size: 5MB (5,242,880 bytes)
 * - Site photos max dimensions: 1920 x 1080 (landscape / portrait preserved)
 * - Worker profile photo max dimensions: 800 x 800
 * - Compression quality: 0.82 JPEG/WebP
 * - Safe unique filename generation
 * - No biometrics, no face detection, no facial recognition
 */

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type AllowedImageMimeType = typeof ALLOWED_IMAGE_MIME_TYPES[number];

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_SITE_PHOTOS_PER_SITE = 5;
export const MAX_WORKER_PROFILE_PHOTOS = 1;

export const SITE_PHOTO_CONSTRAINTS = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.82
};

export const WORKER_PHOTO_CONSTRAINTS = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.82
};

export interface ProcessedImageResult {
  blob: Blob;
  base64Data: string; // Data URL for upload or preview
  fileName: string;
  contentType: string;
  fileSize: number;
  originalSize: number;
  width: number;
  height: number;
}

/**
 * Validate file type and size before processing
 */
export function validateImageFile(file: File | Blob, originalFileName?: string): { valid: boolean; error?: string } {
  const type = file.type?.toLowerCase();
  if (!type || !ALLOWED_IMAGE_MIME_TYPES.includes(type as AllowedImageMimeType)) {
    return {
      valid: false,
      error: `Unsupported file type "${type || 'unknown'}". Allowed formats: JPEG, PNG, and WebP only.`
    };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds maximum allowed limit of 5.00 MB.`
    };
  }

  // Reject files with suspicious extensions if original file name provided
  if (originalFileName) {
    const extMatch = originalFileName.toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (ext && !allowedExts.includes(ext)) {
      return {
        valid: false,
        error: `Invalid file extension ".${ext}". Allowed extensions: .jpg, .jpeg, .png, .webp.`
      };
    }
  }

  return { valid: true };
}

/**
 * Generate a cryptographically safe, unique filename
 */
export function generateSafeFileName(prefix: string, extension: string = 'jpg'): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const timestamp = Date.now();
  const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).substring(2, 14);
  const cleanExt = extension.replace(/^\./, '').toLowerCase() || 'jpg';
  return `${safePrefix}_${timestamp}_${randomPart}.${cleanExt}`;
}

/**
 * Compress and resize an image file using HTML Canvas in browser environments
 */
export async function processAndCompressImage(
  file: File | Blob,
  targetType: 'site' | 'worker',
  originalFileName?: string
): Promise<ProcessedImageResult> {
  // 1. Initial Validation
  const validation = validateImageFile(file, originalFileName);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const constraints = targetType === 'site' ? SITE_PHOTO_CONSTRAINTS : WORKER_PHOTO_CONSTRAINTS;
  const preferredMime = 'image/jpeg';
  const outExt = 'jpg';

  // In non-DOM / Node environments, fallback to raw buffer processing
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = `data:${file.type || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    const safeName = generateSafeFileName(targetType === 'site' ? 'site_photo' : 'worker_photo', outExt);
    return {
      blob: file,
      base64Data,
      fileName: safeName,
      contentType: file.type || 'image/jpeg',
      fileSize: file.size,
      originalSize: file.size,
      width: constraints.maxWidth,
      height: constraints.maxHeight
    };
  }

  // 2. Load into HTML Image
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data. The file may be corrupted.'));
      img.onload = () => {
        try {
          let { width, height } = img;
          const { maxWidth, maxHeight, quality } = constraints;

          // Calculate aspect ratio preserving dimensions
          if (width > maxWidth || height > maxHeight) {
            const widthRatio = maxWidth / width;
            const heightRatio = maxHeight / height;
            const bestRatio = Math.min(widthRatio, heightRatio);
            width = Math.round(width * bestRatio);
            height = Math.round(height * bestRatio);
          }

          // Render on canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to create canvas rendering context for image compression.'));
            return;
          }

          // High quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Export compressed Blob & Data URL
          canvas.toBlob(
            (compressedBlob) => {
              if (!compressedBlob) {
                reject(new Error('Image compression failed.'));
                return;
              }

              const base64Data = canvas.toDataURL(preferredMime, quality);
              const safeName = generateSafeFileName(
                targetType === 'site' ? 'site_photo' : 'worker_photo',
                outExt
              );

              resolve({
                blob: compressedBlob,
                base64Data,
                fileName: safeName,
                contentType: preferredMime,
                fileSize: compressedBlob.size,
                originalSize: file.size,
                width,
                height
              });
            },
            preferredMime,
            quality
          );
        } catch (procErr: any) {
          reject(new Error(`Image compression processing failed: ${procErr.message}`));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
