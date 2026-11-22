// Strict-mode, browser-safe recursive-descent AsciiMath to LaTeX converter.
// Converts standard AsciiMath syntax into clean LaTeX for KaTeX, MathJax TeX/SVG/MathML, Typst, and Unicode conversion.

type Token =
  | { type: 'text'; value: string }
  | { type: 'symbol'; value: string }
  | { type: 'lparen'; value: string; latexLeft: string; latexRight: string; isInvisible?: boolean }
  | { type: 'rparen'; value: string }
  | { type: 'op'; value: string } // '/', '^', '_', ',' , ';'
  | { type: 'ident'; value: string }
  | { type: 'number'; value: string };

const SYMBOL_MAP: Record<string, string> = {
  // Operators & Arithmetic
  '+-': '\\pm',
  '-+': '\\mp',
  'xx': '\\times',
  '-:': '\\div',
  '***': '\\star',
  '**': '\\ast',
  '*': '\\cdot',
  '//': '/',
  '\\\\': '\\backslash',
  'setminus': '\\setminus',
  'cdot': '\\cdot',
  'times': '\\times',
  'div': '\\div',
  'pm': '\\pm',
  'mp': '\\mp',
  'o+': '\\oplus',
  'ox': '\\otimes',
  'o.': '\\odot',
  '@': '\\circ',
  'deg': '^{\\circ}',

  // Relations
  '!=': '\\neq',
  '<=': '\\le',
  'le': '\\le',
  '>=': '\\ge',
  'ge': '\\ge',
  '-<': '\\prec',
  '>-': '\\succ',
  '-<=': '\\preceq',
  '>-=': '\\succeq',
  '-=': '\\equiv',
  '~=': '\\cong',
  '~~': '\\approx',
  'prop': '\\propto',
  'lt': '<',
  'gt': '>',

  // Arrows
  '<=>': '\\Leftrightarrow',
  '=>': '\\Rightarrow',
  '->': '\\to',
  '<-': '\\leftarrow',
  '<->': '\\leftrightarrow',
  '|->': '\\mapsto',
  '>->': '\\rightarrowtail',
  '->>': '\\twoheadrightarrow',
  'uarr': '\\uparrow',
  'darr': '\\downarrow',
  'rarr': '\\rightarrow',
  'larr': '\\leftarrow',
  'harr': '\\leftrightarrow',
  'rArr': '\\Rightarrow',
  'lArr': '\\Leftarrow',
  'hArr': '\\Leftrightarrow',

  // Logic & Sets
  'AA': '\\forall',
  'EE': '\\exists',
  '!in': '\\notin',
  'notin': '\\notin',
  'in': '\\in',
  'sube': '\\subseteq',
  'supe': '\\supseteq',
  'sub': '\\subset',
  'sup': '\\supset',
  'uuu': '\\bigcup',
  'nnn': '\\bigcap',
  'uu': '\\cup',
  'nn': '\\cap',
  'vvv': '\\bigvee',
  '^^^': '\\bigwedge',
  'vv': '\\vee',
  '^^': '\\wedge',
  'not': '\\neg',
  'O/': '\\emptyset',
  'emptyset': '\\emptyset',
  'implies': '\\implies',
  'iff': '\\iff',
  'CC': '\\mathbb{C}',
  'NN': '\\mathbb{N}',
  'QQ': '\\mathbb{Q}',
  'RR': '\\mathbb{R}',
  'ZZ': '\\mathbb{Z}',

  // Calculus & Big operators
  'oo': '\\infty',
  'infty': '\\infty',
  'infinity': '\\infty',
  'del': '\\partial',
  'partial': '\\partial',
  'grad': '\\nabla',
  'nabla': '\\nabla',
  'aleph': '\\aleph',
  'sum': '\\sum',
  'prod': '\\prod',
  'int': '\\int',
  'oint': '\\oint',
  'lim': '\\lim',
  'vdots': '\\vdots',
  'ddots': '\\ddots',
  'cdots': '\\cdots',
  '...': '\\ldots',
  'quad': '\\quad',
  'qquad': '\\qquad',
  'therefore': '\\therefore',
  ':.': '\\therefore',
  'because': '\\because',
  ":'": '\\because',

  // Geometry
  '/_': '\\angle',
  '_|_': '\\perp',
  '/_\\': '\\triangle',
  'diamond': '\\diamond',
  'square': '\\square',
  'parallel': '\\parallel',
  'triangle': '\\triangle',

  // Standard Functions
  'sin': '\\sin',
  'cos': '\\cos',
  'tan': '\\tan',
  'csc': '\\csc',
  'sec': '\\sec',
  'cot': '\\cot',
  'arcsin': '\\arcsin',
  'arccos': '\\arccos',
  'arctan': '\\arctan',
  'sinh': '\\sinh',
  'cosh': '\\cosh',
  'tanh': '\\tanh',
  'log': '\\log',
  'ln': '\\ln',
  'exp': '\\exp',
  'det': '\\det',
  'dim': '\\dim',
  'mod': '\\bmod',
  'gcd': '\\gcd',
  'max': '\\max',
  'min': '\\min',
  'arg': '\\arg',
  'ker': '\\ker',

  // Greek letters
  'alpha': '\\alpha',
  'beta': '\\beta',
  'gamma': '\\gamma',
  'Gamma': '\\Gamma',
  'delta': '\\delta',
  'Delta': '\\Delta',
  'epsilon': '\\epsilon',
  'varepsilon': '\\varepsilon',
  'zeta': '\\zeta',
  'eta': '\\eta',
  'theta': '\\theta',
  'Theta': '\\Theta',
  'vartheta': '\\vartheta',
  'iota': '\\iota',
  'kappa': '\\kappa',
  'lambda': '\\lambda',
  'Lambda': '\\Lambda',
  'mu': '\\mu',
  'nu': '\\nu',
  'xi': '\\xi',
  'Xi': '\\Xi',
  'pi': '\\pi',
  'Pi': '\\Pi',
  'rho': '\\rho',
  'sigma': '\\sigma',
  'Sigma': '\\Sigma',
  'tau': '\\tau',
  'upsilon': '\\upsilon',
  'phi': '\\phi',
  'Phi': '\\Phi',
  'varphi': '\\varphi',
  'chi': '\\chi',
  'psi': '\\psi',
  'Psi': '\\Psi',
  'omega': '\\omega',
  'Omega': '\\Omega',
};

