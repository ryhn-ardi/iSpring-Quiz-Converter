import {
  RichContentNode,
  RichImage,
  RichTable,
  RichText,
  nodesHaveImage,
  nodesHaveRichFormatting,
  nodesHaveTable,
  removeRegexFromRichNodes,
  richLineToPlain,
  richNodesToPlain,
  richNodesToRichText,
  richTextToPlain,
  sliceRichLineStart,
  trimRichLine,
  trimRichNodes,
  trimRichText,
  hasRichFormatting,
} from './richText';

export type RichAnswer = {
  text: string;
  richText: RichText;
  isCorrect: boolean;
  images?: RichImage[];
};

export type RichQuestion = {
  type: 'MC' | 'MR';
  sourceNumber?: number;
  question: string;
  questionRich: RichText;
  questionNodes: RichContentNode[];
  questionImages: RichImage[];
  answers: RichAnswer[];
  points: number;
  image?: string;
};

type ParsedOptionItem = {
  lines: RichText;
  images: RichImage[];
};

type RichBlock = {
  qNodes: RichContentNode[];
  aItems: ParsedOptionItem[];
};

const isOptionPlain = (line: string) => {
  return (
    /^(?:\*|\[x\]\s*)?[a-eA-E][\.\)\-]\s*/i.test(line) ||
    /^(?:\*|\[x\]\s*)?[a-eA-E]\s+/i.test(line)
  );
};

const isNumberingPlain = (line: string) => {
  return (
    /^\d+[\.\)\-]\s*/.test(line) ||
    /^\d+\s+/.test(line) ||
    /^soal\s+\d+/i.test(line)
  );
};

export function parseRichNodeBlocks(nodes: RichContentNode[]): RichBlock[] {
  const parsedBlocks: RichBlock[] = [];
  let currentQNodes: RichContentNode[] = [];
  let currentAItems: ParsedOptionItem[] = [];

  for (const node of nodes) {
    if (node.type === 'table') {
      if (currentAItems.length > 0) {
        parsedBlocks.push({ qNodes: currentQNodes, aItems: currentAItems });
        currentQNodes = [node];
        currentAItems = [];
      } else {
        currentQNodes.push(node);
      }
      continue;
    }

    if (node.type === 'image') {
      if (currentAItems.length > 0) {
        currentAItems[currentAItems.length - 1].images.push(node);
      } else {
        currentQNodes.push(node);
      }
      continue;
    }

    const trimmedLine = trimRichLine(node.spans);
    if (trimmedLine.length === 0) continue;

    const plain = richLineToPlain(trimmedLine);
    if (isOptionPlain(plain)) {
      currentAItems.push({ lines: [trimmedLine], images: [] });
    } else {
      if (currentAItems.length > 0) {
        if (isNumberingPlain(plain)) {
          parsedBlocks.push({ qNodes: currentQNodes, aItems: currentAItems });
          currentQNodes = [{ type: 'line', spans: trimmedLine }];
          currentAItems = [];
        } else {
          currentAItems[currentAItems.length - 1].lines.push(trimmedLine);
        }
      } else {
        currentQNodes.push({ type: 'line', spans: trimmedLine });
      }
    }
  }

  if (currentQNodes.length > 0 || currentAItems.length > 0) {
    parsedBlocks.push({ qNodes: currentQNodes, aItems: currentAItems });
  }

  return parsedBlocks;
}

function finalizeQuestionNodes(qNodesInput: RichContentNode[]): {
  cleanQuestionNodes: RichContentNode[];
  qNum: number | null;
} {
  const qNodes = [...qNodesInput];
  if (qNodes.length === 0) {
    return { cleanQuestionNodes: [], qNum: null };
  }

  let qNum: number | null = null;
  const firstLineIdx = qNodes.findIndex((n) => n.type === 'line');

  if (firstLineIdx !== -1 && qNodes[firstLineIdx].type === 'line') {
    const firstLine = qNodes[firstLineIdx].spans;
    const firstPlain = richLineToPlain(firstLine);
    const numMatch = firstPlain.match(/^(\d+)[\.\)\s-]+/);
    qNum = numMatch ? parseInt(numMatch[1], 10) : null;

    const stripMatch = firstPlain.match(/^\d+[\.\)\s-]+\s*/);
    if (stripMatch) {
      const strippedFirst = sliceRichLineStart(firstLine, stripMatch[0].length);
      if (strippedFirst.length > 0) {
        qNodes[firstLineIdx] = { type: 'line', spans: strippedFirst };
      } else {
        qNodes.splice(firstLineIdx, 1);
      }
    }
  }

  return {
    cleanQuestionNodes: trimRichNodes(qNodes),
    qNum,
  };
}

