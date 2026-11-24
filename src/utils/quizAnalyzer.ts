import { RichQuestion } from './quizParser';

export type EmptyAnswerReason = 'no_options' | 'no_key' | 'empty_option_text';

export type QuestionAnswerIssue = {
  index: number;
  displayNumber: number;
  reasons: EmptyAnswerReason[];
  emptyOptionLetters: string[];
  optionCount: number;
  correctCount: number;
  questionSnippet: string;
};

export type QuizAnswerAnalysis = {
  totalQuestions: number;
  completeCount: number;
  incompleteCount: number;
  noOptionsCount: number;
  noKeyCount: number;
  emptyOptionTextCount: number;
  issues: QuestionAnswerIssue[];
  issuesByIndex: Map<number, QuestionAnswerIssue>;
};

function makeSnippet(text: string, maxLen = 75): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '(Soal berisi tabel / gambar)';
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trimEnd() + '…';
}

export function analyzeQuizAnswers(questions: RichQuestion[]): QuizAnswerAnalysis {
  const issues: QuestionAnswerIssue[] = [];
  const issuesByIndex = new Map<number, QuestionAnswerIssue>();

  let noOptionsCount = 0;
  let noKeyCount = 0;
  let emptyOptionTextCount = 0;

  questions.forEach((q, idx) => {
    const displayNumber = q.sourceNumber ?? idx + 1;
    const optionCount = q.answers.length;
    const correctCount = q.answers.filter((a) => a.isCorrect).length;

    const emptyOptionLetters: string[] = [];
    q.answers.forEach((ans, optIdx) => {
      if (ans.text.trim() === '') {
        emptyOptionLetters.push(String.fromCharCode(65 + optIdx));
      }
    });

    const reasons: EmptyAnswerReason[] = [];
    if (optionCount === 0) {
      reasons.push('no_options');
      noOptionsCount++;
    } else {
      if (correctCount === 0) {
        reasons.push('no_key');
        noKeyCount++;
      }
      if (emptyOptionLetters.length > 0) {
        reasons.push('empty_option_text');
        emptyOptionTextCount++;
      }
    }

    if (reasons.length > 0) {
      const issue: QuestionAnswerIssue = {
        index: idx,
        displayNumber,
        reasons,
        emptyOptionLetters,
        optionCount,
        correctCount,
        questionSnippet: makeSnippet(q.question),
      };
      issues.push(issue);
      issuesByIndex.set(idx, issue);
    }
  });

  const totalQuestions = questions.length;
  const incompleteCount = issues.length;
  const completeCount = totalQuestions - incompleteCount;

  return {
    totalQuestions,
    completeCount,
    incompleteCount,
    noOptionsCount,
    noKeyCount,
    emptyOptionTextCount,
    issues,
    issuesByIndex,
  };
}

export function describeIssueReasons(issue: QuestionAnswerIssue): string {
  const labels: string[] = [];
  if (issue.reasons.includes('no_options')) {
    labels.push('Opsi jawaban tidak ada');
  }
  if (issue.reasons.includes('no_key')) {
    labels.push('Kunci jawaban belum diisi');
  }
  if (issue.reasons.includes('empty_option_text')) {
    labels.push(`Opsi ${issue.emptyOptionLetters.join(', ')} kosong`);
  }
  return labels.join(' • ');
}

export function formatEmptyAnswerReport(analysis: QuizAnswerAnalysis): string {
  if (analysis.incompleteCount === 0) {
    return `Semua ${analysis.totalQuestions} soal memiliki jawaban & kunci lengkap.`;
  }

  const header = [
    `ANALISIS SOAL JAWABAN KOSONG`,
    `Total Soal: ${analysis.totalQuestions} | Lengkap: ${analysis.completeCount} | Masih Kosong: ${analysis.incompleteCount}`,
    `- Kunci belum diisi: ${analysis.noKeyCount} soal`,
    `- Opsi jawaban tidak ada: ${analysis.noOptionsCount} soal`,
    `- Teks opsi kosong: ${analysis.emptyOptionTextCount} soal`,
    ``,
    `Daftar Soal Bermasalah:`,
  ];

  const rows = analysis.issues.map(
    (issue) =>
      `- Soal ${issue.displayNumber} (${describeIssueReasons(issue)}): ${issue.questionSnippet}`
  );

  return [...header, ...rows].join('\n');
}

export function upsertAutoKeyLine(
  keysText: string,
  qNum: number,
  letters: string[]
): string {
  const formattedLetters = letters.map((l) => l.toLowerCase()).join(', ');
  const rawLines = keysText ? keysText.split('\n') : [];
  const lineRegex = new RegExp(`^\\s*${qNum}\\s*[\\.\\)\\-\\=\\:]`);

  let replaced = false;
  const nextLines = rawLines
    .map((line) => {
      if (lineRegex.test(line)) {
        replaced = true;
        return formattedLetters ? `${qNum}. ${formattedLetters}` : `${qNum}.`;
      }
      return line;
    })
    .filter((l, idx, arr) => !(l.trim() === '' && idx === arr.length - 1));

  if (!replaced && formattedLetters) {
    nextLines.push(`${qNum}. ${formattedLetters}`);
  }

  // Sort numeric lines nicely if all lines start with numbers
  const allNumbered = nextLines.every((l) => /^\s*\d+\b/.test(l) || l.trim() === '');
  if (allNumbered) {
    return nextLines
      .filter((l) => l.trim() !== '')
      .sort((a, b) => {
        const na = parseInt(a.match(/^\s*(\d+)/)?.[1] || '0', 10);
        const nb = parseInt(b.match(/^\s*(\d+)/)?.[1] || '0', 10);
        return na - nb;
      })
      .join('\n');
  }

  return nextLines.join('\n');
}
