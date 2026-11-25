import '../polyfills';
import katex from 'katex';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { MathML } from 'mathjax-full/js/input/mathml.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { SerializedMmlVisitor } from 'mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js';
import { STATE } from 'mathjax-full/js/core/MathItem.js';
import { MmlNode } from 'mathjax-full/js/core/MmlTree/MmlNode.js';
import { tex2typst, typst2tex } from 'tex2typst/src/index.ts';
import { asciiMathToLatex } from './asciimathParser';
import type { RichContentNode, RichText } from './richText';

export type MathFormat = 'latex' | 'asciimath' | 'typst' | 'mathml';
export type MathRenderEngine = 'katex' | 'mathjax';
export type DollarSyntaxMode = 'auto' | 'latex' | 'typst';
export type MathExportMode = 'unicode' | 'image' | 'raw';

export type TextOrMathSegment =
  | { type: 'text'; text: string }
  | {
      type: 'math';
      raw: string;
      code: string;
      format: MathFormat;
      display: boolean;
    };

type MathJaxBundle = {
  adaptor: ReturnType<typeof liteAdaptor>;
  texDoc: ReturnType<typeof mathjax.document>;
  mmlDoc: ReturnType<typeof mathjax.document>;
  visitor: SerializedMmlVisitor;
};

let mjBundle: MathJaxBundle | null = null;

function getMathJax(): MathJaxBundle {
  if (mjBundle) return mjBundle;

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);

  const svgJax = new SVG({ fontCache: 'none' });

  const texDoc = mathjax.document('', {
    InputJax: new TeX({ packages: AllPackages }),
    OutputJax: svgJax,
  });

  const mmlDoc = mathjax.document('', {
    InputJax: new MathML(),
    OutputJax: new SVG({ fontCache: 'none' }),
  });

  const visitor = new SerializedMmlVisitor();

  mjBundle = { adaptor, texDoc, mmlDoc, visitor };
  return mjBundle;
}