const MULTI_CHAR_SYMBOLS = Object.keys(SYMBOL_MAP).sort((a, b) => b.length - a.length);

const UNARY_FUNCS: Record<string, (arg: string) => string> = {
  sqrt: (a) => `\\sqrt{${a}}`,
  hat: (a) => `\\hat{${a}}`,
  bar: (a) => `\\overline{${a}}`,
  vec: (a) => `\\vec{${a}}`,
  dot: (a) => `\\dot{${a}}`,
  ddot: (a) => `\\ddot{${a}}`,
  tilde: (a) => `\\tilde{${a}}`,
  ul: (a) => `\\underline{${a}}`,
  ubrace: (a) => `\\underbrace{${a}}`,
  obrace: (a) => `\\overbrace{${a}}`,
  cancel: (a) => `\\cancel{${a}}`,
  abs: (a) => `\\left|${a}\\right|`,
  norm: (a) => `\\left\\|${a}\\right\\|`,
  floor: (a) => `\\left\\lfloor ${a} \\right\\rfloor`,
  ceil: (a) => `\\left\\lceil ${a} \\right\\rceil`,
  text: (a) => `\\text{${a}}`,
  mbox: (a) => `\\text{${a}}`,
  bb: (a) => `\\mathbb{${a}}`,
  bf: (a) => `\\mathbf{${a}}`,
  it: (a) => `\\mathit{${a}}`,
  rm: (a) => `\\mathrm{${a}}`,
  cc: (a) => `\\mathcal{${a}}`,
  cal: (a) => `\\mathcal{${a}}`,
  tt: (a) => `\\texttt{${a}}`,
  sf: (a) => `\\mathsf{${a}}`,
  fr: (a) => `\\mathfrak{${a}}`,
};

