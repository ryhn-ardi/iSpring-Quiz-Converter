import JSZip from 'jszip';
import {
  DollarSyntaxMode,
  MathFormat,
  renderMathToSvg,
  splitTextWithMath,
} from './mathEngine';
import { RichQuestion } from './quizParser';
import { richLineToPlain, richTextToPlain } from './richText';
import { triggerDownload } from './tableImage';

type LoadedSvgFormula = {
  img: HTMLImageElement;
  width: number;
  height: number;
};

const EX_TO_PX = 10.5;
const MAX_WIDTH_PX = 680;
const PADDING_X = 24;
const PADDING_Y = 20;
const GAP_Y = 14;
const SCALE = 2;

function parseExOrNumber(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const num = parseFloat(val);
  if (Number.isNaN(num)) return fallback;
  if (val.endsWith('ex')) return num * EX_TO_PX;
  if (val.endsWith('em')) return num * EX_TO_PX * 2;
  return num;
}

function loadSvgElement(svgString: string): Promise<LoadedSvgFormula> {
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) {
      reject(new Error('SVG rumus tidak ditemukan.'));
      return;
    }

    let w = parseExOrNumber(svgEl.getAttribute('width'), 120);
    let h = parseExOrNumber(svgEl.getAttribute('height'), 32);

    if (w > MAX_WIDTH_PX) {
      const ratio = MAX_WIDTH_PX / w;
      w = MAX_WIDTH_PX;
      h = h * ratio;
    }

    w = Math.max(24, Math.ceil(w));
    h = Math.max(18, Math.ceil(h));

    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.setAttribute('width', `${w}`);
    svgEl.setAttribute('height', `${h}`);
    svgEl.style.color = '#0f172a';

    const serialized = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ img, width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal merender SVG rumus ke gambar.'));
    };
    img.src = url;
  });
}

export function extractMathSegmentsFromQuestion(
  q: RichQuestion,
  defaultDollarSyntax: DollarSyntaxMode
): { code: string; format: MathFormat; display: boolean }[] {
  const results: { code: string; format: MathFormat; display: boolean }[] = [];

  const scanPlain = (plain: string) => {
    const segs = splitTextWithMath(plain, defaultDollarSyntax);
    for (const seg of segs) {
      if (seg.type === 'math') {
        results.push({
          code: seg.code,
          format: seg.format,
          display: true,
        });
      }
    }
  };

  for (const node of q.questionNodes) {
    if (node.type === 'line') {
      scanPlain(richLineToPlain(node.spans));
    } else {
      for (const row of node.rows) {
        for (const cell of row) {
          scanPlain(richTextToPlain(cell.lines));
        }
      }
    }
  }

  return results;
}

export async function renderQuestionMathToPngBlob(
  q: RichQuestion,
  defaultDollarSyntax: DollarSyntaxMode
): Promise<Blob> {
  const mathItems = extractMathSegmentsFromQuestion(q, defaultDollarSyntax);
  if (mathItems.length === 0) {
    throw new Error('Soal ini tidak memiliki rumus matematika.');
  }

  const loaded: LoadedSvgFormula[] = [];
  for (const item of mathItems) {
    const svg = renderMathToSvg(item.code, item.format, item.display);
    if (svg) {
      loaded.push(await loadSvgElement(svg));
    }
  }

  if (loaded.length === 0) {
    throw new Error('Tidak ada rumus yang berhasil dirender.');
  }

  const maxFormulaW = Math.max(...loaded.map((l) => l.width), 80);
  const totalFormulasH =
    loaded.reduce((sum, l) => sum + l.height, 0) +
    GAP_Y * Math.max(0, loaded.length - 1);

  const canvasW = maxFormulaW + PADDING_X * 2;
  const canvasH = totalFormulasH + PADDING_Y * 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * SCALE;
  canvas.height = canvasH * SCALE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Subtle border for clean card look in iSpring
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, canvasW - 1, canvasH - 1);

  let y = PADDING_Y;
  for (const item of loaded) {
    const x = (canvasW - item.width) / 2;
    ctx.drawImage(item.img, x, y, item.width, item.height);
    y += item.height + GAP_Y;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal membuat file PNG rumus.'));
    }, 'image/png');
  });
}

export function getMathImageFilename(questionIndex: number): string {
  return `math_soal_${questionIndex + 1}.png`;
}

export async function downloadQuestionMathPng(
  q: RichQuestion,
  questionIndex: number,
  defaultDollarSyntax: DollarSyntaxMode
): Promise<string> {
  const blob = await renderQuestionMathToPngBlob(q, defaultDollarSyntax);
  const filename = getMathImageFilename(questionIndex);
  triggerDownload(blob, filename);
  return filename;
}

export async function downloadAllMathImages(
  questions: RichQuestion[],
  defaultDollarSyntax: DollarSyntaxMode
): Promise<{ count: number; filename: string }> {
  const entries: { filename: string; q: RichQuestion }[] = [];

  questions.forEach((q, idx) => {
    if (extractMathSegmentsFromQuestion(q, defaultDollarSyntax).length > 0) {
      entries.push({ filename: getMathImageFilename(idx), q });
    }
  });

  if (entries.length === 0) {
    throw new Error('Tidak ada soal dengan rumus matematika.');
  }

  if (entries.length === 1) {
    const blob = await renderQuestionMathToPngBlob(entries[0].q, defaultDollarSyntax);
    triggerDownload(blob, entries[0].filename);
    return { count: 1, filename: entries[0].filename };
  }

  const zip = new JSZip();
  for (const entry of entries) {
    const blob = await renderQuestionMathToPngBlob(entry.q, defaultDollarSyntax);
    zip.file(entry.filename, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `Gambar_Rumus_iSpring_${Date.now().toString().slice(-5)}.zip`;
  triggerDownload(zipBlob, zipFilename);
  return { count: entries.length, filename: zipFilename };
}