const TYPST_HINT_REGEX =
  /\b(?:frac|sqrt|binom|cases|mat|vec|hat|bar|tilde|dot|ddot|abs|norm|floor|ceil|integral|oo|infinity|sum|product|lim|diff|partial)\s*\(|\b(?:oo|infinity|alpha|beta|gamma|delta|theta|lambda|sigma|pi|omega|in|notin|subset|union|sect|exists|forall)\b|_\(|\^\(|->|=>|<=|>=|!=/;

export function detectDollarFormat(
  inner: string,
  defaultDollarSyntax: DollarSyntaxMode
): 'latex' | 'typst' {
  if (defaultDollarSyntax === 'latex') return 'latex';
  if (defaultDollarSyntax === 'typst') return 'typst';

  // Auto detection
  if (inner.includes('\\')) return 'latex';
  if (TYPST_HINT_REGEX.test(inner)) return 'typst';
  // Typst display/spaced syntax `$ x^2 + 1 $` without backslashes
  if (/^\s+.*\s+$/.test(inner) && !inner.includes('{')) return 'typst';
  return 'latex';
}

const MATH_TOKEN_REGEX =
  /(<math\b[\s\S]*?<\/math>)|\[typst-block\]([\s\S]*?)\[\/typst-block\]|\[typst\]([\s\S]*?)\[\/typst\]|\[(?:am|asciimath)\]([\s\S]*?)\[\/(?:am|asciimath)\]|\[tex\]([\s\S]*?)\[\/tex\]|\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|`([^`\n]+)`|\$([^\$\n]+?)\$/gi;

export function splitTextWithMath(
  text: string,
  defaultDollarSyntax: DollarSyntaxMode = 'auto'
): TextOrMathSegment[] {
  if (!text) return [];
  const segments: TextOrMathSegment[] = [];
  let lastIndex = 0;

  MATH_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MATH_TOKEN_REGEX.exec(text)) !== null) {
    const matchStart = match.index;
    const raw = match[0];

    // Guard against currency like "$10 and $20"
    if (match[10] !== undefined) {
      const inner = match[10];
      if (/^\d[\d.,]*\s+/.test(inner) || !inner.trim()) {
        continue;
      }
    }

    if (matchStart > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, matchStart) });
    }

    if (match[1] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[1].trim(),
        format: 'mathml',
        display: match[1].includes('display="block"'),
      });
    } else if (match[2] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[2].trim(),
        format: 'typst',
        display: true,
      });
    } else if (match[3] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[3].trim(),
        format: 'typst',
        display: false,
      });
    } else if (match[4] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[4].trim(),
        format: 'asciimath',
        display: false,
      });
    } else if (match[5] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[5].trim(),
        format: 'latex',
        display: false,
      });
    } else if (match[6] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[6].trim(),
        format: 'latex',
        display: true,
      });
    } else if (match[7] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[7].trim(),
        format: 'latex',
        display: true,
      });
    } else if (match[8] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[8].trim(),
        format: 'latex',
        display: false,
      });
    } else if (match[9] !== undefined) {
      segments.push({
        type: 'math',
        raw,
        code: match[9].trim(),
        format: 'asciimath',
        display: false,
      });
    } else if (match[10] !== undefined) {
      const inner = match[10];
      const fmt = detectDollarFormat(inner, defaultDollarSyntax);
      segments.push({
        type: 'math',
        raw,
        code: inner.trim(),
        format: fmt,
        display: fmt === 'typst' && /^\s+.*\s+$/.test(inner),
      });
    }

    lastIndex = matchStart + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments;
}

export function hasMathInText(
  text: string,
  defaultDollarSyntax: DollarSyntaxMode = 'auto'
): boolean {
  return splitTextWithMath(text, defaultDollarSyntax).some((s) => s.type === 'math');
}

export function hasMathInRichText(
  lines: RichText,
  defaultDollarSyntax: DollarSyntaxMode = 'auto'
): boolean {
  return lines.some((line) =>
    hasMathInText(line.map((s) => s.text).join(''), defaultDollarSyntax)
  );
}

export function hasMathInNodes(
  nodes: RichContentNode[],
  defaultDollarSyntax: DollarSyntaxMode = 'auto'
): boolean {
  return nodes.some((node) => {
    if (node.type === 'line') {
      return hasMathInText(
        node.spans.map((s) => s.text).join(''),
        defaultDollarSyntax
      );
    }
    if (node.type === 'table') {
      return node.rows.some((row) =>
        row.some((cell) => hasMathInRichText(cell.lines, defaultDollarSyntax))
      );
    }
    return false;
  });
}

export function convertAsciiMathToLatex(asciiCode: string): string {
  return asciiMathToLatex(asciiCode);
}

export function convertTypstToLatex(typstCode: string): string {
  try {
    return typst2tex(typstCode, { blockMathMode: true }).trim();
  } catch {
    return typstCode;
  }
}

export function convertLatexToTypst(latexCode: string): string {
  try {
    return tex2typst(latexCode).trim();
  } catch {
    return latexCode;
  }
}

function toTexIfPossible(code: string, format: MathFormat): string {
  if (format === 'typst') return convertTypstToLatex(code);
  if (format === 'asciimath') return convertAsciiMathToLatex(code);
  return code;
}

export function convertMathToMathML(
  code: string,
  format: MathFormat,
  display = false
): string {
  if (!code.trim()) return '';
  if (format === 'mathml') return code.trim();

  const tex = toTexIfPossible(code, format);
  try {
    const { texDoc, visitor } = getMathJax();
    const mmlNode = texDoc.convert(tex, {
      display,
      end: STATE.CONVERT,
    }) as MmlNode;
    return visitor.visitTree(mmlNode);
  } catch {
    try {
      return katex.renderToString(tex, {
        output: 'mathml',
        displayMode: display,
        throwOnError: false,
      });
    } catch {
      return '';
    }
  }
}

export function renderMathToSvg(
  code: string,
  format: MathFormat,
  display = false
): string {
  if (!code.trim()) return '';
  const { adaptor, texDoc, mmlDoc } = getMathJax();

  let container: unknown;
  if (format === 'mathml') {
    container = mmlDoc.convert(code, { display });
  } else {
    const tex = toTexIfPossible(code, format);
    container = texDoc.convert(tex, { display });
  }

  const inner = adaptor.innerHTML(container as Parameters<typeof adaptor.innerHTML>[0]);
  return inner;
}

export function renderMathToHtml(
  code: string,
  format: MathFormat,
  engine: MathRenderEngine,
  display = false
): { html: string; isSvg: boolean; error?: string } {
  if (!code.trim()) return { html: '', isSvg: false };

  try {
    if (engine === 'katex' && format !== 'mathml') {
      const tex = toTexIfPossible(code, format);
      const html = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        output: 'htmlAndMathml',
        strict: false,
      });
      return { html, isSvg: false };
    }

    // Use MathJax SVG for MathJax engine and MathML
    const svg = renderMathToSvg(code, format, display);
    return { html: svg, isSvg: true };
  } catch (err: any) {
    return {
      html: '',
      isSvg: false,
      error: err?.message || 'Gagal merender rumus',
    };
  }
}

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ',
  'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ',
  'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ',
  'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
  'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ',
};

const COMMON_FRACTIONS: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
  '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
  '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
};

const LATEX_SYMBOLS: [RegExp, string][] = [
  [/\\times\b/g, '×'],
  [/\\cdot\b/g, '·'],
  [/\\div\b/g, '÷'],
  [/\\pm\b/g, '±'],
  [/\\mp\b/g, '∓'],
  [/\\leq?\b/g, '≤'],
  [/\\geq?\b/g, '≥'],
  [/\\neq?\b/g, '≠'],
  [/\\approx\b/g, '≈'],
  [/\\equiv\b/g, '≡'],
  [/\\propto\b/g, '∝'],
  [/\\infty\b/g, '∞'],
  [/\\sum\b/g, '∑'],
  [/\\prod\b/g, '∏'],
  [/\\int\b/g, '∫'],
  [/\\oint\b/g, '∮'],
  [/\\partial\b/g, '∂'],
  [/\\nabla\b/g, '∇'],
  [/\\forall\b/g, '∀'],
  [/\\exists\b/g, '∃'],
  [/\\in\b/g, '∈'],
  [/\\notin\b/g, '∉'],
  [/\\subset\b/g, '⊂'],
  [/\\subseteq\b/g, '⊆'],
  [/\\cup\b/g, '∪'],
  [/\\cap\b/g, '∩'],
  [/\\emptyset\b/g, '∅'],
  [/\\rightarrow\b|\\to\b/g, '→'],
  [/\\leftarrow\b/g, '←'],
  [/\\leftrightarrow\b/g, '↔'],
  [/\\Rightarrow\b/g, '⇒'],
  [/\\Leftrightarrow\b/g, '⇔'],
  [/\\degree\b|\^\{\\circ\}|\^\\circ/g, '°'],
  [/\\angle\b/g, '∠'],
  [/\\triangle\b/g, '△'],
  [/\\perp\b/g, '⊥'],
  [/\\parallel\b/g, '∥'],
  [/\\alpha\b/g, 'α'],
  [/\\beta\b/g, 'β'],
  [/\\gamma\b/g, 'γ'],
  [/\\delta\b/g, 'δ'],
  [/\\epsilon\b|\\varepsilon\b/g, 'ε'],
  [/\\zeta\b/g, 'ζ'],
  [/\\eta\b/g, 'η'],
  [/\\theta\b/g, 'θ'],
  [/\\iota\b/g, 'ι'],
  [/\\kappa\b/g, 'κ'],
  [/\\lambda\b/g, 'λ'],
  [/\\mu\b/g, 'μ'],
  [/\\nu\b/g, 'ν'],
  [/\\xi\b/g, 'ξ'],
  [/\\pi\b/g, 'π'],
  [/\\rho\b/g, 'ρ'],
  [/\\sigma\b/g, 'σ'],
  [/\\tau\b/g, 'τ'],
  [/\\phi\b|\\varphi\b/g, 'φ'],
  [/\\chi\b/g, 'χ'],
  [/\\psi\b/g, 'ψ'],
  [/\\omega\b/g, 'ω'],
  [/\\Gamma\b/g, 'Γ'],
  [/\\Delta\b/g, 'Δ'],
  [/\\Theta\b/g, 'Θ'],
  [/\\Lambda\b/g, 'Λ'],
  [/\\Pi\b/g, 'Π'],
  [/\\Sigma\b/g, 'Σ'],
  [/\\Phi\b/g, 'Φ'],
  [/\\Psi\b/g, 'Ψ'],
  [/\\Omega\b/g, 'Ω'],
  [/\\ldots\b|\\cdots\b/g, '…'],
  [/\\left|\\right/g, ''],
  [/\\,|\\;|\\:|\\!/g, ' '],
  [/\\text\{([^{}]*)\}|\\mathrm\{([^{}]*)\}|\\mathbf\{([^{}]*)\}/g, '$1$2$3'],
];

function toScriptChars(str: string, map: Record<string, string>): string | null {
  let out = '';
  for (const ch of str) {
    if (map[ch]) out += map[ch];
    else return null;
  }
  return out;
}

function latexToUnicode(tex: string): string {
  let s = tex.trim();

  for (const [pattern, rep] of LATEX_SYMBOLS) {
    s = s.replace(pattern, rep);
  }

  for (let pass = 0; pass < 4; pass++) {
    // Roots: \sqrt[n]{x} and \sqrt{x}
    s = s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, (_, n, x) => {
      const sup = toScriptChars(n.trim(), SUPERSCRIPT_MAP);
      return `${sup ? sup : n}√(${x})`;
    });
    s = s.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');

    // Superscripts & subscripts
    s = s.replace(/\^\{([^{}]+)\}/g, (_, exp) => toScriptChars(exp.trim(), SUPERSCRIPT_MAP) ?? `^(${exp})`);
    s = s.replace(/\^([A-Za-z0-9+\-])/g, (_, ch) => SUPERSCRIPT_MAP[ch] ?? `^${ch}`);
    s = s.replace(/_\{([^{}]+)\}/g, (_, sub) => toScriptChars(sub.trim(), SUBSCRIPT_MAP) ?? `_(${sub})`);
    s = s.replace(/_([A-Za-z0-9+\-])/g, (_, ch) => SUBSCRIPT_MAP[ch] ?? `_${ch}`);

    // Fractions: \frac{a}{b}
    s = s.replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, num, den) => {
      const n = num.trim();
      const d = den.trim();
      const key = `${n}/${d}`;
      if (COMMON_FRACTIONS[key]) return COMMON_FRACTIONS[key];
      const nWrap = /[+\-\s]/.test(n) ? `(${n})` : n;
      const dWrap = /[+\-\s]/.test(d) ? `(${d})` : d;
      return `${nWrap}/${dWrap}`;
    });
  }

  // Clean remaining TeX commands & braces
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');
  s = s.replace(/[{}]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function mathmlToPlainUnicode(mml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(mml, 'text/html');
    const mathEl = doc.querySelector('math');
    if (!mathEl) return mml.replace(/<[^>]+>/g, '').trim();

    const walkMml = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || '').trim();
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const children = Array.from(el.children);

      if (tag === 'mfrac' && children.length >= 2) {
        const num = walkMml(children[0]);
        const den = walkMml(children[1]);
        const key = `${num}/${den}`;
        return COMMON_FRACTIONS[key] || `${num}/${den}`;
      }
      if (tag === 'msqrt') {
        return `√(${Array.from(el.childNodes).map(walkMml).join('')})`;
      }
      if (tag === 'mroot' && children.length >= 2) {
        const base = walkMml(children[0]);
        const idx = walkMml(children[1]);
        const sup = toScriptChars(idx, SUPERSCRIPT_MAP) ?? idx;
        return `${sup}√(${base})`;
      }
      if (tag === 'msup' && children.length >= 2) {
        const base = walkMml(children[0]);
        const exp = walkMml(children[1]);
        return `${base}${toScriptChars(exp, SUPERSCRIPT_MAP) ?? `^${exp}`}`;
      }
      if (tag === 'msub' && children.length >= 2) {
        const base = walkMml(children[0]);
        const sub = walkMml(children[1]);
        return `${base}${toScriptChars(sub, SUBSCRIPT_MAP) ?? `_${sub}`}`;
      }
      if (tag === 'msubsup' && children.length >= 3) {
        const base = walkMml(children[0]);
        const sub = walkMml(children[1]);
        const sup = walkMml(children[2]);
        return `${base}${toScriptChars(sub, SUBSCRIPT_MAP) ?? `_${sub}`}${toScriptChars(sup, SUPERSCRIPT_MAP) ?? `^${sup}`}`;
      }
      return Array.from(el.childNodes).map(walkMml).join('');
    };

    return walkMml(mathEl).replace(/\s+/g, ' ').trim();
  } catch {
    return mml.replace(/<[^>]+>/g, '').trim();
  }
}

export function mathToUnicode(code: string, format: MathFormat): string {
  if (!code.trim()) return '';

  if (format === 'latex') {
    return latexToUnicode(code);
  }
  if (format === 'typst') {
    return latexToUnicode(convertTypstToLatex(code));
  }
  if (format === 'mathml') {
    return mathmlToPlainUnicode(code);
  }
  if (format === 'asciimath') {
    return latexToUnicode(convertAsciiMathToLatex(code));
  }
  return code;
}

export function replaceMathInTextWithUnicode(
  text: string,
  defaultDollarSyntax: DollarSyntaxMode = 'auto'
): string {
  const segments = splitTextWithMath(text, defaultDollarSyntax);
  if (!segments.some((s) => s.type === 'math')) return text;

  return segments
    .map((seg) =>
      seg.type === 'text' ? seg.text : mathToUnicode(seg.code, seg.format)
    )
    .join('');
}

export function replaceMathInRichTextWithUnicode(
  lines: RichText,
  defaultDollarSyntax: DollarSyntaxMode = 'auto'
): RichText {
  return lines.map((line) =>
    line.map((span) => ({
      ...span,
      text: replaceMathInTextWithUnicode(span.text, defaultDollarSyntax),
    }))
  );
}
