export type TextSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type RichLine = TextSpan[];
export type RichText = RichLine[];

export type RichTableCell = {
  lines: RichText;
  isHeader?: boolean;
};

export type RichTable = {
  type: 'table';
  rows: RichTableCell[][];
};

export type RichContentNode =
  | { type: 'line'; spans: RichLine }
  | RichTable;

type FormatFlags = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export function mergeAdjacentSpans(spans: TextSpan[]): TextSpan[] {
  const result: TextSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const normalized: TextSpan = {
      text: span.text,
      ...(span.bold ? { bold: true } : {}),
      ...(span.italic ? { italic: true } : {}),
      ...(span.underline ? { underline: true } : {}),
    };
    const prev = result[result.length - 1];
    if (
      prev &&
      Boolean(prev.bold) === Boolean(normalized.bold) &&
      Boolean(prev.italic) === Boolean(normalized.italic) &&
      Boolean(prev.underline) === Boolean(normalized.underline)
    ) {
      prev.text += normalized.text;
    } else {
      result.push(normalized);
    }
  }
  return result;
}

export function richLineToPlain(line: RichLine): string {
  return line.map((s) => s.text).join('');
}

export function richTextToPlain(lines: RichText): string {
  return lines.map(richLineToPlain).join('\n');
}

export function hasRichFormatting(lines: RichText): boolean {
  return lines.some((line) =>
    line.some((span) => Boolean(span.bold || span.italic || span.underline))
  );
}

export function nodesHaveRichFormatting(nodes: RichContentNode[]): boolean {
  return nodes.some((node) => {
    if (node.type === 'line') return hasRichFormatting([node.spans]);
    return node.rows.some((row) => row.some((cell) => hasRichFormatting(cell.lines)));
  });
}

export function nodesHaveTable(nodes: RichContentNode[]): boolean {
  return nodes.some((node) => node.type === 'table');
}