function hasAnyRichNodeContent(nodes: RichContentNode[]): boolean {
  return nodes.some(
    (n) =>
      n.type === 'table' ||
      n.type === 'image' ||
      richLineToPlain(n.spans).trim() !== ''
  );
}

export function convertAutoRich(
  questionNodesInput: RichContentNode[],
  keysText: string,
  defaultPoints: number
): RichQuestion[] {
  const kText = keysText.trim();
  if (!hasAnyRichNodeContent(questionNodesInput)) {
    throw new Error('Kolom daftar soal wajib diisi terlebih dahulu!');
  }

  const keysMap = new Map<number, string[]>();
  const keyLines = kText ? kText.split('\n') : [];

  keyLines.forEach((line) => {
    const cleanLine = line.trim().toLowerCase();
    const numMatch = cleanLine.match(/^(\d+)[\s\.\-\=\:]+(.*)/);
    if (numMatch) {
      const qNum = parseInt(numMatch[1], 10);
      const letters = Array.from(numMatch[2].matchAll(/\b([a-j])\b/g)).map((m) => m[1]);
      if (letters.length > 0) {
        keysMap.set(qNum, Array.from(new Set(letters)));
      }
    }
  });

  if (kText && keysMap.size === 0) {
    keyLines.forEach((line, idx) => {
      const cleanLine = line.trim().toLowerCase();
      const letters = Array.from(cleanLine.matchAll(/\b([a-j])\b/g)).map((m) => m[1]);
      if (letters.length > 0) {
        keysMap.set(idx + 1, Array.from(new Set(letters)));
      }
    });
  }

  const parsedBlocks = parseRichNodeBlocks(questionNodesInput);
  const converted: RichQuestion[] = [];

  parsedBlocks.forEach((block, blockIdx) => {
    let qNodes = [...block.qNodes];
    const aItems = [...block.aItems];
    if (qNodes.length === 0 && aItems.length > 0) {
      const fallback = aItems.shift();
      if (fallback) {
        qNodes = [
          ...fallback.lines.map((spans) => ({ type: 'line' as const, spans })),
          ...fallback.images,
        ];
      }
    }
    if (qNodes.length === 0) return;

    const { cleanQuestionNodes: initialCleanNodes, qNum: parsedQNum } =
      finalizeQuestionNodes(qNodes);
    const qNum = parsedQNum ?? blockIdx + 1;
    const targetKeys = keysMap.get(qNum) || [];

    let cleanQuestionNodes = initialCleanNodes;
    let image = '';

    const qPlain = richNodesToPlain(cleanQuestionNodes, false);
    const imgMatch = qPlain.match(/\[Gambar(?:[:\s]*(.*?))?\]/i);
    if (imgMatch) {
      image = `gambar_soal_${qNum}.jpg`;
      cleanQuestionNodes = removeRegexFromRichNodes(
        cleanQuestionNodes,
        /\[Gambar(?:[:\s]*(.*?))?\]/i
      );
    }

    const questionImages = cleanQuestionNodes.filter(
      (n): n is RichImage => n.type === 'image'
    );

    const answers: RichAnswer[] = [];
    aItems.forEach((ansItem) => {
      const ansRichLines = ansItem.lines;
      if (ansRichLines.length === 0) return;
      const firstLinePlain = richLineToPlain(ansRichLines[0]);
      const letterMatch = firstLinePlain.match(/^(?:\*|\[x\]\s*)?([a-eA-E])/i);
      const letter = letterMatch ? letterMatch[1].toLowerCase() : '';
      const isCorrect = targetKeys.includes(letter);

      const prefixMatch = firstLinePlain.match(/^(?:\*|\[x\]\s*)?[a-eA-E][\.\)\-]?\s*/i);
      const strippedFirst = prefixMatch
        ? sliceRichLineStart(ansRichLines[0], prefixMatch[0].length)
        : ansRichLines[0];

      const cleanAnsRich = trimRichText(
        strippedFirst.length > 0
          ? [strippedFirst, ...ansRichLines.slice(1)]
          : ansRichLines.slice(1)
      );

      answers.push({
        text: richTextToPlain(cleanAnsRich),
        richText: cleanAnsRich,
        isCorrect,
        ...(ansItem.images.length > 0 ? { images: ansItem.images } : {}),
      });
    });

    const isMR = answers.filter((a) => a.isCorrect).length > 1;
    const questionRich = richNodesToRichText(cleanQuestionNodes, true);

    converted.push({
      type: isMR ? 'MR' : 'MC',
      sourceNumber: qNum,
      question: richTextToPlain(questionRich),
      questionRich,
      questionNodes: cleanQuestionNodes,
      questionImages,
      answers,
      points: defaultPoints,
      image,
    });
  });

  if (converted.length === 0) {
    throw new Error('Gagal mendeteksi struktur soal. Pastikan ada baris kosong di antara soal.');
  }

  return converted;
}

