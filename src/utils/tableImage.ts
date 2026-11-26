import JSZip from 'jszip';
import { RichTable, RichText, TextSpan } from './richText';
import { RichQuestion, getQuestionTables } from './quizParser';
import {
  DollarSyntaxMode,
  MathExportMode,
  replaceMathInRichTextWithUnicode,
} from './mathEngine';
import { stackImageBlobsToPngBlob } from './wordImage';

type WrappedRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  width: number;
};

type WrappedLine = {
  runs: WrappedRun[];
  width: number;
};

const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const CELL_PAD_X = 12;
const CELL_PAD_Y = 9;
const MIN_COL_WIDTH = 64;
const MAX_COL_WIDTH = 300;
const PADDING = 12;
const SCALE = 2;

function getFont(bold: boolean, italic: boolean): string {
  const style = italic ? 'italic ' : '';
  const weight = bold ? 'bold ' : '';
  return `${style}${weight}${FONT_SIZE}px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif`;
}

function tokenizeLine(spans: TextSpan[]): TextSpan[] {
  const tokens: TextSpan[] = [];
  for (const span of spans) {
    // Split keeping spaces attached so wrapping is natural
    const parts = span.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      tokens.push({ ...span, text: part });
    }
  }
  return tokens;
}

function wrapRichText(
  ctx: CanvasRenderingContext2D,
  lines: RichText,
  maxWidth: number,
  forceBold = false
): WrappedLine[] {
  const result: WrappedLine[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      result.push({ runs: [], width: 0 });
      continue;
    }

    const tokens = tokenizeLine(line);
    let currentRuns: WrappedRun[] = [];
    let currentWidth = 0;

    for (const token of tokens) {
      const bold = forceBold || Boolean(token.bold);
      const italic = Boolean(token.italic);
      const underline = Boolean(token.underline);
      ctx.font = getFont(bold, italic);
      const tokenWidth = ctx.measureText(token.text).width;

      const isWhitespace = /^\s+$/.test(token.text);

      if (
        currentRuns.length > 0 &&
        !isWhitespace &&
        currentWidth + tokenWidth > maxWidth
      ) {
        result.push({ runs: currentRuns, width: currentWidth });
        currentRuns = [{ text: token.text, bold, italic, underline, width: tokenWidth }];
        currentWidth = tokenWidth;
      } else if (
        currentRuns.length === 0 &&
        tokenWidth > maxWidth &&
        !isWhitespace
      ) {
        // Hard-break single very long word
        let chunk = '';
        let chunkW = 0;
        for (const ch of token.text) {
          const chW = ctx.measureText(ch).width;
          if (chunk && chunkW + chW > maxWidth) {
            result.push({
              runs: [{ text: chunk, bold, italic, underline, width: chunkW }],
              width: chunkW,
            });
            chunk = ch;
            chunkW = chW;
          } else {
            chunk += ch;
            chunkW += chW;
          }
        }
        if (chunk) {
          currentRuns = [{ text: chunk, bold, italic, underline, width: chunkW }];
          currentWidth = chunkW;
        }
      } else {
        if (currentRuns.length === 0 && isWhitespace) {
          continue;
        }
        currentRuns.push({ text: token.text, bold, italic, underline, width: tokenWidth });
        currentWidth += tokenWidth;
      }
    }

    result.push({ runs: currentRuns, width: currentWidth });
  }

  return result.length > 0 ? result : [{ runs: [], width: 0 }];
}

function measureNaturalLineWidth(
  ctx: CanvasRenderingContext2D,
  lines: RichText,
  forceBold = false
): number {
  let maxW = 0;
  for (const line of lines) {
    let w = 0;
    for (const span of line) {
      ctx.font = getFont(forceBold || Boolean(span.bold), Boolean(span.italic));
      w += ctx.measureText(span.text).width;
    }
    if (w > maxW) maxW = w;
  }
  return maxW;
}