export function getFormattingSummary(nodes: RichContentNode[]): string[] {
  let bold = false;
  let italic = false;
  let underline = false;
  let hasTable = false;

  const scanLines = (lines: RichText) => {
    for (const line of lines) {
      for (const span of line) {
        if (span.bold) bold = true;
        if (span.italic) italic = true;
        if (span.underline) underline = true;
      }
    }
  };

  for (const node of nodes) {
    if (node.type === 'line') {
      scanLines([node.spans]);
    } else {
      hasTable = true;
      for (const row of node.rows) {
        for (const cell of row) {
          scanLines(cell.lines);
        }
      }
    }
  }

  const tags: string[] = [];
  if (bold) tags.push('Bold');
  if (italic) tags.push('Italic');
  if (underline) tags.push('Underline');
  if (hasTable) tags.push('Tabel');
  return tags;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function spanToHtml(span: TextSpan): string {
  let content = escapeHtml(span.text);
  if (span.underline) content = `<u>${content}</u>`;
  if (span.italic) content = `<i>${content}</i>`;
  if (span.bold) content = `<b>${content}</b>`;
  return content;
}

export function richLineToHtml(line: RichLine): string {
  return line.map(spanToHtml).join('');
}

export function richTextToHtml(lines: RichText): string {
  return lines.map(richLineToHtml).join('<br>');
}

export function tableToHtml(table: RichTable, withInlineStyles = false): string {
  const tableStyle = withInlineStyles
    ? ' style="border-collapse:collapse;margin:8px 0;font-family:inherit;font-size:inherit;"'
    : '';
  const rowsHtml = table.rows
    .map((row) => {
      const cellsHtml = row
        .map((cell) => {
          const tag = cell.isHeader ? 'th' : 'td';
          const cellStyle = withInlineStyles
            ? ` style="border:1px solid #94a3b8;padding:6px 10px;text-align:left;${
                cell.isHeader ? 'background-color:#f1f5f9;font-weight:bold;' : ''
              }"`
            : '';
          const inner = richTextToHtml(cell.lines) || '<br>';
          return `<${tag}${cellStyle}>${inner}</${tag}>`;
        })
        .join('');
      return `<tr>${cellsHtml}</tr>`;
    })
    .join('');
  return `<table${tableStyle}><tbody>${rowsHtml}</tbody></table>`;
}

export function richNodesToHtml(nodes: RichContentNode[], withInlineTableStyles = false): string {
  return nodes
    .map((node) => {
      if (node.type === 'line') return richLineToHtml(node.spans);
      return tableToHtml(node, withInlineTableStyles);
    })
    .join('<br>');
}

export function richNodesToEditorHtml(nodes: RichContentNode[]): string {
  if (nodes.length === 0) return '';
  return nodes
    .map((node) => {
      if (node.type === 'line') {
        const inner = richLineToHtml(node.spans);
        return `<div>${inner || '<br>'}</div>`;
      }
      return tableToHtml(node, false);
    })
    .join('');
}

export function richTextToEditorHtml(lines: RichText): string {
  return richNodesToEditorHtml(lines.map((spans) => ({ type: 'line', spans })));
}

export function tableToPlainLines(table: RichTable): RichText {
  const out: RichText = [];
  table.rows.forEach((row) => {
    const rowLine: RichLine = [];
    row.forEach((cell, cIdx) => {
      if (cIdx > 0) {
        rowLine.push({ text: ' | ' });
      }
      const cellSingleLine: RichLine = [];
      cell.lines.forEach((cLine, lIdx) => {
        if (lIdx > 0) cellSingleLine.push({ text: ' ' });
        cLine.forEach((sp) =>
          cellSingleLine.push({
            ...sp,
            ...(cell.isHeader ? { bold: true } : {}),
          })
        );
      });
      if (cellSingleLine.length === 0) {
        rowLine.push({ text: '-' });
      } else {
        rowLine.push(...cellSingleLine);
      }
    });
    out.push(mergeAdjacentSpans(rowLine));
  });
  return out;
}

export function richNodesToRichText(
  nodes: RichContentNode[],
  includeTablesAsText = true
): RichText {
  const out: RichText = [];
  for (const node of nodes) {
    if (node.type === 'line') {
      out.push(node.spans);
    } else if (includeTablesAsText) {
      out.push(...tableToPlainLines(node));
    }
  }
  return out;
}

export function richNodesToPlain(
  nodes: RichContentNode[],
  includeTablesAsText = true
): string {
  return richTextToPlain(richNodesToRichText(nodes, includeTablesAsText));
}

/**
 * Removes `charsToRemove` characters from the start of a RichLine
 * while preserving formatting on remaining characters.
 */
export function sliceRichLineStart(line: RichLine, charsToRemove: number): RichLine {
  if (charsToRemove <= 0) return mergeAdjacentSpans(line);
  let remaining = charsToRemove;
  const out: TextSpan[] = [];
  for (const span of line) {
    if (remaining <= 0) {
      out.push({ ...span });
    } else if (span.text.length <= remaining) {
      remaining -= span.text.length;
    } else {
      out.push({
        ...span,
        text: span.text.slice(remaining),
      });
      remaining = 0;
    }
  }
  return mergeAdjacentSpans(out);
}

export function trimRichLine(line: RichLine): RichLine {
  const plain = richLineToPlain(line);
  const leadingMatch = plain.match(/^\s*/);
  const leading = leadingMatch ? leadingMatch[0].length : 0;
  const trailingMatch = plain.match(/\s*$/);
  const trailing = trailingMatch ? trailingMatch[0].length : 0;

  if (leading + trailing >= plain.length) return [];

  let sliced = sliceRichLineStart(line, leading);
  if (trailing > 0) {
    let rem = trailing;
    const reversed: TextSpan[] = [];
    for (let i = sliced.length - 1; i >= 0; i--) {
      const span = sliced[i];
      if (rem <= 0) {
        reversed.push({ ...span });
      } else if (span.text.length <= rem) {
        rem -= span.text.length;
      } else {
        reversed.push({
          ...span,
          text: span.text.slice(0, span.text.length - rem),
        });
        rem = 0;
      }
    }
    sliced = mergeAdjacentSpans(reversed.reverse());
  }
  return sliced;
}

export function trimRichText(lines: RichText): RichText {
  const trimmedLines = lines.map(trimRichLine);
  let start = 0;
  let end = trimmedLines.length - 1;
  while (start <= end && trimmedLines[start].length === 0) start++;
  while (end >= start && trimmedLines[end].length === 0) end--;
  return trimmedLines.slice(start, end + 1);
}

function isEmptyLineNode(node: RichContentNode | undefined): boolean {
  return Boolean(node && node.type === 'line' && node.spans.length === 0);
}

export function trimRichNodes(nodes: RichContentNode[]): RichContentNode[] {
  const normalized: RichContentNode[] = nodes.map((n) =>
    n.type === 'line' ? { type: 'line', spans: trimRichLine(n.spans) } : n
  );
  let start = 0;
  let end = normalized.length - 1;
  while (start <= end && isEmptyLineNode(normalized[start])) {
    start++;
  }
  while (end >= start && isEmptyLineNode(normalized[end])) {
    end--;
  }
  return normalized.slice(start, end + 1);
}

export function removeRegexFromRichLine(line: RichLine, regex: RegExp): RichLine {
  const plain = richLineToPlain(line);
  const match = plain.match(regex);
  if (!match || match.index === undefined) return line;
  const start = match.index;
  const end = start + match[0].length;

  let pos = 0;
  const out: TextSpan[] = [];
  for (const span of line) {
    const spanStart = pos;
    const spanEnd = pos + span.text.length;
    pos = spanEnd;

    if (spanEnd <= start || spanStart >= end) {
      out.push({ ...span });
    } else {
      if (spanStart < start) {
        out.push({ ...span, text: span.text.slice(0, start - spanStart) });
      }
      if (spanEnd > end) {
        out.push({ ...span, text: span.text.slice(end - spanStart) });
      }
    }
  }
  return trimRichLine(mergeAdjacentSpans(out));
}

export function removeRegexFromRichText(lines: RichText, regex: RegExp): RichText {
  return lines
    .map((line) => removeRegexFromRichLine(line, regex))
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1));
}

