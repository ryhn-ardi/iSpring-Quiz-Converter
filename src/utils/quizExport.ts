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

export type ISpringDocument = {
  i: string;
  T: string;
  sl: {
    r: Record<string, unknown>;
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

export function generateISpringId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const part = (len: number) => {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  };
  return `${part(12)}-${part(12)}`;
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

export function richTextToISpringParagraphs(lines: RichText): ISpringParagraph[] {
  if (!lines || lines.length === 0) {
    return [{ tp: 'paragraph', c: [] }];
  }

  return lines.map((rawLine) => {
    const line = mergeAdjacentSpans(rawLine);
    const runs: ISpringTextRun[] = [];

    for (const span of line) {
      if (!span.text) continue;
      const tf = buildTextFormat(span);
      const tokens = span.text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [span.text];

      for (const tok of tokens) {
        if (!tok) continue;
        const isWord = /^[\p{L}\p{N}]+$/u.test(tok);
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

export function buildISpringDocument(
  baseDocument: ISpringDocument,
  questions: RichQuestion[],
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto'
): { document: ISpringDocument; formattedSlideCount: number } {
  const doc = cloneJson(baseDocument);

  const templateGroup = doc.sl?.g?.[0];
  const templateSlide = templateGroup?.S?.[0];
  if (!templateGroup || !templateSlide) {
    throw new Error('Struktur grup atau slide template document.json tidak valid.');
  }

  let formattedSlideCount = 0;

  const slides: ISpringSlide[] = questions.map((q) => {
    const slide = cloneJson(templateSlide);
    slide.i = generateISpringId();
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

    slide.C = {
      chs: q.answers.map((ans) => {
        const processedAns =
          mathMode !== 'raw'
            ? replaceMathInRichTextWithUnicode(ans.richText, dollarSyntax)
            : ans.richText;
        if (hasRichFormatting(processedAns)) {
          questionHasFormat = true;
        }
        return {
          i: generateISpringId(),
          t: {
            d: richTextToISpringParagraphs(processedAns),
          },
          c: Boolean(ans.isCorrect),
        };
      }),
    };

    if (questionHasFormat) {
      formattedSlideCount++;
    }

    if (slide.s?.e) {
      slide.s.e.pt = Number.isFinite(q.points) ? q.points : 10;
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
  dollarSyntax: DollarSyntaxMode = 'auto'
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
    dollarSyntax
  );

  const zip = new JSZip();
  zip.file('metainfo.json', metainfoBytes);
  zip.file('workspace.json', workspaceBytes);
  zip.file('document.json', JSON.stringify(generatedDoc));
  zip.file(THEME_ZIP_ENTRY_PATH, themeBytes);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
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
