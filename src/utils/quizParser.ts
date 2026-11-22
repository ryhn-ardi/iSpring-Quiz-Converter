import {
  RichLine,
  RichText,
  hasRichFormatting,
  removeRegexFromRichText,
  richLineToPlain,
  richTextToPlain,
  sliceRichLineStart,
  trimRichLine,
  trimRichText,
} from './richText';

export type RichAnswer = {
  text: string;
  richText: RichText;
  isCorrect: boolean;
};

export type RichQuestion = {
  type: 'MC' | 'MR';
  question: string;
  questionRich: RichText;
  answers: RichAnswer[];
  points: number;
  image?: string;
};

type RichBlock = {
  qLines: RichLine[];
  aLines: RichText[];
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

export function parseRichBlocks(lines: RichText): RichBlock[] {
  const parsedBlocks: RichBlock[] = [];
  let currentQLines: RichLine[] = [];
  let currentALines: RichText[] = [];

  const nonEmptyLines = lines.map(trimRichLine).filter((l) => l.length > 0);

  nonEmptyLines.forEach((line) => {
    const plain = richLineToPlain(line);
    if (isOptionPlain(plain)) {
      currentALines.push([line]);
    } else {
      if (currentALines.length > 0) {
        if (isNumberingPlain(plain)) {
          parsedBlocks.push({ qLines: currentQLines, aLines: currentALines });
          currentQLines = [line];
          currentALines = [];
        } else {
          currentALines[currentALines.length - 1].push(line);
        }
      } else {
        currentQLines.push(line);
      }
    }
  });

  if (currentQLines.length > 0 || currentALines.length > 0) {
    parsedBlocks.push({ qLines: currentQLines, aLines: currentALines });
  }

  return parsedBlocks;
}

function finalizeQuestionTitle(
  qLinesInput: RichLine[],
  fallbackAnswer?: RichText
): {
  qNumFallbackOffset: boolean;
  qNumMatch: RegExpMatchArray | null;
  cleanQuestionRich: RichText;
  image: string;
  qNum: number | null;
} {
  let qLines = [...qLinesInput];
  let qNumFallbackOffset = false;

  if (qLines.length === 0 && fallbackAnswer && fallbackAnswer.length > 0) {
    qLines = [...fallbackAnswer];
    qNumFallbackOffset = true;
  }

  if (qLines.length === 0) {
    return {
      qNumFallbackOffset,
      qNumMatch: null,
      cleanQuestionRich: [],
      image: '',
      qNum: null,
    };
  }

  const firstPlain = richLineToPlain(qLines[0]);
  const numMatch = firstPlain.match(/^(\d+)[\.\)\s-]+/);
  const qNum = numMatch ? parseInt(numMatch[1], 10) : null;

  const stripMatch = firstPlain.match(/^\d+[\.\)\s-]+\s*/);
  if (stripMatch) {
    const strippedFirst = sliceRichLineStart(qLines[0], stripMatch[0].length);
    qLines = strippedFirst.length > 0 ? [strippedFirst, ...qLines.slice(1)] : qLines.slice(1);
  }

  return {
    qNumFallbackOffset,
    qNumMatch: numMatch,
    cleanQuestionRich: trimRichText(qLines),
    image: '',
    qNum,
  };
}

export function convertAutoRich(
  questionLines: RichText,
  keysText: string,
  defaultPoints: number
): RichQuestion[] {
  const kText = keysText.trim();
  if (questionLines.every((l) => richLineToPlain(l).trim() === '') || !kText) {
    throw new Error('Kolom soal dan kolom kunci jawaban wajib diisi keduanya!');
  }

  const keysMap = new Map<number, string[]>();
  const keyLines = kText.split('\n');

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

  if (keysMap.size === 0) {
    keyLines.forEach((line, idx) => {
      const cleanLine = line.trim().toLowerCase();
      const letters = Array.from(cleanLine.matchAll(/\b([a-j])\b/g)).map((m) => m[1]);
      if (letters.length > 0) {
        keysMap.set(idx + 1, Array.from(new Set(letters)));
      }
    });
  }

  const parsedBlocks = parseRichBlocks(questionLines);
  const converted: RichQuestion[] = [];

  parsedBlocks.forEach((block, blockIdx) => {
    let qLines = [...block.qLines];
    const aLines = [...block.aLines];
    if (qLines.length === 0 && aLines.length > 0) {
      qLines = aLines.shift() || [];
    }
    if (qLines.length === 0) return;

    const firstPlain = richLineToPlain(qLines[0]);
    const numMatch = firstPlain.match(/^(\d+)[\.\)\s-]+/);
    const qNum = numMatch ? parseInt(numMatch[1], 10) : blockIdx + 1;
    const targetKeys = keysMap.get(qNum) || [];

    const finalized = finalizeQuestionTitle(qLines);
    let cleanQuestionRich = finalized.cleanQuestionRich;
    let image = '';

    const qPlain = richTextToPlain(cleanQuestionRich);
    const imgMatch = qPlain.match(/\[Gambar(?:[:\s]*(.*?))?\]/i);
    if (imgMatch) {
      image = `gambar_soal_${qNum}.jpg`;
      cleanQuestionRich = removeRegexFromRichText(
        cleanQuestionRich,
        /\[Gambar(?:[:\s]*(.*?))?\]/i
      );
    }

    const answers: RichAnswer[] = [];
    aLines.forEach((ansRichLines) => {
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
      });
    });

    const isMR = answers.filter((a) => a.isCorrect).length > 1;

    converted.push({
      type: isMR ? 'MR' : 'MC',
      question: richTextToPlain(cleanQuestionRich),
      questionRich: cleanQuestionRich,
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
  ruleLines: RichText,
  defaultPoints: number
): RichQuestion[] {
  if (ruleLines.every((l) => richLineToPlain(l).trim() === '')) {
    throw new Error('Masukkan teks soal manual terlebih dahulu!');
  }

  const parsedBlocks = parseRichBlocks(ruleLines);
  const converted: RichQuestion[] = [];

  parsedBlocks.forEach((block, blockIdx) => {
    let qLines = [...block.qLines];
    const aLines = [...block.aLines];
    if (qLines.length === 0 && aLines.length > 0) {
      qLines = aLines.shift() || [];
    }
    if (qLines.length === 0) return;

    const firstPlain = richLineToPlain(qLines[0]);
    const numMatch = firstPlain.match(/^(\d+)[\.\)\s-]+/);
    const qNum = numMatch ? parseInt(numMatch[1], 10) : blockIdx + 1;

    const finalized = finalizeQuestionTitle(qLines);
    let cleanQuestionRich = finalized.cleanQuestionRich;
    let image = '';

    const qPlain = richTextToPlain(cleanQuestionRich);
    const imgMatch = qPlain.match(/\[Gambar(?:[:\s]*(.*?))?\]/i);
    if (imgMatch) {
      image = `gambar_soal_${qNum}.jpg`;
      cleanQuestionRich = removeRegexFromRichText(
        cleanQuestionRich,
        /\[Gambar(?:[:\s]*(.*?))?\]/i
      );
    }

    const answers: RichAnswer[] = [];
    aLines.forEach((ansRichLines) => {
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
      });
    });

    const isMR = answers.filter((a) => a.isCorrect).length > 1;

    converted.push({
      type: isMR ? 'MR' : 'MC',
      question: richTextToPlain(cleanQuestionRich),
      questionRich: cleanQuestionRich,
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
    hasRichFormatting(q.questionRich) ||
    q.answers.some((a) => hasRichFormatting(a.richText))
  );
}
