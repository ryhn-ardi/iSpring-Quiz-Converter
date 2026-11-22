// Browser globals required by mathjax-full legacy CommonJS modules (e.g., AsciiMath)
const g = globalThis as Record<string, unknown>;
if (!g.global) {
  g.global = globalThis;
}
if (!g.MathJax) {
  g.MathJax = {};
}
