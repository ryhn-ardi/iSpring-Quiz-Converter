import JSZip from 'jszip';
import { RichImage, sanitizeImageDataUrl } from './richText';
import { RichQuestion } from './quizParser';
import { triggerDownload } from './tableImage';

export function getImageExtensionFromMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower === 'image/jpeg' || lower === 'image/jpg') return 'jpg';
  if (lower === 'image/gif') return 'gif';
  if (lower === 'image/webp') return 'webp';
  if (lower === 'image/bmp') return 'bmp';
  return 'png';
}

export function getWordImageFilename(
  questionIndex: number,
  images: RichImage[]
): string {
  if (images.length === 1) {
    const ext = getImageExtensionFromMime(images[0].mimeType);
    return `gambar_soal_${questionIndex + 1}.${ext}`;
  }
  return `gambar_soal_${questionIndex + 1}.png`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const safe = sanitizeImageDataUrl(dataUrl);
  if (!safe) {
    throw new Error('Format gambar tidak valid atau tidak didukung.');
  }
  const commaIdx = safe.dataUrl.indexOf(',');
  const base64 = safe.dataUrl.slice(commaIdx + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: safe.mimeType });
}

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const safe = sanitizeImageDataUrl(dataUrl);
    if (!safe) {
      reject(new Error('Data gambar tidak valid.'));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar dari dokumen Word.'));
    img.src = safe.dataUrl;
  });
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal memuat gambar untuk digabungkan.'));
    };
    img.src = url;
  });
}

export async function stackImageBlobsToPngBlob(
  blobs: Blob[],
  gap = 14,
  padding = 12
): Promise<Blob> {
  if (blobs.length === 0) {
    throw new Error('Tidak ada gambar untuk digabungkan.');
  }
  const loaded = await Promise.all(blobs.map((b) => loadImageFromBlob(b)));
  const maxW = Math.max(...loaded.map((im) => im.naturalWidth || im.width || 100), 100);
  const totalH =
    loaded.reduce((sum, im) => sum + (im.naturalHeight || im.height || 100), 0) +
    gap * Math.max(0, loaded.length - 1);

  const canvas = document.createElement('canvas');
  canvas.width = maxW + padding * 2;
  canvas.height = totalH + padding * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return blobs[0];
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = padding;
  for (const im of loaded) {
    const w = im.naturalWidth || im.width;
    const h = im.naturalHeight || im.height;
    const x = padding + Math.round((maxW - w) / 2);
    ctx.drawImage(im, x, y, w, h);
    y += h + gap;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal menggabungkan gambar soal menjadi PNG.'));
    }, 'image/png');
  });
}

export async function renderQuestionWordImagesToBlob(
  images: RichImage[]
): Promise<Blob> {
  if (images.length === 0) {
    throw new Error('Soal ini tidak memiliki gambar.');
  }
  if (images.length === 1) {
    return dataUrlToBlob(images[0].dataUrl);
  }

  const loaded = await Promise.all(images.map((im) => loadHtmlImage(im.dataUrl)));
  const gap = 14;
  const padding = 12;
  const maxW = Math.max(...loaded.map((im) => im.naturalWidth || im.width || 100), 100);
  const totalH =
    loaded.reduce((sum, im) => sum + (im.naturalHeight || im.height || 100), 0) +
    gap * Math.max(0, loaded.length - 1);

  const canvas = document.createElement('canvas');
  canvas.width = maxW + padding * 2;
  canvas.height = totalH + padding * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return dataUrlToBlob(images[0].dataUrl);
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = padding;
  for (const im of loaded) {
    const w = im.naturalWidth || im.width;
    const h = im.naturalHeight || im.height;
    const x = padding + Math.round((maxW - w) / 2);
    ctx.drawImage(im, x, y, w, h);
    y += h + gap;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal menggabungkan gambar soal menjadi PNG.'));
    }, 'image/png');
  });
}

export async function downloadQuestionWordImage(
  images: RichImage[],
  questionIndex: number
): Promise<string> {
  const blob = await renderQuestionWordImagesToBlob(images);
  const filename = getWordImageFilename(questionIndex, images);
  triggerDownload(blob, filename);
  return filename;
}

export async function downloadAllWordImages(
  questions: RichQuestion[]
): Promise<{ count: number; filename: string }> {
  const entries: { filename: string; images: RichImage[] }[] = [];

  questions.forEach((q, idx) => {
    if (q.questionImages.length > 0) {
      entries.push({
        filename: getWordImageFilename(idx, q.questionImages),
        images: q.questionImages,
      });
    }
  });

  if (entries.length === 0) {
    throw new Error('Tidak ada soal dengan gambar Word untuk diunduh.');
  }

  if (entries.length === 1) {
    const blob = await renderQuestionWordImagesToBlob(entries[0].images);
    triggerDownload(blob, entries[0].filename);
    return { count: 1, filename: entries[0].filename };
  }

  const zip = new JSZip();
  for (const entry of entries) {
    const blob = await renderQuestionWordImagesToBlob(entry.images);
    zip.file(entry.filename, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `Gambar_Word_iSpring_${Date.now().toString().slice(-5)}.zip`;
  triggerDownload(zipBlob, zipFilename);
  return { count: entries.length, filename: zipFilename };
}
