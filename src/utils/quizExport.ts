import JSZip from 'jszip';
import { RichQuestion } from './quizParser';
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
    cc: number;
    B: { t: string };
    F: Record<string, unknown>;
  };
  a: Record<string, unknown>;
  an: Record<string, unknown>;
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
  A: Record<string, unknown>;
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
      const tokens = span.text.match(/\p{L}+|[^\p{L}]+/gu) ?? [span.text];

      for (const tok of tokens) {
        if (!tok) continue;
        const isWord = /^\p{L}+$/u.test(tok);
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

export function buildISpringDocument(
  baseDocument: ISpringDocument,
  questions: RichQuestion[],
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto',
  resultOptions: QuizResultSlideOptions = DEFAULT_QUIZ_RESULT_OPTIONS
): { document: ISpringDocument; formattedSlideCount: number } {
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

  const slides: ISpringSlide[] = questions.map((q) => {
    const slide = cloneJson(templateSlide);
    slide.i = generateISpringId(usedIds);
    slide.tp = q.type === 'MR' ? 'MultipleResponse' : 'MultipleChoice';
    slide.v = true;

    let questionRich = richNodesToRichText(q.questionNodes, true);
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

    if (slide.s?.e) {
      const pts = Number.isFinite(q.points) ? Math.max(0, q.points) : 10;
      slide.s.e.pt = pts;
    }

    return slide;
  });

  templateGroup.S = slides;

  return { document: doc, formattedSlideCount };
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

export async function exportRichQuizToISpringQuiz(
  questions: RichQuestion[],
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto',
  resultOptions: QuizResultSlideOptions = DEFAULT_QUIZ_RESULT_OPTIONS
): Promise<{
  filename: string;
  questionCount: number;
  formattedSlideCount: number;
}> {
  if (questions.length === 0) {
    throw new Error('Tidak ada soal untuk diekspor ke file .quiz.');
  }

  const { metainfoBytes, workspaceBytes, themeBytes, baseDocument } =
    await loadQuizTemplates();

  const { document: generatedDoc, formattedSlideCount } = buildISpringDocument(
    baseDocument,
    questions,
    mathMode,
    dollarSyntax,
    resultOptions
  );

  const zip = new JSZip();
  zip.file('metainfo.json', metainfoBytes, {
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

  const blob = await zip.generateAsync({
    type: 'blob',
    platform: 'DOS',
    mimeType: 'application/octet-stream',
  });

  const filename = `iSpring_Quiz_${Date.now().toString().slice(-5)}.quiz`;
  triggerQuizDownload(blob, filename);

  return {
    filename,
    questionCount: questions.length,
    formattedSlideCount,
  };
}
