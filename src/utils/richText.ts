export type TextSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type RichLine = TextSpan[];
export type RichText = RichLine[];

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

export function getFormattingSummary(lines: RichText): string[] {
  let bold = false;
  let italic = false;
  let underline = false;
  for (const line of lines) {
    for (const span of line) {
      if (span.bold) bold = true;
      if (span.italic) italic = true;
      if (span.underline) underline = true;
    }
  }
  const tags: string[] = [];
  if (bold) tags.push('Bold');
  if (italic) tags.push('Italic');
  if (underline) tags.push('Underline');
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

export function richTextToEditorHtml(lines: RichText): string {
  if (lines.length === 0) return '';
  return lines
    .map((line) => {
      const inner = richLineToHtml(line);
      return `<div>${inner || '<br>'}</div>`;
    })
    .join('');
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

/**
 * Removes a regex match (such as `[Gambar: ...]`) across spans in RichText
 * while keeping surrounding rich formatting intact.
 */
export function removeRegexFromRichText(lines: RichText, regex: RegExp): RichText {
  return lines
    .map((line) => {
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
    })
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1));
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

const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'HEAD', 'META', 'LINK', 'XML', 'TITLE', 'NOSCRIPT']);

function getUpdatedFlags(el: HTMLElement, current: FormatFlags): FormatFlags {
  const next = { ...current };
  const tag = el.tagName.toUpperCase();

  if (tag === 'B' || tag === 'STRONG') {
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

/**
 * Parses HTML (including Microsoft Word, Google Docs, Mammoth DOCX HTML, and contentEditable HTML)
 * into clean RichText lines preserving bold, italic, and underline.
 */
export function htmlToRichLines(html: string): RichText {
  if (!html) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const lines: RichLine[] = [[]];

  const pushSpan = (text: string, flags: FormatFlags) => {
    if (!text) return;
    const currentLine = lines[lines.length - 1];
    currentLine.push({
      text,
      ...(flags.bold ? { bold: true } : {}),
      ...(flags.italic ? { italic: true } : {}),
      ...(flags.underline ? { underline: true } : {}),
    });
  };

  const pushNewLine = () => {
    lines.push([]);
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
        // Ignore pure inter-tag formatting newlines from HTML source
        if (/^[\r\n\t ]+$/.test(text) && text.includes('\n')) {
          return;
        }
        text = text.replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ');
      }
      if (text.includes('\n')) {
        const parts = text.split('\n');
        parts.forEach((part, idx) => {
          if (idx > 0) pushNewLine();
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

    if (tag === 'BR') {
      pushNewLine();
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
          if (lines[lines.length - 1].length > 0) {
            pushNewLine();
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
          pushNewLine();
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
          if (lines[lines.length - 1].length > 0) {
            pushNewLine();
          }
          for (const liChild of Array.from(liEl.childNodes)) {
            walk(liChild, getUpdatedFlags(liEl, nextFlags), olDepth, nextInPre);
          }
          pushNewLine();
        } else {
          walk(child, nextFlags, olDepth, nextInPre);
        }
      }
      return;
    }

    const isBlock = BLOCK_TAGS.has(tag);

    if (isBlock && lines[lines.length - 1].length > 0) {
      pushNewLine();
    }

    if (isBlock && isOnlySingleBr(el)) {
      pushNewLine();
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, nextFlags, olDepth, nextInPre);
    }

    if (isBlock && lines[lines.length - 1].length > 0) {
      pushNewLine();
    }
  };

  walk(doc.body, { bold: false, italic: false, underline: false }, 0, false);

  const merged = lines.map(mergeAdjacentSpans);
  // Remove trailing empty line caused by closing block tag
  while (merged.length > 0 && merged[merged.length - 1].length === 0) {
    merged.pop();
  }
  return merged;
}

export function plainTextToRichLines(text: string): RichText {
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => (line ? [{ text: line }] : []));
}

/**
 * Copies rich text to clipboard as both text/html and text/plain so pasting into
 * iSpring QuizMaker or MS Word preserves Bold, Italic, and Underline.
 */
export async function copyRichTextToClipboard(lines: RichText): Promise<boolean> {
  const plain = richTextToPlain(lines);
  const html = `<div style="font-family:inherit;font-size:inherit;">${richTextToHtml(lines)}</div>`;

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
