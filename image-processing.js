export const IMAGE_PROCESSING = Object.freeze({
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.82,
  maxSourceBytes: 50 * 1024 * 1024,
  maxOutputBytes: 12 * 1024 * 1024,
});

const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function supportedFile(file) {
  if (!(file instanceof File)) throw new Error('image-invalid');
  const extension = String(file.name || '').toLowerCase().split('.').pop();
  const supportedExtension = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
  if (!SUPPORTED_TYPES.has(file.type) && !supportedExtension) throw new Error('image-type-invalid');
  if (!file.size || file.size > IMAGE_PROCESSING.maxSourceBytes) throw new Error('image-source-too-large');
}

function decodeWithImageElement(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image-decode-failed')); };
    image.src = url;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (error) {
      console.warn('createImageBitmap failed; using image element fallback.', error);
    }
  }
  return decodeWithImageElement(file);
}

function squareSize(width, height) {
  const sourceSize = Math.min(width, height);
  const outputSize = Math.min(sourceSize, IMAGE_PROCESSING.maxWidth, IMAGE_PROCESSING.maxHeight);
  return {
    sourceX: (width - sourceSize) / 2,
    sourceY: (height - sourceSize) / 2,
    sourceSize,
    width: Math.max(1, Math.round(outputSize)),
    height: Math.max(1, Math.round(outputSize)),
  };
}

function canvasToWebp(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/webp') reject(new Error('webp-encode-failed'));
      else resolve(blob);
    }, 'image/webp', IMAGE_PROCESSING.quality);
  });
}

export async function prepareMemberImage(file) {
  supportedFile(file);
  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) throw new Error('image-dimensions-invalid');
    const size = squareSize(decoded.width, decoded.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('image-canvas-unavailable');
    context.drawImage(
      decoded.image,
      size.sourceX, size.sourceY, size.sourceSize, size.sourceSize,
      0, 0, size.width, size.height,
    );
    const blob = await canvasToWebp(canvas);
    if (blob.size > IMAGE_PROCESSING.maxOutputBytes) throw new Error('image-output-too-large');
    return { blob, width: size.width, height: size.height, size: blob.size, type: 'image/webp' };
  } finally {
    decoded.close();
  }
}

export function formatImageSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
