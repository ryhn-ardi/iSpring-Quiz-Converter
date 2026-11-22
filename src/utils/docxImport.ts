import mammoth from 'mammoth';
import JSZip from 'jszip';
import {
  RichContentNode,
  RichTable,
  htmlToRichNodes,
  richLineToPlain,
  richTextToPlain,
  trimRichNodes,
} from './richText';
import { triggerDownload } from './tableImage';

const SOAL_HEADER_REGEX =
  /^(?:(?:[A-Z]|[IVX]+|\d+)[\.\)]\s*)?(?:daftar\s+|bagian\s+)?soal(?:\s+(?:pilihan\s+ganda|evaluasi|ujian|kuis|quiz))?\s*:?\s*$/i;

const KUNCI_HEADER_REGEX =
  /^(?:(?:[A-Z]|[IVX]+|\d+)[\.\)]\s*)?(?:daftar\s+|bagian\s+)?kunci(?:\s+jawaban)?(?:\s+soal)?\s*:?\s*$/i;

const HEADER_CELL_NOISE_REGEX =
  /^(?:no\.?|nomor|soal|kunci|jawaban|kunci\s+jawaban)$/i;

export type DocxImportResult = {
  questionNodes: RichContentNode[];
  keysText: string;
  hasSoalHeader: boolean;
  hasKeysSection: boolean;
  tableCount: number;
};

function isSoalHeaderNode(node: RichContentNode): boolean {
  if (node.type !== 'line') return false;
  const plain = richLineToPlain(node.spans).trim();
  return plain.length > 0 && SOAL_HEADER_REGEX.test(plain);
}

function isKunciHeaderNode(node: RichContentNode): boolean {
  if (node.type !== 'line') return false;
  const plain = richLineToPlain(node.spans).trim();
  return plain.length > 0 && KUNCI_HEADER_REGEX.test(plain);
}

function extractKeysFromTable(table: RichTable): string[] {
  const lines: string[] = [];

  for (const row of table.rows) {
    const cellTexts = row
      .map((cell) => richTextToPlain(cell.lines).replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (cellTexts.length === 0) continue;

    // Skip pure header rows such as | No | Kunci Jawaban |
    if (cellTexts.every((t) => HEADER_CELL_NOISE_REGEX.test(t))) {
      continue;
    }

    let i = 0;
    const rowLines: string[] = [];
    while (i < cellTexts.length) {
      const curr = cellTexts[i];
      const next = cellTexts[i + 1];

      // Case: | 1 | A | or | 1. | A, B |
      const pureNum = curr.match(/^(\d+)\.?$/);
      if (pureNum && next && /^[a-jA-J](?:[\s,\.&\/]+(?:dan\s+)?[a-jA-J])*$/.test(next)) {
        rowLines.push(`${pureNum[1]}. ${next}`);
        i += 2;
        continue;
      }

      // Case: | 1. A |
      if (/^\d+[\s\.\-\=\:\)]+[a-jA-J]/.test(curr)) {
        rowLines.push(curr);
        i += 1;
        continue;
      }

      i += 1;
    }

    if (rowLines.length > 0) {
      lines.push(...rowLines);
    } else {
      lines.push(cellTexts.join(' '));
    }
  }

  return lines;
}

export function extractKeysTextFromNodes(keyNodes: RichContentNode[]): string {
  const outLines: string[] = [];

  for (const node of keyNodes) {
    if (node.type === 'table') {
      outLines.push(...extractKeysFromTable(node));
      continue;
    }

    const plain = richLineToPlain(node.spans).trim();
    if (!plain) continue;

    // Split if a single line contains multiple numbered keys like "1. A   2. B   3. C"
    const multiSplit = plain.split(/(?=\b\d+[\.\)\:\-]\s*[a-jA-J]\b)/g).map((s) => s.trim()).filter(Boolean);
    if (multiSplit.length > 1) {
      outLines.push(...multiSplit);
    } else {
      outLines.push(plain);
    }
  }

  return outLines.join('\n').trim();
}

export function splitDocxNodesIntoQuestionsAndKeys(
  nodes: RichContentNode[]
): DocxImportResult {
  // Use the last standalone "Kunci Jawaban" heading so questions aren't truncated prematurely
  let kunciHeaderIdx = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (isKunciHeaderNode(nodes[i])) {
      kunciHeaderIdx = i;
      break;
    }
  }

  const searchLimit = kunciHeaderIdx !== -1 ? kunciHeaderIdx : nodes.length;
  let soalHeaderIdx = -1;
  for (let i = 0; i < searchLimit; i++) {
    if (isSoalHeaderNode(nodes[i])) {
      soalHeaderIdx = i;
      break;
    }
  }

  const qStart = soalHeaderIdx !== -1 ? soalHeaderIdx + 1 : 0;
  const qEnd = kunciHeaderIdx !== -1 ? kunciHeaderIdx : nodes.length;

  const questionNodes = trimRichNodes(nodes.slice(qStart, qEnd));
  const keyNodes =
    kunciHeaderIdx !== -1 ? trimRichNodes(nodes.slice(kunciHeaderIdx + 1)) : [];
  const keysText = extractKeysTextFromNodes(keyNodes);
  const tableCount = questionNodes.filter((n) => n.type === 'table').length;

  return {
    questionNodes,
    keysText,
    hasSoalHeader: soalHeaderIdx !== -1,
    hasKeysSection: kunciHeaderIdx !== -1,
    tableCount,
  };
}

export async function parseDocxFile(file: File): Promise<DocxImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    { styleMap: ['u => u'] }
  );
  const nodes = htmlToRichNodes(result.value);
  return splitDocxNodesIntoQuestionsAndKeys(nodes);
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wRun(
  text: string,
  opts?: { bold?: boolean; italic?: boolean; underline?: boolean }
): string {
  const rPrParts: string[] = [];
  if (opts?.bold) rPrParts.push('<w:b/>');
  if (opts?.italic) rPrParts.push('<w:i/>');
  if (opts?.underline) rPrParts.push('<w:u w:val="single"/>');
  const rPr = rPrParts.length > 0 ? `<w:rPr>${rPrParts.join('')}</w:rPr>` : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function wPara(runsXml: string): string {
  return `<w:p>${runsXml}</w:p>`;
}

export async function downloadSampleWordTemplate(): Promise<string> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );

  const paragraphs = [
    wPara(wRun('Soal', { bold: true })),
    wPara(
      wRun('1. Era musik yang mengutamakan ') +
        wRun('kerapian', { bold: true }) +
        wRun(', struktur simetri, dan ') +
        wRun('keseimbangan', { underline: true }) +
        wRun(' adalah...')
    ),
    wPara(wRun('a. Era Barok')),
    wPara(wRun('b. Era Romantik')),
    wPara(wRun('c. Era Modern')),
    wPara(wRun('d. Era Klasik')),
    wPara(''),
    wPara(
      wRun('2. Siapakah komponis musik terkenal pada era Klasik yang menciptakan lagu ') +
        wRun('"Für Elise"', { italic: true }) +
        wRun('?')
    ),
    wPara(wRun('a. Johann Sebastian Bach')),
    wPara(wRun('b. Ludwig van Beethoven')),
    wPara(wRun('c. Wolfgang Amadeus Mozart')),
    wPara(wRun('d. Franz Schubert')),
    wPara(''),
    wPara(wRun('Kunci Jawaban', { bold: true })),
    wPara(wRun('1. d')),
    wPara(wRun('2. b')),
  ].join('');

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const filename = 'Template_Soal_Kunci_iSpring.docx';
  triggerDownload(blob, filename);
  return filename;
}
