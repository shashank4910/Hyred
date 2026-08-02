/**
 * Extract a profile photo from an uploaded resume (PDF or image)
 * and prepare a circular PNG for preview + PDF.
 */

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (args: { data: Uint8Array }) => { promise: Promise<PdfDoc> };
  OPS: { paintImageXObject: number; paintInlineImageXObject: number };
};

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};

type PdfPage = {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  objs: { get: (name: string) => Promise<any> };
};

let pdfJsPromise: Promise<PdfJsLib> | null = null;

function loadPdfJsFromCdn(): Promise<PdfJsLib> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PDF photo extract is browser-only'));
  }
  const w = window as unknown as { pdfjsLib?: PdfJsLib };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (pdfJsPromise) return pdfJsPromise;
  pdfJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib;
      if (!lib) {
        reject(new Error('pdf.js failed to load'));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(lib);
    };
    script.onerror = () => reject(new Error('pdf.js script error'));
    document.head.appendChild(script);
  });
  return pdfJsPromise;
}

/** Largest embedded image from a PDF data URL (browser). */
export async function extractPhotoFromPdfDataUrl(pdfDataUrl: string): Promise<string | null> {
  try {
    const pdfjs = await loadPdfJsFromCdn();
    const bytes = dataUrlToUint8Array(pdfDataUrl);
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    let best: { data: Uint8Array; w: number; h: number } | null = null;

    for (let p = 1; p <= Math.min(pdf.numPages, 2); p++) {
      const page = await pdf.getPage(p);
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]!;
        if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintInlineImageXObject) {
          continue;
        }
        const name = ops.argsArray[i]?.[0];
        if (typeof name !== 'string') continue;
        try {
          const img = await page.objs.get(name);
          if (!img?.width || !img?.height || !img?.data) continue;
          const area = img.width * img.height;
          if (area < 80 * 80) continue;
          if (!best || area > best.w * best.h) {
            best = { data: img.data, w: img.width, h: img.height };
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (!best) return null;
    return rgbaImageToJpegDataUrl(best.data, best.w, best.h);
  } catch (e) {
    console.warn('[resume-photo] PDF extract failed', e);
    return null;
  }
}

export async function extractResumePhoto(args: {
  dataUrl: string;
  kind: 'pdf' | 'image';
}): Promise<string | null> {
  if (!args.dataUrl) return null;
  if (args.kind === 'image') return args.dataUrl;
  return extractPhotoFromPdfDataUrl(args.dataUrl);
}

/** Crop to a circle PNG for clean PDF/preview avatars. */
export async function toCircularPhotoDataUrl(
  photoDataUrl: string,
  size = 256,
): Promise<string | null> {
  if (typeof document === 'undefined') return photoDataUrl;
  try {
    const img = await loadImage(photoDataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return photoDataUrl;
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[resume-photo] circular crop failed', e);
    return photoDataUrl;
  }
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function rgbaImageToJpegDataUrl(
  data: Uint8Array,
  width: number,
  height: number,
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.createImageData(width, height);
  if (data.length >= width * height * 4) {
    imgData.data.set(data.subarray(0, width * height * 4));
  } else if (data.length >= width * height * 3) {
    let di = 0;
    for (let i = 0; i < width * height; i++) {
      imgData.data[di++] = data[i * 3]!;
      imgData.data[di++] = data[i * 3 + 1]!;
      imgData.data[di++] = data[i * 3 + 2]!;
      imgData.data[di++] = 255;
    }
  } else {
    return null;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}