const BINARY_FUNCS: Record<string, (a: string, b: string) => string> = {
  frac: (a, b) => `\\frac{${a}}{${b}}`,
  root: (n, x) => `\\sqrt[${n}]{${x}}`,
  stackrel: (a, b) => `\\stackrel{${a}}{${b}}`,
  overset: (a, b) => `\\overset{${a}}{${b}}`,
  underset: (a, b) => `\\underset{${a}}{${b}}`,
  color: (c, x) => `{\\color{${c}}{${x}}}`,
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Quoted text: "..."
    if (ch === '"') {
      const end = input.indexOf('"', i + 1);
      const val = end === -1 ? input.slice(i + 1) : input.slice(i + 1, end);
      tokens.push({ type: 'text', value: val });
      i = end === -1 ? input.length : end + 1;
      continue;
    }

    // Left / Right multi-char brackets
    if (input.startsWith('{:', i)) {
      tokens.push({ type: 'lparen', value: '{:', latexLeft: '', latexRight: '', isInvisible: true });
      i += 2;
      continue;
    }
    if (input.startsWith(':}', i)) {
      tokens.push({ type: 'rparen', value: ':}' });
      i += 2;
      continue;
    }
    if (input.startsWith('(:', i) || input.startsWith('<<', i)) {
      const tok = input.slice(i, i + 2);
      tokens.push({ type: 'lparen', value: tok, latexLeft: '\\langle', latexRight: '\\rangle' });
      i += 2;
      continue;
    }
    if (input.startsWith(':)', i) || input.startsWith('>>', i)) {
      tokens.push({ type: 'rparen', value: input.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if (input.startsWith('||', i)) {
      tokens.push({ type: 'symbol', value: '\\|' });
      i += 2;
      continue;
    }
    if (input.startsWith('|__', i)) {
      tokens.push({ type: 'lparen', value: '|__', latexLeft: '\\lfloor', latexRight: '\\rfloor' });
      i += 3;
      continue;
    }
    if (input.startsWith('__|', i)) {
      tokens.push({ type: 'rparen', value: '__|' });
      i += 3;
      continue;
    }
    if (input.startsWith('|~', i)) {
      tokens.push({ type: 'lparen', value: '|~', latexLeft: '\\lceil', latexRight: '\\rceil' });
      i += 2;
      continue;
    }
    if (input.startsWith('~|', i)) {
      tokens.push({ type: 'rparen', value: '~|' });
      i += 2;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', latexLeft: '(', latexRight: ')' });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: 'lparen', value: '[', latexLeft: '[', latexRight: ']' });
      i++;
      continue;
    }
    if (ch === '{') {
      tokens.push({ type: 'lparen', value: '{', latexLeft: '\\{', latexRight: '\\}' });
      i++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      tokens.push({ type: 'rparen', value: ch });
      i++;
      continue;
    }

    // Match longest symbolic operator first (for non-alphanumeric or known symbols)
    let matchedSym: string | null = null;
    for (const sym of MULTI_CHAR_SYMBOLS) {
      if (input.startsWith(sym, i)) {
        const isWord = /^[a-zA-Z]+$/.test(sym);
        if (isWord) {
          const nextCh = input[i + sym.length];
          if (nextCh && /[a-zA-Z]/.test(nextCh)) continue;
        }
        matchedSym = sym;
        break;
      }
    }

    if (matchedSym) {
      // Do not consume unary/binary func names as plain symbols if handled as ident
      if (!UNARY_FUNCS[matchedSym] && !BINARY_FUNCS[matchedSym]) {
        tokens.push({ type: 'symbol', value: SYMBOL_MAP[matchedSym] });
        i += matchedSym.length;
        continue;
      }
    }

    if (ch === '/' || ch === '^' || ch === '_' || ch === ',' || ch === ';') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const m = input.slice(i).match(/^\d+(?:\.\d+)?/);
      if (m) {
        tokens.push({ type: 'number', value: m[0] });
        i += m[0].length;
        continue;
      }
    }

    if (/[a-zA-Z]/.test(ch)) {
      const m = input.slice(i).match(/^[a-zA-Z]+/);
      if (m) {
        const word = m[0];
        if (UNARY_FUNCS[word] || BINARY_FUNCS[word]) {
          tokens.push({ type: 'ident', value: word });
          i += word.length;
        } else if (word.length > 1 && SYMBOL_MAP[word]) {
          tokens.push({ type: 'symbol', value: SYMBOL_MAP[word] });
          i += word.length;
        } else {
          // Single-letter variables in AsciiMath split (e.g., 4ac -> 4 a c, dx -> d x)
          tokens.push({ type: 'ident', value: word });
          i += word.length;
        }
        continue;
      }
    }

    // Single fallback character (+, -, =, <, >, |, !, etc.)
    tokens.push({ type: 'symbol', value: ch === '%' ? '\\%' : ch === '&' ? '\\&' : ch === '#' ? '\\#' : ch });
    i++;
  }

  return tokens;
}

class AsciiMathParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parseExpr(): string {
    const parts: string[] = [];
    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (!tok || tok.type === 'rparen') break;
      parts.push(this.parseTerm());
    }
    return parts.join(' ');
  }

  private parseTerm(): string {
    let base = this.parseFactor();

    while (this.pos < this.tokens.length) {
      const next = this.peek();
      if (!next) break;

      if (next.type === 'op' && next.value === '/') {
        this.consume();
        const denom = this.parseFactorUnwrapped();
        base = `\\frac{${this.unwrapOuterParens(base)}}{${denom}}`;
        continue;
      }

      if (next.type === 'op' && (next.value === '_' || next.value === '^')) {
        const op = next.value;
        this.consume();
        const script = this.parseFactorUnwrapped();
        base = `${base}${op}{${script}}`;
        continue;
      }

      break;
    }

    return base;
  }

  private unwrapOuterParens(expr: string): string {
    const trimmed = expr.trim();
    if (trimmed.startsWith('\\left(') && trimmed.endsWith('\\right)')) {
      return trimmed.slice(7, -7).trim();
    }
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  private parseFactorUnwrapped(): string {
    return this.unwrapOuterParens(this.parseFactor());
  }

  private parseFactor(): string {
    const tok = this.peek();
    if (!tok) return '';

    if (tok.type === 'text') {
      this.consume();
      return `\\text{${tok.value}}`;
    }

    if (tok.type === 'number' || tok.type === 'symbol') {
      this.consume();
      return tok.value;
    }

    if (tok.type === 'op' && (tok.value === ',' || tok.value === ';')) {
      this.consume();
      return tok.value;
    }

    if (tok.type === 'ident') {
      this.consume();
      const name = tok.value;
      if (BINARY_FUNCS[name]) {
        const arg1 = this.parseFactorUnwrapped();
        const arg2 = this.parseFactorUnwrapped();
        return BINARY_FUNCS[name](arg1, arg2);
      }
      if (UNARY_FUNCS[name]) {
        const arg = this.parseFactorUnwrapped();
        return UNARY_FUNCS[name](arg);
      }
      if (SYMBOL_MAP[name]) {
        return SYMBOL_MAP[name];
      }
      return name;
    }

    if (tok.type === 'lparen') {
      return this.parseBracketGroup();
    }

    this.consume();
    return tok.value;
  }

  private parseBracketGroup(): string {
    const open = this.consume() as Extract<Token, { type: 'lparen' }>;
    const rows: string[][] = [[]];
    let isMatrixCandidate = true;

    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (!tok) break;
      if (tok.type === 'rparen') {
        this.consume();
        break;
      }

      // Check for matrix row syntax inside (...) or [...]:
      // e.g. [[a, b], [c, d]] or ((a, b), (c, d))
      if (rows[0].length === 0 && rows.length === 1 && tok.type === 'lparen') {
        const inner = this.parseSubRowForMatrix();
        if (inner) {
          rows[rows.length - 1] = inner;
          if (this.peek()?.type === 'op' && this.peek()?.value === ',') {
            this.consume();
            while (this.peek()?.type === 'lparen') {
              const nextRow = this.parseSubRowForMatrix();
              if (nextRow) {
                rows.push(nextRow);
                if (this.peek()?.type === 'op' && this.peek()?.value === ',') {
                  this.consume();
                  continue;
                }
              }
              break;
            }
            if (rows.length >= 2 && this.peek()?.type === 'rparen') {
              this.consume();
              const env = open.value === '[' ? 'bmatrix' : open.isInvisible ? 'matrix' : 'pmatrix';
              const body = rows.map((r) => r.join(' & ')).join(' \\\\ ');
              return `\\begin{${env}} ${body} \\end{${env}}`;
            }
          }
          // Not a multi-row matrix, flatten back as expression
          const flatRow = `${inner.join(', ')}`;
          const restParts: string[] = [
            open.value === '[' ? `\\left[${flatRow}\\right]` : `\\left(${flatRow}\\right)`,
          ];
          while (this.pos < this.tokens.length && this.peek()?.type !== 'rparen') {
            restParts.push(this.parseTerm());
          }
          if (this.peek()?.type === 'rparen') this.consume();
          return this.wrapParens(open, restParts.join(' '));
        }
      }

      isMatrixCandidate = false;
      void isMatrixCandidate;
      rows[0].push(this.parseTerm());
    }

    const content = rows[0].join(' ');
    return this.wrapParens(open, content);
  }

  private parseSubRowForMatrix(): string[] | null {
    const startPos = this.pos;
    const open = this.peek();
    if (!open || open.type !== 'lparen' || (open.value !== '(' && open.value !== '[')) {
      return null;
    }
    this.consume();

    const cells: string[] = [];
    let currentCell: string[] = [];

    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (!tok) break;
      if (tok.type === 'rparen') {
        this.consume();
        cells.push(currentCell.join(' ').trim());
        return cells.length >= 1 ? cells : null;
      }
      if (tok.type === 'op' && tok.value === ',') {
        this.consume();
        cells.push(currentCell.join(' ').trim());
        currentCell = [];
        continue;
      }
      currentCell.push(this.parseTerm());
    }

    this.pos = startPos;
    return null;
  }

  private wrapParens(open: Extract<Token, { type: 'lparen' }>, inner: string): string {
    if (open.isInvisible) {
      return inner;
    }
    if (open.value === '(') {
      return `(${inner})`;
    }
    return `\\left${open.latexLeft}${inner}\\right${open.latexRight}`;
  }
}

export function asciiMathToLatex(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return '';
  try {
    const tokens = tokenize(trimmed);
    const parser = new AsciiMathParser(tokens);
    return parser.parseExpr().trim();
  } catch {
    return trimmed;
  }
}