export function removeRegexFromRichNodes(
  nodes: RichContentNode[],
  regex: RegExp
): RichContentNode[] {
  return nodes
    .map((node) => {
      if (node.type !== 'line') return node;
      return { type: 'line' as const, spans: removeRegexFromRichLine(node.spans, regex) };
    })
    .filter((node, idx, arr) => {
      if (node.type !== 'line') return true;
      return node.spans.length > 0 || (idx > 0 && idx < arr.length - 1);
    });
}

export function prependPlainPrefixToRichText(lines: RichText, prefix: string): RichText {
  if (lines.length === 0) return [[{ text: prefix }]];
  const [first, ...rest] = lines;
  return [mergeAdjacentSpans([{ text: prefix }, ...first]), ...rest];
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'TR', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
]);

const SKIP_TAGS = new Set([
  'STYLE', 'SCRIPT', 'HEAD', 'META', 'LINK', 'XML', 'TITLE', 'NOSCRIPT', 'COLGROUP',
]);

function getUpdatedFlags(el: HTMLElement, current: FormatFlags): FormatFlags {
  const next = { ...current };
  const tag = el.tagName.toUpperCase();

  if (tag === 'B' || tag === 'STRONG' || tag === 'TH') {
    next.bold = true;
  } else if (tag === 'I' || tag === 'EM') {
    next.italic = true;
  } else if (tag === 'U') {
    next.underline = true;
  }

  const style = el.style;
  if (style) {
    if (style.fontWeight) {
      const fw = style.fontWeight.trim().toLowerCase();
      if (fw === 'bold' || fw === 'bolder') {
        next.bold = true;
      } else if (fw === 'normal' || fw === 'lighter') {
        next.bold = false;
      } else {
        const num = parseInt(fw, 10);
        if (!Number.isNaN(num)) {
          next.bold = num >= 600;
        }
      }
    }

    if (style.fontStyle) {
      const fs = style.fontStyle.trim().toLowerCase();
      if (fs === 'italic' || fs === 'oblique') {
        next.italic = true;
      } else if (fs === 'normal') {
        next.italic = false;
      }
    }

    const td = (style.textDecorationLine || style.textDecoration || '').trim().toLowerCase();
    if (td) {
      if (td.includes('underline')) {
        next.underline = true;
      } else if (td === 'none') {
        next.underline = false;
      }
    }
  }

  return next;
}