export function convertRuleRich(
  ruleNodesInput: RichContentNode[],
  defaultPoints: number
): RichQuestion[] {
  if (!hasAnyRichNodeContent(ruleNodesInput)) {
    throw new Error('Masukkan teks soal manual terlebih dahulu!');
  }

  const parsedBlocks = parseRichNodeBlocks(ruleNodesInput);
  const converted: RichQuestion[] = [];

  parsedBlocks.forEach((block, blockIdx) => {
    let qNodes = [...block.qNodes];
    const aItems = [...block.aItems];
    if (qNodes.length === 0 && aItems.length > 0) {
      const fallback = aItems.shift();
      if (fallback) {
        qNodes = [
          ...fallback.lines.map((spans) => ({ type: 'line' as const, spans })),
          ...fallback.images,
        ];
      }
    }
    if (qNodes.length === 0) return;

    const { cleanQuestionNodes: initialCleanNodes, qNum: parsedQNum } =
      finalizeQuestionNodes(qNodes);
    const qNum = parsedQNum ?? blockIdx + 1;

    let cleanQuestionNodes = initialCleanNodes;
    let image = '';

    const qPlain = richNodesToPlain(cleanQuestionNodes, false);
    const imgMatch = qPlain.match(/\[Gambar(?:[:\s]*(.*?))?\]/i);
    if (imgMatch) {
      image = `gambar_soal_${qNum}.jpg`;
      cleanQuestionNodes = removeRegexFromRichNodes(
        cleanQuestionNodes,
        /\[Gambar(?:[:\s]*(.*?))?\]/i
      );
    }

    const questionImages = cleanQuestionNodes.filter(
      (n): n is RichImage => n.type === 'image'
    );

    const answers: RichAnswer[] = [];
    aItems.forEach((ansItem) => {
      const ansRichLines = ansItem.lines;
      if (ansRichLines.length === 0) return;
      const firstLinePlain = richLineToPlain(ansRichLines[0]);
      const isCorrect =
        firstLinePlain.startsWith('*') || firstLinePlain.toLowerCase().startsWith('[x]');

      const prefixMatch = firstLinePlain.match(/^(?:\*|\[x\]\s*)?[a-eA-E][\.\)\-]?\s*/i);
      const strippedFirst = prefixMatch
        ? sliceRichLineStart(ansRichLines[0], prefixMatch[0].length)
        : ansRichLines[0];

      const cleanAnsRich = trimRichText(
        strippedFirst.length > 0
          ? [strippedFirst, ...ansRichLines.slice(1)]
          : ansRichLines.slice(1)
      );

      answers.push({
        text: richTextToPlain(cleanAnsRich),
        richText: cleanAnsRich,
        isCorrect,
        ...(ansItem.images.length > 0 ? { images: ansItem.images } : {}),
      });
    });

    const isMR = answers.filter((a) => a.isCorrect).length > 1;
    const questionRich = richNodesToRichText(cleanQuestionNodes, true);

    converted.push({
      type: isMR ? 'MR' : 'MC',
      sourceNumber: qNum,
      question: richTextToPlain(questionRich),
      questionRich,
      questionNodes: cleanQuestionNodes,
      questionImages,
      answers,
      points: defaultPoints,
      image,
    });
  });

  if (converted.length === 0) {
    throw new Error('Gagal memproses susunan soal. Pastikan format soal sudah sesuai.');
  }

  return converted;
}

export function questionHasRichFormatting(q: RichQuestion): boolean {
  return (
    nodesHaveRichFormatting(q.questionNodes) ||
    q.answers.some((a) => hasRichFormatting(a.richText))
  );
}

export function questionHasTable(q: RichQuestion): boolean {
  return nodesHaveTable(q.questionNodes);
}

export function questionHasImage(q: RichQuestion): boolean {
  return nodesHaveImage(q.questionNodes) || q.questionImages.length > 0;
}

export function getFirstQuestionTable(q: RichQuestion): RichTable | undefined {
  return q.questionNodes.find((n): n is RichTable => n.type === 'table');
}
