import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { RichQuestion, questionHasTable } from './quizParser';
import {
  RichText,
  TextSpan,
  hasRichFormatting,
  mergeAdjacentSpans,
  prependPlainPrefixToRichText,
  richNodesToRichText,
  richTextToPlain,
} from './richText';
import { getTableImageFilename } from './tableImage';
import {
  DollarSyntaxMode,
  MathExportMode,
  replaceMathInRichTextWithUnicode,
} from './mathEngine';
import {
  extractMathSegmentsFromQuestion,
  getMathImageFilename,
} from './mathImage';

export type TableExportMode = 'image' | 'text';

const SPREADSHEETML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

function richTextToFlatSpans(lines: RichText): TextSpan[] {
  const flat: TextSpan[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) {
      flat.push({ text: '\n' });
    }
    line.forEach((span) => flat.push(span));
  });
  return mergeAdjacentSpans(flat);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportRichQuizToExcel(
  questions: RichQuestion[],
  tableMode: TableExportMode = 'image',
  mathMode: MathExportMode = 'unicode',
  dollarSyntax: DollarSyntaxMode = 'auto'
): Promise<{
  filename: string;
  formattedCount: number;
  tableImageCount: number;
  mathImageCount: number;
}> {
  const headers = [
    'Question Type', 'Question Text', 'Image', 'Video', 'Audio',
    'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Answer 5',
    'Answer 6', 'Answer 7', 'Answer 8', 'Answer 9', 'Answer 10',
    'Correct Feedback', 'Incorrect Feedback', 'Points',
  ];

  const richTokenMap = new Map<string, RichText>();
  let tokenCounter = 0;
  let tableImageCount = 0;
  let mathImageCount = 0;

  const toCellValue = (rich: RichText): string => {
    if (!hasRichFormatting(rich)) {
      return richTextToPlain(rich);
    }
    const token = `__ISPRING_RICH_${tokenCounter++}__`;
    richTokenMap.set(token, rich);
    return token;
  };

  const rows: string[][] = [];
  questions.forEach((q, idx) => {
    const row = Array(18).fill('');
    const hasTable = questionHasTable(q);
    const hasQuestionMath =
      extractMathSegmentsFromQuestion(q, dollarSyntax).length > 0;

    let questionTextRich =
      hasTable && tableMode === 'image'
        ? richNodesToRichText(q.questionNodes, false)
        : q.questionRich;

    if (mathMode !== 'raw') {
      questionTextRich = replaceMathInRichTextWithUnicode(
        questionTextRich,
        dollarSyntax
      );
    }

    let imageFile = q.image || '';
    if (hasTable && tableMode === 'image' && !imageFile) {
      imageFile = getTableImageFilename(idx);
      tableImageCount++;
    } else if (hasQuestionMath && mathMode === 'image' && !imageFile) {
      imageFile = getMathImageFilename(idx);
      mathImageCount++;
    }

    row[0] = q.type;
    row[1] = toCellValue(questionTextRich);
    row[2] = imageFile;

    q.answers.forEach((ans, optIdx) => {
      if (optIdx < 10) {
        const processedAns =
          mathMode !== 'raw'
            ? replaceMathInRichTextWithUnicode(ans.richText, dollarSyntax)
            : ans.richText;
        const cellRich = ans.isCorrect
          ? prependPlainPrefixToRichText(processedAns, '*')
          : processedAns;
        row[5 + optIdx] = toCellValue(cellRich);
      }
    });

    row[17] = q.points.toString();
    rows.push(row);
  });

  const wb = XLSX.utils.book_new();
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 14 }, // Question Type
    { wch: 52 }, // Question Text
    { wch: 20 }, // Image
    { wch: 12 }, // Video
    { wch: 12 }, // Audio
    { wch: 24 }, // Answer 1
    { wch: 24 }, // Answer 2
    { wch: 24 }, // Answer 3
    { wch: 24 }, // Answer 4
    { wch: 24 }, // Answer 5
    { wch: 16 }, // Answer 6
    { wch: 16 }, // Answer 7
    { wch: 16 }, // Answer 8
    { wch: 16 }, // Answer 9
    { wch: 16 }, // Answer 10
    { wch: 20 }, // Correct Feedback
    { wch: 20 }, // Incorrect Feedback
    { wch: 10 }, // Points
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  const filename = `iSpring_Import_Quiz_${Date.now().toString().slice(-5)}.xlsx`;

  if (richTokenMap.size === 0) {
    XLSX.writeFile(wb, filename);
    return { filename, formattedCount: 0, tableImageCount, mathImageCount };
  }

  const rawBuffer = XLSX.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    bookSST: true,
  }) as ArrayBuffer;

  const zip = await JSZip.loadAsync(rawBuffer);
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');

  if (sharedStringsFile) {
    const xmlStr = await sharedStringsFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');
    const sstNs = xmlDoc.documentElement.namespaceURI || SPREADSHEETML_NS;
    const siNodes = Array.from(xmlDoc.getElementsByTagName('si'));

    for (const si of siNodes) {
      const currentText = si.textContent || '';
      const richLines = richTokenMap.get(currentText);
      if (!richLines) continue;

      while (si.firstChild) {
        si.removeChild(si.firstChild);
      }

      const spans = richTextToFlatSpans(richLines);
      if (spans.length === 0) {
        const t = xmlDoc.createElementNS(sstNs, 't');
        t.textContent = '';
        si.appendChild(t);
        continue;
      }

      for (const span of spans) {
        const r = xmlDoc.createElementNS(sstNs, 'r');

        if (span.bold || span.italic || span.underline) {
          const rPr = xmlDoc.createElementNS(sstNs, 'rPr');
          // OOXML CT_RPrElt schema order: b -> i -> u
          if (span.bold) {
            rPr.appendChild(xmlDoc.createElementNS(sstNs, 'b'));
          }
          if (span.italic) {
            rPr.appendChild(xmlDoc.createElementNS(sstNs, 'i'));
          }
          if (span.underline) {
            rPr.appendChild(xmlDoc.createElementNS(sstNs, 'u'));
          }
          r.appendChild(rPr);
        }

        const t = xmlDoc.createElementNS(sstNs, 't');
        t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
        t.textContent = span.text;
        r.appendChild(t);

        si.appendChild(r);
      }
    }

    let updatedXml = new XMLSerializer().serializeToString(xmlDoc);
    if (!updatedXml.startsWith('<?xml')) {
      updatedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${updatedXml}`;
    }
    zip.file('xl/sharedStrings.xml', updatedXml);
  }

  const outBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  triggerBlobDownload(outBlob, filename);

  return { filename, formattedCount: richTokenMap.size, tableImageCount, mathImageCount };
}