function getListMarker(olEl: HTMLElement, index: number, depth: number): string {
  const typeAttr = olEl.getAttribute('type') || '';
  const listStyle = (olEl.style?.listStyleType || '').toLowerCase();
  const startAttr = parseInt(olEl.getAttribute('start') || '1', 10);
  const num = (Number.isNaN(startAttr) ? 1 : startAttr) + index;

  if (typeAttr === 'a' || listStyle === 'lower-alpha' || listStyle === 'lower-latin') {
    const letter = String.fromCharCode(97 + ((num - 1) % 26));
    return `${letter}. `;
  }
  if (typeAttr === 'A' || listStyle === 'upper-alpha' || listStyle === 'upper-latin') {
    const letter = String.fromCharCode(65 + ((num - 1) % 26));
    return `${letter}. `;
  }
  if (!typeAttr && !listStyle && depth > 0) {
    const letter = String.fromCharCode(97 + ((num - 1) % 26));
    return `${letter}. `;
  }
  return `${num}. `;
}

function isOnlySingleBr(el: HTMLElement): boolean {
  const meaningful = Array.from(el.childNodes).filter((n) => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').trim() !== '';
    return n.nodeType === Node.ELEMENT_NODE;
  });
  return (
    meaningful.length === 1 &&
    meaningful[0].nodeType === Node.ELEMENT_NODE &&
    (meaningful[0] as HTMLElement).tagName.toUpperCase() === 'BR'
  );
}

function collectDirectTableRows(tableEl: HTMLElement): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];
  for (const child of Array.from(tableEl.children)) {
    const tag = child.tagName.toUpperCase();
    if (tag === 'TR') {
      rows.push(child as HTMLTableRowElement);
    } else if (tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT') {
      for (const grandChild of Array.from(child.children)) {
        if (grandChild.tagName.toUpperCase() === 'TR') {
          rows.push(grandChild as HTMLTableRowElement);
        }
      }
    }
  }
  return rows;
}

