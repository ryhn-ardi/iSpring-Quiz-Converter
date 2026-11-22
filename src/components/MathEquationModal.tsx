import React, { useMemo, useState } from 'react';
import { X, Sigma, Copy, Check, ArrowRightLeft } from 'lucide-react';
import {
  MathFormat,
  MathRenderEngine,
  convertAsciiMathToLatex,
  convertLatexToTypst,
  convertMathToMathML,
  convertTypstToLatex,
  mathToUnicode,
  renderMathToHtml,
} from '../utils/mathEngine';

type MathEquationModalProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (delimitedCode: string) => void;
  defaultEngine?: MathRenderEngine;
};

const FORMAT_EXAMPLES: Record<MathFormat, string> = {
  latex: '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  asciimath: '(-b +- sqrt(b^2 - 4ac))/(2a)',
  typst: 'frac(-b plus.minus sqrt(b^2 - 4 a c), 2 a)',
  mathml:
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow><mo>-</mo><mi>b</mi><mo>±</mo><msqrt><mrow><msup><mi>b</mi><mn>2</mn></msup><mo>-</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></math>',
};

const SNIPPETS: Record<MathFormat, { label: string; code: string }[]> = {
  latex: [
    { label: 'Pecahan', code: '\\frac{a}{b}' },
    { label: 'Akar', code: '\\sqrt{x}' },
    { label: 'Pangkat', code: 'x^{2}' },
    { label: 'Sigma', code: '\\sum_{i=1}^{n} x_i' },
    { label: 'Integral', code: '\\int_{a}^{b} f(x)\\,dx' },
    { label: 'Limit', code: '\\lim_{x \\to \\infty}' },
    { label: 'Matriks', code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
    { label: '± × ÷ ≤ ≥', code: '\\pm \\times \\div \\leq \\geq \\neq' },
  ],
  asciimath: [
    { label: 'Pecahan', code: '(a)/(b)' },
    { label: 'Akar', code: 'sqrt(x)' },
    { label: 'Pangkat', code: 'x^2' },
    { label: 'Sigma', code: 'sum_(i=1)^n x_i' },
    { label: 'Integral', code: 'int_a^b f(x) dx' },
    { label: 'Limit', code: 'lim_(x -> oo)' },
    { label: 'Matriks', code: '[[a, b], [c, d]]' },
    { label: '± × ÷ ≤ ≥', code: '+- xx -: <= >= !=' },
  ],
  typst: [
    { label: 'Pecahan', code: 'frac(a, b)' },
    { label: 'Akar', code: 'sqrt(x)' },
    { label: 'Pangkat', code: 'x^2' },
    { label: 'Sigma', code: 'sum_(i=1)^n x_i' },
    { label: 'Integral', code: 'integral_a^b f(x) dif x' },
    { label: 'Limit', code: 'lim_(x -> oo)' },
    { label: 'Matriks', code: 'mat(a, b; c, d)' },
    { label: '± × ÷ ≤ ≥', code: 'plus.minus times div <= >= !=' },
  ],
  mathml: [
    { label: 'Pecahan', code: '<mfrac><mi>a</mi><mi>b</mi></mfrac>' },
    { label: 'Akar', code: '<msqrt><mi>x</mi></msqrt>' },
    { label: 'Pangkat', code: '<msup><mi>x</mi><mn>2</mn></msup>' },
    { label: 'Indeks', code: '<msub><mi>x</mi><mi>i</mi></msub>' },
  ],
};

export const MathEquationModal: React.FC<MathEquationModalProps> = ({
  open,
  onClose,
  onInsert,
  defaultEngine = 'katex',
}) => {
  const [format, setFormat] = useState<MathFormat>('latex');
  const [engine, setEngine] = useState<MathRenderEngine>(defaultEngine);
  const [displayMode, setDisplayMode] = useState(false);
  const [code, setCode] = useState(FORMAT_EXAMPLES.latex);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleFormatChange = (nextFmt: MathFormat) => {
    setFormat(nextFmt);
    setCode(FORMAT_EXAMPLES[nextFmt]);
  };

  const rendered = useMemo(
    () => renderMathToHtml(code, format, engine, displayMode),
    [code, format, engine, displayMode]
  );

  const conversions = useMemo(() => {
    const tex =
      format === 'latex'
        ? code
        : format === 'typst'
          ? convertTypstToLatex(code)
          : format === 'asciimath'
            ? convertAsciiMathToLatex(code)
            : '';
    const typst =
      format === 'typst'
        ? code
        : tex
          ? convertLatexToTypst(tex)
          : '';
    const mathml = convertMathToMathML(code, format, displayMode);
    const unicode = mathToUnicode(code, format);

    return { tex, typst, mathml, unicode };
  }, [code, format, displayMode]);

  if (!open) return null;

  const buildDelimitedSnippet = (): string => {
    const trimmed = code.trim();
    if (!trimmed) return '';
    if (format === 'latex') {
      return displayMode ? `$$${trimmed}$$` : `$${trimmed}$`;
    }
    if (format === 'asciimath') {
      return `\`${trimmed}\``;
    }
    if (format === 'typst') {
      return displayMode
        ? `[typst-block]${trimmed}[/typst-block]`
        : `[typst]${trimmed}[/typst]`;
    }
    return trimmed;
  };

  const handleCopyConversion = async (key: string, value: string) => {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
              <Sigma className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Editor & Konverter Rumus Matematika
              </h3>
              <p className="text-[11px] text-slate-500">
                Mendukung LaTeX (KaTeX / MathJax), AsciiMath, Typst, dan MathML
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Format + Engine Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
              {(
                [
                  { id: 'latex', label: 'LaTeX' },
                  { id: 'asciimath', label: 'AsciiMath' },
                  { id: 'typst', label: 'Typst' },
                  { id: 'mathml', label: 'MathML' },
                ] as { id: MathFormat; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleFormatChange(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    format === item.id
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setEngine('katex')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    engine === 'katex'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  KaTeX
                </button>
                <button
                  type="button"
                  onClick={() => setEngine('mathjax')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    engine === 'mathjax'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  MathJax
                </button>
              </div>

              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayMode}
                  onChange={(e) => setDisplayMode(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Block
              </label>
            </div>
          </div>

          {/* Quick Snippets */}
          <div className="flex flex-wrap gap-1.5">
            {SNIPPETS[format].map((snip) => (
              <button
                key={snip.label}
                type="button"
                onClick={() => setCode((prev) => (prev ? `${prev} ${snip.code}` : snip.code))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-[11px] font-semibold text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer"
              >
                + {snip.label}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Kode Rumus ({format.toUpperCase()}):
            </label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={3}
              className="w-full p-3 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ketik ekspresi matematika di sini..."
            />
          </div>

          {/* Live Preview */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Pratinjau ({engine === 'katex' ? 'KaTeX' : 'MathJax SVG'}):
            </label>
            <div className="min-h-[72px] p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-x-auto text-slate-900">
              {rendered.error ? (
                <span className="text-xs text-rose-600 font-medium">{rendered.error}</span>
              ) : rendered.html ? (
                <span
                  className={rendered.isSvg ? 'inline-block [&>svg]:max-w-full' : 'text-base'}
                  dangerouslySetInnerHTML={{ __html: rendered.html }}
                />
              ) : (
                <span className="text-xs text-slate-400">Pratinjau rumus muncul di sini</span>
              )}
            </div>
          </div>

          {/* Cross-format conversion */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
              Konversi Antar Format (Klik Salin):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              {conversions.tex && (
                <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-500 block">LaTeX</span>
                    <code className="text-slate-800 truncate block">{conversions.tex}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyConversion('tex', conversions.tex)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'tex' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}

              {conversions.typst && (
                <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-500 block">Typst</span>
                    <code className="text-slate-800 truncate block">{conversions.typst}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyConversion('typst', conversions.typst)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'typst' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}

              {conversions.mathml && (
                <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-500 block">MathML</span>
                    <code className="text-slate-800 truncate block">{conversions.mathml}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyConversion('mathml', conversions.mathml)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'mathml' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}

              {conversions.unicode && (
                <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-500 block">Unicode (Teks Excel)</span>
                    <code className="text-slate-800 truncate block">{conversions.unicode}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyConversion('unicode', conversions.unicode)}
                    className="p-1.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'unicode' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500 font-mono truncate">
            Sisipkan: {buildDelimitedSnippet()}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!code.trim()}
              onClick={() => {
                const snippet = buildDelimitedSnippet();
                if (snippet) {
                  onInsert(snippet);
                  onClose();
                }
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-xs font-bold shadow-sm cursor-pointer"
            >
              Sisipkan ke Soal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
