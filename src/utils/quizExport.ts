import JSZip from 'jszip';
import { RichQuestion, getQuestionTables, questionHasTable } from './quizParser';
import {
  RichText,
  TextSpan,
  hasRichFormatting,
  mergeAdjacentSpans,
  richNodesToRichText,
} from './richText';
import {
  DollarSyntaxMode,
  MathExportMode,
  replaceMathInRichTextWithUnicode,
} from './mathEngine';
import { TableExportMode } from './excelExport';
import { renderQuestionTablesToPngBlob, renderTableToPngBlob } from './tableImage';
import {
  dataUrlToBlob,
  renderQuestionWordImagesToBlob,
  stackImageBlobsToPngBlob,
} from './wordImage';

const QUIZ_ASSET_PATHS = {
  metainfo: '/assets/aistudio/metainfo_9c2a0b05.json',
  workspace: '/assets/aistudio/workspace_2831283e.json',
  document: '/assets/aistudio/document_ff422a89.json',
  theme: '/assets/aistudio/theme-e29509-7544ca-6183b75997937-950011195_17996-23028_13aede9a.txt',
} as const;

const THEME_ZIP_ENTRY_PATH =
  'theme/theme-e29509-7544ca-6183b75997937-950011195_17996-23028.qhtml';

export type ResultSlideDisplayOptions = {
  showUserScore: boolean;
  showPassingScore: boolean;
  allowReview: boolean;
  showDetailedReport: boolean;
  allowRetry: boolean;
};

export type QuizResultSlideOptions = {
  passed: ResultSlideDisplayOptions;
  failed: ResultSlideDisplayOptions;
};

export const DEFAULT_PASSED_SLIDE_OPTIONS: ResultSlideDisplayOptions = {
  showUserScore: true,
  showPassingScore: true,
  allowReview: true,
  showDetailedReport: false,
  allowRetry: true,
};

export const DEFAULT_FAILED_SLIDE_OPTIONS: ResultSlideDisplayOptions = {
  showUserScore: false,
  showPassingScore: false,
  allowReview: false,
  showDetailedReport: false,
  allowRetry: false,
};

export const DEFAULT_QUIZ_RESULT_OPTIONS: QuizResultSlideOptions = {
  passed: { ...DEFAULT_PASSED_SLIDE_OPTIONS },
  failed: { ...DEFAULT_FAILED_SLIDE_OPTIONS },
};

export type ISpringTextFormat = {
  b?: true;
  i?: true;
  u?: true;
};

export type ISpringTextRun = {
  t: string;
  tf?: ISpringTextFormat;
  r: false;
  l: boolean;
  tp: 'text';
};

export type ISpringParagraph = {
  tp: 'paragraph';
  c: ISpringTextRun[];
};

export type ISpringChoice = {
  i: string;
  t: {
    d: ISpringParagraph[];
  };
  c: boolean;
};

export type ISpringSlide = {
  i: string;
  tp: string;
  D: {
    d: ISpringParagraph[];
    f?: Record<string, unknown>;
  };
  v: boolean;
  C: {
    chs: ISpringChoice[];
  };
  s: {
    ee: boolean;
    e: {
      t: string;
      pt: number;
      p: number;
      atp: number;
    };
    t: { e: boolean; v: number };
    sh: boolean;
    a: number;
    ap?: boolean;
    al?: { e: boolean; v: number };
    cc: number;
    B: { t: string };
    F: Record<string, unknown>;
  };
  a: Record<string, unknown>;
  an: Record<string, unknown>;
  at?: {
    i?: {
      i: string;
      z: boolean;
    };
  };
};

export type ISpringImageAsset = {
  id: string;
  hash: string;
  ext: 'png' | 'jpeg' | 'gif';
  bytes: Uint8Array;
  width: number;
  height: number;
};