function parseTableElement(tableEl: HTMLElement): RichTable | null {
  const trElements = collectDirectTableRows(tableEl);
  const rows: RichTableCell[][] = [];

  for (const tr of trElements) {
    const inThead = tr.parentElement?.tagName.toUpperCase() === 'THEAD';
    const cells: RichTableCell[] = [];

    for (const child of Array.from(tr.children)) {
      const tag = child.tagName.toUpperCase();
      if (tag === 'TD' || tag === 'TH') {
        const cellEl = child as HTMLElement;
        const isHeader = tag === 'TH' || inThead;
        const cellLines = trimRichText(htmlToRichLines(cellEl.innerHTML));
        cells.push({
          lines: cellLines.length > 0 ? cellLines : [[]],
          ...(isHeader ? { isHeader: true } : {}),
        });
      }
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) return null;
  return { type: 'table', rows };
}

/**
 * Parses HTML into RichContentNode[] preserving both formatted lines (bold/italic/underline)
 * and tables (<table>).
 */
export function htmlToRichNodes(html: string): RichContentNode[] {
  if (!html) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nodes: RichContentNode[] = [];
  let currentLine: RichLine = [];

  const flushLine = (forceEmpty = false) => {
    const merged = mergeAdjacentSpans(currentLine);
    if (merged.length > 0 || forceEmpty) {
      nodes.push({ type: 'line', spans: merged });
    }
    currentLine = [];
  };

  const pushSpan = (text: string, flags: FormatFlags) => {
    if (!text) return;
    currentLine.push({
      text,
      ...(flags.bold ? { bold: true } : {}),
      ...(flags.italic ? { italic: true } : {}),
      ...(flags.underline ? { underline: true } : {}),
    });
  };

  const walk = (
    node: Node,
    flags: FormatFlags,
    olDepth: number,
    inPre: boolean
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent || '';
      if (!inPre) {
        if (/^[\r\n\t ]+$/.test(text) && text.includes('\n')) {
          return;
        }
        text = text.replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ');
      }
      if (text.includes('\n')) {
        const parts = text.split('\n');
        parts.forEach((part, idx) => {
          if (idx > 0) flushLine(true);
          pushSpan(part, flags);
        });
      } else {
        pushSpan(text, flags);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (SKIP_TAGS.has(tag)) return;

    if (tag === 'TABLE') {
      if (currentLine.length > 0) {
        flushLine(false);
      }
      const parsedTable = parseTableElement(el);
      if (parsedTable) {
        nodes.push(parsedTable);
      }
      return;
    }

    if (tag === 'BR') {
      flushLine(true);
      return;
    }

    const nextFlags = getUpdatedFlags(el, flags);
    const nextInPre = inPre || tag === 'PRE';

    if (tag === 'OL') {
      let liIndex = 0;
      for (const child of Array.from(el.childNodes)) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child as HTMLElement).tagName.toUpperCase() === 'LI'
        ) {
          const liEl = child as HTMLElement;
          if (currentLine.length > 0) {
            flushLine(false);
          }
          const liText = (liEl.textContent || '').trim();
          const alreadyPrefixed =
            /^\d+[\.\)\-]\s*/.test(liText) || /^[a-eA-E][\.\)\-]\s*/.test(liText);
          if (!alreadyPrefixed) {
            const marker = getListMarker(el, liIndex, olDepth);
            pushSpan(marker, { bold: false, italic: false, underline: false });
          }
          liIndex++;
          for (const liChild of Array.from(liEl.childNodes)) {
            walk(liChild, getUpdatedFlags(liEl, nextFlags), olDepth + 1, nextInPre);
          }
          if (currentLine.length > 0) flushLine(false);
        } else {
          walk(child, nextFlags, olDepth + 1, nextInPre);
        }
      }
      return;
    }

    if (tag === 'UL') {
      for (const child of Array.from(el.childNodes)) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child as HTMLElement).tagName.toUpperCase() === 'LI'
        ) {
          const liEl = child as HTMLElement;
          if (currentLine.length > 0) {
            flushLine(false);
          }
          for (const liChild of Array.from(liEl.childNodes)) {
            walk(liChild, getUpdatedFlags(liEl, nextFlags), olDepth, nextInPre);
          }
          if (currentLine.length > 0) flushLine(false);
        } else {
          walk(child, nextFlags, olDepth, nextInPre);
        }
      }
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);

    if (isBlock && currentLine.length > 0) {
      flushLine(false);
    }

    if (isBlock && isOnlySingleBr(el)) {
      flushLine(true);
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, nextFlags, olDepth, nextInPre);
    }

    if (isBlock && currentLine.length > 0) {
      flushLine(false);
    }
  };

  walk(doc.body, { bold: false, italic: false, underline: false }, 0, false);

  if (currentLine.length > 0) {
    flushLine(false);
  }

  while (nodes.length > 0 && isEmptyLineNode(nodes[nodes.length - 1])) {
    nodes.pop();
  }

  return nodes;
}

/**
 * Parses HTML into plain RichText lines (flattening any tables with ` | ` separators).
 */
export function htmlToRichLines(html: string): RichText {
  return richNodesToRichText(htmlToRichNodes(html), true);
}

export async function copyRichNodesToClipboard(nodes: RichContentNode[]): Promise<boolean> {
  const plain = richNodesToPlain(nodes, true);
  const html = `<div style="font-family:inherit;font-size:inherit;">${richNodesToHtml(
    nodes,
    true
  )}</div>`;

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Fallback below
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plain);
    return false;
  }

  return false;
}

export async function copyRichTextToClipboard(lines: RichText): Promise<boolean> {
  return copyRichNodesToClipboard(lines.map((spans) => ({ type: 'line', spans })));
}
