type ResizeOptions = {
  maxW: number;
  maxH: number;
  type?: string;
  quality?: number;
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to process image'));
    }, type, quality);
  });

export const resizeImage = async (file: File, options: ResizeOptions): Promise<Blob> => {
  const { maxW, maxH, type = 'image/webp', quality = 0.9 } = options;
  const image = await loadImage(file);
  const targetRatio = maxW / maxH;
  const srcRatio = image.naturalWidth / image.naturalHeight;

  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;

  if (srcRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else if (srcRatio < targetRatio) {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }

  const canvas = document.createElement('canvas');
  canvas.width = maxW;
  canvas.height = maxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context unavailable');
  }

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, maxW, maxH);
  return toBlob(canvas, type, quality);
};