export type ISpringResultSlide = {
  i: string;
  tp: string;
  D?: Record<string, unknown>;
  v?: boolean;
  C?: {
    Rs?: {
      ps?: { v: number; u: string };
      a?: number;
      sc?: boolean;
      ap?: boolean;
      sg?: boolean;
      sa?: boolean;
      f?: Record<string, unknown>;
    };
  };
  s?: Record<string, unknown>;
  a?: {
    o?: Array<{ I?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  an?: Record<string, unknown>;
};

export type ISpringDocument = {
  i: string;
  T: string;
  sl: {
    r: {
      g?: ISpringResultSlide[];
      s?: ISpringResultSlide[];
      r?: Record<string, unknown>;
      [key: string]: unknown;
    };
    g: Array<{
      i: string;
      T: string;
      s: Record<string, unknown>;
      S: ISpringSlide[];
    }>;
  };
  s: Record<string, unknown>;
  sk: Record<string, unknown>;
  sm: unknown[];
  A: {
    image?: Record<string, { src: string; width: number; height: number }>;
    audio?: Record<string, unknown>;
    video?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

type CachedTemplates = {
  metainfoBytes: Uint8Array;
  workspaceBytes: Uint8Array;
  themeBytes: Uint8Array;
  baseDocument: ISpringDocument;
};

let cachedTemplatesPromise: Promise<CachedTemplates> | null = null;

async function fetchTemplateBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal memuat template iSpring (${res.status}): ${url}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function fetchTemplateJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal memuat template JSON iSpring (${res.status}): ${url}`);
  }
  return (await res.json()) as T;
}

async function loadQuizTemplates(): Promise<CachedTemplates> {
  if (!cachedTemplatesPromise) {
    cachedTemplatesPromise = (async () => {
      const [metainfoBytes, workspaceBytes, themeBytes, baseDocument] =
        await Promise.all([
          fetchTemplateBytes(QUIZ_ASSET_PATHS.metainfo),
          fetchTemplateBytes(QUIZ_ASSET_PATHS.workspace),
          fetchTemplateBytes(QUIZ_ASSET_PATHS.theme),
          fetchTemplateJson<ISpringDocument>(QUIZ_ASSET_PATHS.document),
        ]);
      return { metainfoBytes, workspaceBytes, themeBytes, baseDocument };
    })().catch((err) => {
      cachedTemplatesPromise = null;
      throw err;
    });
  }
  return cachedTemplatesPromise;
}

export function generateISpringId(usedIds?: Set<string>): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const part = (len: number) => {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };
  let id = `${part(12)}-${part(12)}`;
  while (usedIds && usedIds.has(id)) {
    id = `${part(12)}-${part(12)}`;
  }
  usedIds?.add(id);
  return id;
}

function collectExistingIds(obj: unknown, ids: Set<string>) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectExistingIds(item, ids);
    return;
  }
  const record = obj as Record<string, unknown>;
  if (typeof record.i === 'string') ids.add(record.i);
  if (typeof record.id === 'string') ids.add(record.id);
  for (const val of Object.values(record)) {
    collectExistingIds(val, ids);
  }
}

function buildTextFormat(span: TextSpan): ISpringTextFormat | undefined {
  if (!span.bold && !span.italic && !span.underline) {
    return undefined;
  }
  return {
    ...(span.bold ? { b: true as const } : {}),
    ...(span.italic ? { i: true as const } : {}),
    ...(span.underline ? { u: true as const } : {}),
  };
}

function sanitizeRunText(text: string): string {
  return text
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function splitRichTextByNewlines(lines: RichText): RichText {
  const expanded: RichText = [];
  for (const line of lines) {
    let currentLine: TextSpan[] = [];
    for (const span of line) {
      const cleaned = sanitizeRunText(span.text).replace(/\r\n|\r/g, '\n');
      if (!cleaned.includes('\n')) {
        if (cleaned) currentLine.push({ ...span, text: cleaned });
        continue;
      }
      const parts = cleaned.split('\n');
      parts.forEach((part, idx) => {
        if (idx > 0) {
          expanded.push(currentLine);
          currentLine = [];
        }
        if (part) {
          currentLine.push({ ...span, text: part });
        }
      });
    }
    expanded.push(currentLine);
  }
  return expanded;
}

export function richTextToISpringParagraphs(lines: RichText): ISpringParagraph[] {
  const normalizedLines = splitRichTextByNewlines(lines || []);
  if (normalizedLines.length === 0) {
    return [{ tp: 'paragraph', c: [] }];
  }

  return normalizedLines.map((rawLine) => {
    const line = mergeAdjacentSpans(rawLine);
    const runs: ISpringTextRun[] = [];

    for (const span of line) {
      if (!span.text) continue;
      const tf = buildTextFormat(span);
      const tokens = span.text.match(/[\p{L}\p{M}]+|[^\p{L}\p{M}]+/gu) ?? [span.text];

      for (const tok of tokens) {
        if (!tok) continue;
        const isWord = /^[\p{L}\p{M}]+$/u.test(tok);
        runs.push({
          t: tok,
          ...(tf ? { tf: { ...tf } } : {}),
          r: false,
          l: isWord,
          tp: 'text',
        });
      }
    }

    return {
      tp: 'paragraph',
      c: runs,
    };
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function applyResultSlideOptions(
  slide: ISpringResultSlide | undefined,
  opts: ResultSlideDisplayOptions
) {
  if (!slide) return;

  if (slide.a?.o && Array.isArray(slide.a.o)) {
    slide.a.o = slide.a.o.filter((shape) => {
      const id = shape.I;
      if (!opts.showUserScore && (id === 'awardedScoreLabel' || id === 'awardedScoreValue')) {
        return false;
      }
      if (!opts.showPassingScore && (id === 'passingScoreLabel' || id === 'passingScoreValue')) {
        return false;
      }
      if (!opts.allowReview && id === 'reviewBtn') {
        return false;
      }
      if (!opts.showDetailedReport && id === 'reportBtn') {
        return false;
      }
      if (!opts.allowRetry && id === 'retryBtn') {
        return false;
      }
      return true;
    });
  }

  if (slide.C?.Rs) {
    if (opts.allowRetry && (!slide.C.Rs.a || slide.C.Rs.a < 1)) {
      slide.C.Rs.a = 1;
    }
    if (!opts.showDetailedReport) {
      slide.C.Rs.sg = false;
    }
  }
}

const SLIDE_PICTURE_OBJECT = {
  tp: 'slidePicture',
  I: 'Slide Picture 1',
  k: true,
  s: 'rectangle',
  S: {
    b: { f: 'none' },
    s: { t: 'none', s: 1, d: '', c: 'butt', j: 'miter' },
    a: { t: '', a: true },
    t: { a: 'doNotAutofit', v: 'middle', w: true, l: 0, r: 0, t: 0, b: 0 },
  },
  b: 0.3,
};

async function computeSha1Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-1', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseImageDimensionsFromBytes(
  bytes: Uint8Array
): { width: number; height: number } | null {
  // PNG: 8-byte sig + 4-byte len + "IHDR" + 4-byte width + 4-byte height
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    };
  }

  // GIF: "GIF87a" or "GIF89a" + LE uint16 width/height
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }

  // JPEG: scan SOF0..SOF3 markers (0xFF 0xC0..0xC3)
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 8 < bytes.length) {
          const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
          const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
          return { width, height };
        }
      }
      if (len < 2) break;
      offset += 2 + len;
    }
  }

  return null;
}

async function getImageDimensions(
  blob: Blob,
  bytes: Uint8Array
): Promise<{ width: number; height: number }> {
  const fromHeader = parseImageDimensionsFromBytes(bytes);
  if (fromHeader && fromHeader.width > 0 && fromHeader.height > 0) {
    return fromHeader;
  }

  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve({
            width: img.naturalWidth || img.width || 800,
            height: img.naturalHeight || img.height || 600,
          });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Image load failed'));
        };
        img.src = url;
      });
      return dims;
    } catch {
      // Fallback below
    }
  }

  return { width: 800, height: 600 };
}

function getISpringImageExt(mimeType: string): 'png' | 'jpeg' | 'gif' | null {
  const lower = mimeType.toLowerCase();
  if (lower === 'image/jpeg' || lower === 'image/jpg') return 'jpeg';
  if (lower === 'image/png') return 'png';
  if (lower === 'image/gif') return 'gif';
  return null;
}

async function convertBlobToPngBlob(blob: Blob): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Konversi gambar ke PNG memerlukan lingkungan browser.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal memuat gambar untuk konversi PNG.'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 100;
    canvas.height = img.naturalHeight || img.height || 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((out) => {
        if (out) resolve(out);
        else reject(new Error('Gagal mengonversi gambar ke PNG.'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareQuizImageAssets(
  questions: RichQuestion[],
  tableMode: TableExportMode = 'image',
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto'
): Promise<{
  assets: ISpringImageAsset[];
  questionAssetIds: Map<number, string>;
  embeddedWordImageCount: number;
  embeddedTableCount: number;
}> {
  const assets: ISpringImageAsset[] = [];
  const byHash = new Map<string, ISpringImageAsset>();
  const questionAssetIds = new Map<number, string>();
  let nextId = 1;
  let embeddedWordImageCount = 0;
  let embeddedTableCount = 0;

  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx];
    const wordImages = q.questionImages || [];
    const tables = tableMode === 'image' ? getQuestionTables(q) : [];

    if (wordImages.length === 0 && tables.length === 0) continue;

    let blob: Blob;
    let ext: 'png' | 'jpeg' | 'gif';

    if (wordImages.length > 0 && tables.length === 0) {
      embeddedWordImageCount++;
      if (wordImages.length === 1) {
        const nativeExt = getISpringImageExt(wordImages[0].mimeType);
        const rawBlob = dataUrlToBlob(wordImages[0].dataUrl);
        if (nativeExt) {
          blob = rawBlob;
          ext = nativeExt;
        } else {
          blob = await convertBlobToPngBlob(rawBlob);
          ext = 'png';
        }
      } else {
        blob = await renderQuestionWordImagesToBlob(wordImages);
        ext = 'png';
      }
    } else if (tables.length > 0 && wordImages.length === 0) {
      embeddedTableCount++;
      blob = await renderQuestionTablesToPngBlob(tables, mathMode, dollarSyntax);
      ext = 'png';
    } else {
      // Question has both Word image(s) and table(s): combine in document visual order
      embeddedWordImageCount++;
      embeddedTableCount++;
      const blobs: Blob[] = [];
      const seenImageUrls = new Set<string>();

      for (const node of q.questionNodes) {
        if (node.type === 'image') {
          seenImageUrls.add(node.dataUrl);
          blobs.push(dataUrlToBlob(node.dataUrl));
        } else if (node.type === 'table' && node.rows.length > 0) {
          blobs.push(await renderTableToPngBlob(node, mathMode, dollarSyntax));
        }
      }
      for (const img of wordImages) {
        if (!seenImageUrls.has(img.dataUrl)) {
          blobs.push(dataUrlToBlob(img.dataUrl));
        }
      }

      blob = blobs.length === 1 ? blobs[0] : await stackImageBlobsToPngBlob(blobs);
      ext = 'png';
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = await computeSha1Hex(bytes);
    let asset = byHash.get(hash);
    if (!asset) {
      const dims = await getImageDimensions(blob, bytes);
      asset = {
        id: String(nextId++),
        hash,
        ext,
        bytes,
        width: dims.width,
        height: dims.height,
      };
      byHash.set(hash, asset);
      assets.push(asset);
    }

    questionAssetIds.set(idx, asset.id);
  }

  return { assets, questionAssetIds, embeddedWordImageCount, embeddedTableCount };
}

export function buildISpringDocument(
  baseDocument: ISpringDocument,
  questions: RichQuestion[],
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto',
  resultOptions: QuizResultSlideOptions = DEFAULT_QUIZ_RESULT_OPTIONS,
  imageAssets: ISpringImageAsset[] = [],
  questionAssetIds?: Map<number, string>,
  tableMode: TableExportMode = 'image'
): { document: ISpringDocument; formattedSlideCount: number; totalPoints: number } {
  const doc = cloneJson(baseDocument);

  const templateGroup = doc.sl?.g?.[0];
  const templateSlide = templateGroup?.S?.[0];
  if (!templateGroup || !templateSlide) {
    throw new Error('Struktur grup atau slide template document.json tidak valid.');
  }

  const usedIds = new Set<string>();
  collectExistingIds(doc, usedIds);

  // Apply Final Slide Options for Passed (index 0) and Failed (index 1)
  if (Array.isArray(doc.sl?.r?.g)) {
    applyResultSlideOptions(doc.sl.r.g[0], resultOptions.passed);
    applyResultSlideOptions(doc.sl.r.g[1], resultOptions.failed);
  }

  let formattedSlideCount = 0;
  let totalPoints = 0;

  const slides: ISpringSlide[] = questions.map((q, qIdx) => {
    const slide = cloneJson(templateSlide);
    const isMR = q.type === 'MR';
    slide.i = generateISpringId(usedIds);
    slide.tp = isMR ? 'MultipleResponse' : 'MultipleChoice';
    slide.v = true;

    const hasTableAsImage = tableMode === 'image' && questionHasTable(q);
    let questionRich = richNodesToRichText(q.questionNodes, !hasTableAsImage);
    if (mathMode !== 'raw') {
      questionRich = replaceMathInRichTextWithUnicode(questionRich, dollarSyntax);
    }

    let questionHasFormat = hasRichFormatting(questionRich);

    slide.D = {
      ...slide.D,
      d: richTextToISpringParagraphs(questionRich),
    };

    const choices: ISpringChoice[] = q.answers.map((ans) => {
      const processedAns =
        mathMode !== 'raw'
          ? replaceMathInRichTextWithUnicode(ans.richText, dollarSyntax)
          : ans.richText;
      if (hasRichFormatting(processedAns)) {
        questionHasFormat = true;
      }
      return {
        i: generateISpringId(usedIds),
        t: {
          d: richTextToISpringParagraphs(processedAns),
        },
        c: Boolean(ans.isCorrect),
      };
    });

    // Guard against 0-choice slides which can trigger freezes on save in iSpring
    if (choices.length === 0) {
      choices.push({
        i: generateISpringId(usedIds),
        t: {
          d: richTextToISpringParagraphs([[{ text: '(Opsi belum diisi)' }]]),
        },
        c: false,
      });
    }

    slide.C = { chs: choices };

    if (questionHasFormat) {
      formattedSlideCount++;
    }

    const pts = Number.isFinite(q.points) ? Math.max(0, q.points) : 10;
    totalPoints += pts;

    if (slide.s?.e) {
      slide.s.e.pt = pts;
    }

    if (isMR) {
      // iSpring MultipleResponse requires `ap` and `al` inside slide.s
      slide.s = {
        ee: slide.s.ee,
        e: slide.s.e,
        t: slide.s.t,
        sh: slide.s.sh,
        a: slide.s.a,
        ap: false,
        al: { e: false, v: 1 },
        cc: slide.s.cc,
        B: slide.s.B,
        F: slide.s.F,
      };
    } else {
      delete slide.s.ap;
      delete slide.s.al;
    }

    const assetId = questionAssetIds?.get(qIdx);
    if (assetId) {
      slide.at = { i: { i: assetId, z: true } };
      const aObj = slide.a as {
        o?: Array<Record<string, unknown>>;
        O?: { o?: string; [key: string]: unknown };
        [key: string]: unknown;
      };
      if (Array.isArray(aObj.o)) {
        aObj.o.push(cloneJson(SLIDE_PICTURE_OBJECT));
      }
      if (aObj.O && typeof aObj.O.o === 'string') {
        try {
          const parsedO = JSON.parse(aObj.O.o) as Record<string, number>;
          parsedO.slidePicture = (parsedO.slidePicture ?? 1) + 1;
          aObj.O.o = JSON.stringify(parsedO);
        } catch {
          // Leave existing string unchanged if unparseable
        }
      }
    } else {
      delete slide.at;
    }

    return slide;
  });

  templateGroup.S = slides;
  if (templateGroup.s && typeof templateGroup.s === 'object') {
    templateGroup.s.rs = slides.length;
  }

  const imageMap: Record<string, { src: string; width: number; height: number }> = {};
  for (const asset of imageAssets) {
    imageMap[asset.id] = {
      src: `storage://images/img-${asset.hash}.${asset.ext}`,
      width: asset.width,
      height: asset.height,
    };
  }
  doc.A = {
    ...doc.A,
    image: imageMap,
    audio: doc.A?.audio || {},
    video: doc.A?.video || {},
  };

  return { document: doc, formattedSlideCount, totalPoints };
}

function triggerQuizDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * JSZip writes verNeeded=10 (PKZIP 1.0) even on DEFLATE (method=8) entries,
 * whereas PKZIP 2.0 and iSpring's own ZIP writer use verNeeded=20.
 * Walk EOCD -> CDH -> LFH and upgrade verNeeded < 20 to 20 without altering CRCs/offsets.
 */
export function patchZipVersionNeeded(zipBytes: Uint8Array): Uint8Array {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const minPos = Math.max(0, zipBytes.byteLength - 65557);

  let eocdOffset = -1;
  for (let i = zipBytes.byteLength - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return zipBytes;

  const cdCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < cdCount; i++) {
    if (cdOffset + 46 > zipBytes.byteLength) break;
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;

    if (view.getUint16(cdOffset + 6, true) < 20) {
      view.setUint16(cdOffset + 6, 20, true);
    }

    const lfhOffset = view.getUint32(cdOffset + 42, true);
    if (
      lfhOffset + 30 <= zipBytes.byteLength &&
      view.getUint32(lfhOffset, true) === 0x04034b50 &&
      view.getUint16(lfhOffset + 4, true) < 20
    ) {
      view.setUint16(lfhOffset + 4, 20, true);
    }

    const nlen = view.getUint16(cdOffset + 28, true);
    const elen = view.getUint16(cdOffset + 30, true);
    const clen = view.getUint16(cdOffset + 32, true);
    cdOffset += 46 + nlen + elen + clen;
  }

  return zipBytes;
}

export async function exportRichQuizToISpringQuiz(
  questions: RichQuestion[],
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto',
  resultOptions: QuizResultSlideOptions = DEFAULT_QUIZ_RESULT_OPTIONS,
  tableMode: TableExportMode = 'image'
): Promise<{
  filename: string;
  questionCount: number;
  formattedSlideCount: number;
  embeddedImageCount: number;
  embeddedWordImageCount: number;
  embeddedTableCount: number;
}> {
  if (questions.length === 0) {
    throw new Error('Tidak ada soal untuk diekspor ke file .quiz.');
  }

  const [
    { metainfoBytes, workspaceBytes, themeBytes, baseDocument },
    { assets, questionAssetIds, embeddedWordImageCount, embeddedTableCount },
  ] = await Promise.all([
    loadQuizTemplates(),
    prepareQuizImageAssets(questions, tableMode, mathMode, dollarSyntax),
  ]);

  const { document: generatedDoc, formattedSlideCount, totalPoints } = buildISpringDocument(
    baseDocument,
    questions,
    mathMode,
    dollarSyntax,
    resultOptions,
    assets,
    questionAssetIds,
    tableMode
  );

  let metainfoContent: Uint8Array | string = metainfoBytes;
  try {
    const metainfoText = new TextDecoder().decode(metainfoBytes);
    const metainfoObj = JSON.parse(metainfoText) as {
      storageInfo?: string;
      quiz?: { gradeInfo?: { maxScore?: string } };
    };
    if (metainfoObj?.quiz?.gradeInfo) {
      metainfoObj.quiz.gradeInfo.maxScore = String(totalPoints);
    }
    const storageInfoEntries = assets.map((asset) => ({
      name: `images/img-${asset.hash}.${asset.ext}`,
      originalHash: asset.hash,
      hash: asset.hash,
    }));
    metainfoObj.storageInfo = JSON.stringify(storageInfoEntries).replace(/\//g, '\\/');
    metainfoContent =
      JSON.stringify(metainfoObj, null, 4).replace(/\//g, '\\/').replace(/\n/g, '\r\n') + '\r\n';
  } catch {
    metainfoContent = metainfoBytes;
  }

  const zip = new JSZip();
  zip.file('metainfo.json', metainfoContent, {
    createFolders: false,
    compression: 'DEFLATE',
    dosPermissions: 0x20,
  });
  zip.file('workspace.json', workspaceBytes, {
    createFolders: false,
    compression: 'DEFLATE',
    dosPermissions: 0x20,
  });
  zip.file('document.json', JSON.stringify(generatedDoc), {
    createFolders: false,
    compression: 'DEFLATE',
    dosPermissions: 0x20,
  });
  zip.file(THEME_ZIP_ENTRY_PATH, themeBytes, {
    createFolders: false,
    compression: 'STORE',
    dosPermissions: 0x20,
  });

  for (const asset of assets) {
    zip.file(`images/img-${asset.hash}.${asset.ext}`, asset.bytes, {
      createFolders: false,
      compression: 'STORE',
      dosPermissions: 0x20,
    });
  }

  const rawZip = await zip.generateAsync({
    type: 'uint8array',
    platform: 'DOS',
  });
  const patchedZip = patchZipVersionNeeded(rawZip);
  const blob = new Blob([patchedZip], { type: 'application/octet-stream' });

  const filename = `iSpring_Quiz_${Date.now().toString().slice(-5)}.quiz`;
  triggerQuizDownload(blob, filename);

  return {
    filename,
    questionCount: questions.length,
    formattedSlideCount,
    embeddedImageCount: questionAssetIds.size,
    embeddedWordImageCount,
    embeddedTableCount,
  };
}