export async function renderTableToPngBlob(
  table: RichTable,
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto'
): Promise<Blob> {
  if (!table.rows || table.rows.length === 0) {
    throw new Error('Tabel kosong tidak dapat dikonversi menjadi gambar.');
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia.');

  const normalizedRows = table.rows.map((row) =>
    row.map((cell) => ({
      ...cell,
      lines:
        mathMode !== 'raw'
          ? replaceMathInRichTextWithUnicode(cell.lines, dollarSyntax)
          : cell.lines,
    }))
  );

  const numCols = Math.max(...normalizedRows.map((r) => r.length), 1);

  // Measure column widths
  const colWidths = Array(numCols).fill(MIN_COL_WIDTH);
  for (const row of normalizedRows) {
    for (let c = 0; c < numCols; c++) {
      const cell = row[c];
      if (!cell) continue;
      const natural = measureNaturalLineWidth(ctx, cell.lines, Boolean(cell.isHeader));
      const needed = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.ceil(natural + CELL_PAD_X * 2)));
      if (needed > colWidths[c]) colWidths[c] = needed;
    }
  }

  // Wrap cells and calculate row heights
  const wrappedGrid: WrappedLine[][][] = [];
  const rowHeights: number[] = [];

  for (const row of normalizedRows) {
    const rowWrapped: WrappedLine[][] = [];
    let maxLines = 1;
    for (let c = 0; c < numCols; c++) {
      const cell = row[c];
      if (!cell) {
        rowWrapped.push([{ runs: [], width: 0 }]);
        continue;
      }
      const wrapped = wrapRichText(
        ctx,
        cell.lines,
        colWidths[c] - CELL_PAD_X * 2,
        Boolean(cell.isHeader)
      );
      if (wrapped.length > maxLines) maxLines = wrapped.length;
      rowWrapped.push(wrapped);
    }
    wrappedGrid.push(rowWrapped);
    rowHeights.push(maxLines * LINE_HEIGHT + CELL_PAD_Y * 2);
  }

  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = rowHeights.reduce((a, b) => a + b, 0);
  const totalWidth = tableWidth + PADDING * 2;
  const totalHeight = tableHeight + PADDING * 2;

  canvas.width = totalWidth * SCALE;
  canvas.height = totalHeight * SCALE;
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Draw cells
  let y = PADDING;
  for (let r = 0; r < normalizedRows.length; r++) {
    const row = normalizedRows[r];
    const rowH = rowHeights[r];
    let x = PADDING;

    for (let c = 0; c < numCols; c++) {
      const colW = colWidths[c];
      const cell = row[c];
      const isHeader = Boolean(cell?.isHeader);

      // Cell fill
      ctx.fillStyle = isHeader ? '#f1f5f9' : '#ffffff';
      ctx.fillRect(x, y, colW, rowH);

      // Cell border
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);

      // Cell text
      const wrappedLines = wrappedGrid[r][c] || [];
      let textY = y + CELL_PAD_Y + FONT_SIZE;
      for (const wLine of wrappedLines) {
        let textX = x + CELL_PAD_X;
        for (const run of wLine.runs) {
          ctx.font = getFont(run.bold, run.italic);
          ctx.fillStyle = isHeader ? '#0f172a' : '#1e293b';
          ctx.fillText(run.text, textX, textY);

          if (run.underline) {
            ctx.fillRect(textX, textY + 2, run.width, 1);
          }

          textX += run.width;
        }
        textY += LINE_HEIGHT;
      }

      x += colW;
    }
    y += rowH;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal membuat gambar PNG tabel.'));
    }, 'image/png');
  });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getTableImageFilename(questionIndex: number): string {
  return `tabel_soal_${questionIndex + 1}.png`;
}

export async function renderQuestionTablesToPngBlob(
  tables: RichTable[],
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto'
): Promise<Blob> {
  if (tables.length === 0) {
    throw new Error('Soal ini tidak memiliki tabel.');
  }
  if (tables.length === 1) {
    return renderTableToPngBlob(tables[0], mathMode, dollarSyntax);
  }
  const blobs = await Promise.all(
    tables.map((t) => renderTableToPngBlob(t, mathMode, dollarSyntax))
  );
  return stackImageBlobsToPngBlob(blobs);
}

export async function downloadQuestionTablePng(
  tables: RichTable | RichTable[],
  questionIndex: number,
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto'
): Promise<string> {
  const tableList = Array.isArray(tables) ? tables : [tables];
  const blob = await renderQuestionTablesToPngBlob(tableList, mathMode, dollarSyntax);
  const filename = getTableImageFilename(questionIndex);
  triggerDownload(blob, filename);
  return filename;
}

export async function downloadAllTableImages(
  questions: RichQuestion[],
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto'
): Promise<{ count: number; filename: string }> {
  const entries: { filename: string; tables: RichTable[] }[] = [];

  questions.forEach((q, idx) => {
    const tables = getQuestionTables(q);
    if (tables.length > 0) {
      entries.push({
        filename: getTableImageFilename(idx),
        tables,
      });
    }
  });

  if (entries.length === 0) {
    throw new Error('Tidak ada soal dengan tabel untuk diunduh.');
  }

  if (entries.length === 1) {
    const blob = await renderQuestionTablesToPngBlob(
      entries[0].tables,
      mathMode,
      dollarSyntax
    );
    triggerDownload(blob, entries[0].filename);
    return { count: 1, filename: entries[0].filename };
  }

  const zip = new JSZip();
  for (const entry of entries) {
    const blob = await renderQuestionTablesToPngBlob(
      entry.tables,
      mathMode,
      dollarSyntax
    );
    zip.file(entry.filename, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `Gambar_Tabel_iSpring_${Date.now().toString().slice(-5)}.zip`;
  triggerDownload(zipBlob, zipFilename);
  return { count: entries.length, filename: zipFilename };
}
