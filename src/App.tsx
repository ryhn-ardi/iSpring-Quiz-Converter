import React, { useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet, Zap, Sliders, Edit3, Award, Trash2, Eye,
  Download, Database, Check, AlertCircle, CheckCircle,
  AlertTriangle, Info, Image as ImageIcon, Copy, Sparkles, Table as TableIcon,
  FileText, FileUp
} from 'lucide-react';
import { RichQuizEditor } from './components/RichQuizEditor';
import {
  RichQuestion,
  convertAutoRich,
  convertRuleRich,
  getFirstQuestionTable,
  questionHasRichFormatting,
  questionHasTable,
} from './utils/quizParser';
import {
  RichContentNode,
  RichTable,
  RichText,
  copyRichNodesToClipboard,
  copyRichTextToClipboard,
  getFormattingSummary,
  hasRichFormatting,
  htmlToRichNodes,
  richNodesToEditorHtml,
  richNodesToPlain,
} from './utils/richText';
import { TableExportMode, exportRichQuizToExcel } from './utils/excelExport';
import {
  downloadAllTableImages,
  downloadQuestionTablePng,
  getTableImageFilename,
} from './utils/tableImage';
import {
  downloadSampleWordTemplate,
  parseDocxFile,
} from './utils/docxImport';

type ToastState = { message: string; type: 'info' | 'success' | 'error'; visible: boolean };

const SAMPLE_AUTO_QUESTIONS_HTML = [
  '<div>1. Era musik yang mengutamakan <b>kerapian</b>, struktur simetri (tanya-jawab), dan <u>keseimbangan</u> adalah...</div>',
  '<div>a. Era Barok</div>',
  '<div>b. Era Romantik</div>',
  '<div>c. Era Modern</div>',
  '<div>d. Era Klasik</div>',
  '<div><br></div>',
  '<div>2. Siapakah komponis musik terkenal pada era Klasik yang menciptakan lagu <i>"Für Elise"</i>?</div>',
  '<div>a. Johann Sebastian Bach</div>',
  '<div>b. Ludwig van Beethoven</div>',
  '<div>c. Wolfgang Amadeus Mozart</div>',
  '<div>d. Franz Schubert</div>',
  '<div><br></div>',
  '<div>3. Unsur <b>paling mendasar</b> dalam musik yang merupakan getaran udara teratur yang memiliki tinggi rendah tertentu dan dapat didengar adalah...</div>',
  '<div>a. Bunyi</div>',
  '<div>b. Nada</div>',
  '<div>c. Irama</div>',
  '<div>d. Melodi</div>',
].join('');

const SAMPLE_AUTO_KEYS = `1. d
2. b
3. b`;

const SAMPLE_RULE_HTML = [
  '<div>Era musik yang mengutamakan <b>kerapian</b>, struktur simetri (tanya-jawab), dan <u>keseimbangan</u> adalah...</div>',
  '<div>a. Era Barok</div>',
  '<div>b. Era Romantik</div>',
  '<div>c. Era Modern</div>',
  '<div>*d. Era Klasik</div>',
  '<div><br></div>',
  '<div>Siapakah komponis musik terkenal pada era Klasik yang menciptakan lagu <i>"Für Elise"</i>?</div>',
  '<div>a. Johann Sebastian Bach</div>',
  '<div>*b. Ludwig van Beethoven</div>',
  '<div>c. Wolfgang Amadeus Mozart</div>',
  '<div>d. Franz Schubert</div>',
].join('');

function RichTextRenderer({ lines }: { lines: RichText }) {
  return (
    <>
      {lines.map((line, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {line.map((span, spanIdx) => {
            const classes = [
              span.bold ? 'font-bold' : '',
              span.italic ? 'italic' : '',
              span.underline ? 'underline decoration-1 underline-offset-2' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return classes ? (
              <span key={spanIdx} className={classes}>
                {span.text}
              </span>
            ) : (
              <React.Fragment key={spanIdx}>{span.text}</React.Fragment>
            );
          })}
        </React.Fragment>
      ))}
    </>
  );
}

function RichTableRenderer({ table }: { table: RichTable }) {
  return (
    <div className="my-2.5 overflow-x-auto rounded-lg border border-slate-300 bg-white">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {table.rows.map((row, rIdx) => (
            <tr key={rIdx} className="border-b border-slate-200 last:border-b-0">
              {row.map((cell, cIdx) => {
                const Tag = cell.isHeader ? 'th' : 'td';
                return (
                  <Tag
                    key={cIdx}
                    className={`border-r border-slate-200 last:border-r-0 px-2.5 py-1.5 text-left align-top ${
                      cell.isHeader ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    <RichTextRenderer lines={cell.lines} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RichNodesRenderer({
  nodes,
  prefixNumber,
}: {
  nodes: RichContentNode[];
  prefixNumber?: number;
}) {
  let renderedPrefix = false;
  return (
    <div className="text-sm text-slate-900 mb-4 leading-relaxed space-y-1.5">
      {nodes.map((node, idx) => {
        if (node.type === 'table') {
          return (
            <React.Fragment key={idx}>
              <RichTableRenderer table={node} />
            </React.Fragment>
          );
        }
        const showPrefix = !renderedPrefix && prefixNumber !== undefined;
        if (showPrefix) renderedPrefix = true;
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {showPrefix && <span className="font-semibold">{prefixNumber}. </span>}
            <RichTextRenderer lines={[node.spans]} />
          </p>
        );
      })}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<'auto' | 'rule'>('auto');
  const [autoQuestionsHtml, setAutoQuestionsHtml] = useState(SAMPLE_AUTO_QUESTIONS_HTML);
  const [autoKeys, setAutoKeys] = useState(SAMPLE_AUTO_KEYS);
  const [ruleHtml, setRuleHtml] = useState(SAMPLE_RULE_HTML);
  const [defaultPoints, setDefaultPoints] = useState<number>(10);
  const [convertedQuestions, setConvertedQuestions] = useState<RichQuestion[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'formatted'>('all');
  const [tableExportMode, setTableExportMode] = useState<TableExportMode>('image');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', visible: false });
  const headerDocxInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4500);
  };

  const clearInput = () => {
    setAutoQuestionsHtml('');
    setAutoKeys('');
    setRuleHtml('');
    setConvertedQuestions([]);
    setPreviewFilter('all');
    showToast('Semua input dibersihkan.', 'info');
  };

  const prosesKonversi = () => {
    try {
      const converted =
        mode === 'auto'
          ? convertAutoRich(htmlToRichNodes(autoQuestionsHtml), autoKeys, defaultPoints)
          : convertRuleRich(htmlToRichNodes(ruleHtml), defaultPoints);

      setConvertedQuestions(converted);
      setPreviewFilter('all');

      const fmtCount = converted.filter(questionHasRichFormatting).length;
      const tblCount = converted.filter(questionHasTable).length;

      if (tblCount > 0) {
        showToast(
          `Selesai! ${converted.length} soal dikonversi (${tblCount} soal berisi tabel siap diekspor sebagai gambar PNG atau teks).`,
          'success'
        );
      } else if (fmtCount > 0) {
        showToast(
          `Selesai! ${converted.length} soal dikonversi (${fmtCount} soal memiliki format Bold/Italic/Underline).`,
          'success'
        );
      } else {
        showToast(
          mode === 'auto'
            ? `Selesai! Berhasil menjodohkan ${converted.length} soal dengan kunci jawaban secara instan.`
            : `Berhasil mengonversi ${converted.length} soal secara lokal.`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem', 'error');
    }
  };

  const handleImportDocx = async (file: File) => {
    try {
      const parsed = await parseDocxFile(file);
      const qHtml = richNodesToEditorHtml(parsed.questionNodes);

      if (parsed.hasKeysSection && parsed.keysText.trim()) {
        setMode('auto');
        setAutoQuestionsHtml(qHtml);
        setAutoKeys(parsed.keysText);
        setPreviewFilter('all');

        try {
          const converted = convertAutoRich(
            parsed.questionNodes,
            parsed.keysText,
            defaultPoints
          );
          setConvertedQuestions(converted);
          showToast(
            `Berhasil mengekstrak ${converted.length} soal & kunci jawaban dari "${file.name}"${
              parsed.tableCount > 0 ? ` (${parsed.tableCount} tabel terjaga)` : ''
            }!`,
            'success'
          );
        } catch (convErr: any) {
          setConvertedQuestions([]);
          showToast(
            `Soal & kunci diekstrak dari "${file.name}", namun perlu dicek: ${
              convErr?.message || ''
            }`,
            'info'
          );
        }
        return;
      }

      if (mode === 'rule') {
        setRuleHtml(qHtml);
        const plain = richNodesToPlain(parsed.questionNodes, false);
        if (/(?:^|\n)\s*(?:\*|\[x\])/im.test(plain)) {
          try {
            const converted = convertRuleRich(parsed.questionNodes, defaultPoints);
            setConvertedQuestions(converted);
            showToast(
              `Berhasil mengimpor & mengonversi ${converted.length} soal dari "${file.name}".`,
              'success'
            );
            return;
          } catch {
            // Fall back to regular load notice below
          }
        }
        showToast(
          `Soal dari "${file.name}" dimuat (tidak ditemukan bagian "Kunci Jawaban").`,
          'info'
        );
      } else {
        setAutoQuestionsHtml(qHtml);
        showToast(
          parsed.hasKeysSection
            ? `Soal dari "${file.name}" dimuat, tetapi isi "Kunci Jawaban" kosong.`
            : `Soal dari "${file.name}" dimuat! Tambahkan heading "Kunci Jawaban" di Word atau isi kolom Kunci Jawaban di kanan.`,
          'info'
        );
      }
    } catch (err: any) {
      showToast(
        'Gagal membaca file .docx: ' + (err?.message || 'Format file tidak valid'),
        'error'
      );
    }
  };

  const handleDownloadTemplateDocx = async () => {
    try {
      const filename = await downloadSampleWordTemplate();
      showToast(
        `Contoh template "${filename}" diunduh! Gunakan bagian "Soal" & "Kunci Jawaban" di Word lalu impor kembali.`,
        'success'
      );
    } catch (err: any) {
      showToast('Gagal membuat template Word: ' + (err?.message || ''), 'error');
    }
  };

  const exportToExcel = async () => {
    if (convertedQuestions.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const { filename, formattedCount, tableImageCount } = await exportRichQuizToExcel(
        convertedQuestions,
        tableExportMode
      );
      if (tableImageCount > 0) {
        showToast(
          `Excel "${filename}" diunduh (${tableImageCount} tabel ditautkan ke kolom Image). Jangan lupa unduh gambar tabelnya!`,
          'success'
        );
      } else if (formattedCount > 0) {
        showToast(
          `Excel "${filename}" diunduh dengan ${formattedCount} sel berformat Bold/Italic/Underline!`,
          'success'
        );
      } else {
        showToast(`Excel "${filename}" diunduh! Siap diimpor ke iSpring QuizMaker.`, 'success');
      }
    } catch (err: any) {
      showToast('Gagal mengekspor Excel: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadAllTables = async () => {
    if (isExportingImages) return;
    setIsExportingImages(true);
    try {
      const { count, filename } = await downloadAllTableImages(convertedQuestions);
      showToast(
        `${count} gambar tabel berhasil diunduh (${filename}). Simpan satu folder dengan file Excel sebelum impor ke iSpring.`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal membuat gambar tabel', 'error');
    } finally {
      setIsExportingImages(false);
    }
  };

  const handleDownloadSingleTable = async (table: RichTable, questionIdx: number) => {
    try {
      const filename = await downloadQuestionTablePng(table, questionIdx);
      showToast(`Gambar tabel "${filename}" diunduh!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh gambar tabel', 'error');
    }
  };

  const handleCopyQuestionRich = async (
    id: string,
    nodes: RichContentNode[],
    label: string
  ) => {
    const richCopied = await copyRichNodesToClipboard(nodes);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
    showToast(
      richCopied
        ? `${label} disalin beserta format & tabel! Tempel (Ctrl+V) langsung ke iSpring.`
        : `${label} disalin ke clipboard.`,
      'success'
    );
  };

  const handleCopyAnswerRich = async (id: string, lines: RichText, label: string) => {
    const richCopied = await copyRichTextToClipboard(lines);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
    showToast(
      richCopied
        ? `${label} disalin dengan format Bold/Italic/Underline! Tempel (Ctrl+V) ke iSpring.`
        : `${label} disalin ke clipboard.`,
      'success'
    );
  };

  const formattedQuestionsCount = useMemo(
    () =>
      convertedQuestions.filter(
        (q) => questionHasRichFormatting(q) || questionHasTable(q)
      ).length,
    [convertedQuestions]
  );

  const tableQuestionsCount = useMemo(
    () => convertedQuestions.filter(questionHasTable).length,
    [convertedQuestions]
  );

  const displayedQuestions = useMemo(() => {
    return convertedQuestions
      .map((q, idx) => ({ q, originalIndex: idx }))
      .filter(({ q }) =>
        previewFilter === 'formatted'
          ? questionHasRichFormatting(q) || questionHasTable(q)
          : true
      );
  }, [convertedQuestions, previewFilter]);

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-md shadow-indigo-100">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">iSpring Quiz Converter Masansa</h1>
              <p className="text-xs text-slate-500 font-medium">Ubah Soal Teks Menjadi Template Excel iSpring Suite</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Sistem Siap Digunakan
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column: Input Form (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-600" />
                1. Input Teks Soal & Kunci Jawaban
              </h2>
              <div className="flex items-center gap-2">
                <input
                  ref={headerDocxInputRef}
                  type="file"
                  accept=".docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleImportDocx(file);
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleDownloadTemplateDocx}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Unduh contoh dokumen Word (.docx) dengan format Soal & Kunci Jawaban"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  Contoh Template .docx
                </button>
                <button
                  type="button"
                  onClick={() => headerDocxInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Impor file Word (.docx) yang berisi bagian Soal dan Kunci Jawaban sekaligus"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Impor Template Word (.docx)
                </button>
              </div>
            </div>

            {/* Mode Selector Tab */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 gap-1 sm:gap-0">
              <button
                onClick={() => setMode('auto')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${mode === 'auto' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <Zap className={`w-4 h-4 ${mode === 'auto' ? 'text-amber-500' : ''}`} />
                Otomatis (Soal + Kunci Terpisah)
              </button>
              <button
                onClick={() => setMode('rule')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${mode === 'rule' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <Sliders className="w-4 h-4" />
                Manual (Tanda Bintang *)
              </button>
            </div>

            {/* Mode 1: Auto */}
            {mode === 'auto' && (
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700">
                  <p className="font-bold mb-1 text-indigo-900">Cara Kerja Mode Otomatis & Impor Template Word (.docx):</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Di file Word (<b>.docx</b>), beri penanda baris <code className="bg-indigo-100 px-1 rounded text-indigo-900 font-bold">Soal</code> di atas daftar soal dan <code className="bg-indigo-100 px-1 rounded text-indigo-900 font-bold">Kunci Jawaban</code> sebelum daftar kunci — saat diimpor, keduanya otomatis diekstrak & dikonversi sekaligus!</li>
                    <li>Format <b>Bold</b>, <i>Italic</i>, <u>Underline</u>, dan <b>Tabel</b> (termasuk tabel kunci jawaban) otomatis terbaca & dipertahankan.</li>
                    <li>Bisa juga tempel manual dari Word / Google Docs, lalu isi kunci (contoh: <code className="bg-indigo-100 px-1 rounded text-indigo-900 font-bold">1. A</code> atau <code className="bg-indigo-100 px-1 rounded text-indigo-900 font-bold">2. A,B</code> untuk <b>MR</b>).</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Daftar Soal (Rich Text):</label>
                    <RichQuizEditor
                      valueHtml={autoQuestionsHtml}
                      onChangeHtml={setAutoQuestionsHtml}
                      placeholder={'1. Pertanyaan contoh?\na. Opsi A\nb. Opsi B'}
                      onNotify={showToast}
                      onDocxFileSelected={handleImportDocx}
                    />
                  </div>
                  <div className="md:col-span-1 flex flex-col">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Kunci Jawaban:</label>
                    <textarea
                      value={autoKeys}
                      onChange={(e) => setAutoKeys(e.target.value)}
                      rows={12}
                      className="w-full flex-grow p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed resize-none"
                      placeholder={'1. D\n2. B\n3. B'}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Mode 2: Manual */}
            {mode === 'rule' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
                  <p className="font-bold mb-1 text-slate-700">Aturan Penulisan Manual (Mendukung Bold / Italic / Underline / Tabel):</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Pisahkan antarsoal dengan 1 baris kosong (Double Enter).</li>
                    <li>Tandai kunci jawaban dengan tanda bintang (<span className="text-red-500 font-bold">*</span>) di awal teks pilihan (Contoh: <i>*d. Era Klasik</i>).</li>
                    <li>Jika file <code className="bg-slate-200/70 px-1 rounded">.docx</code> Anda memiliki bagian <b>Kunci Jawaban</b>, web akan otomatis mengekstrak ke Mode Otomatis.</li>
                  </ul>
                </div>
                <RichQuizEditor
                  valueHtml={ruleHtml}
                  onChangeHtml={setRuleHtml}
                  placeholder="Tuliskan atau tempel soal dengan tanda bintang di sini..."
                  onNotify={showToast}
                  onDocxFileSelected={handleImportDocx}
                />
              </div>
            )}

            {/* Configuration */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-indigo-600" />
                  Poin per Soal (Default)
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">Bobot nilai default yang diberikan untuk setiap jawaban benar.</p>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={defaultPoints}
                  onChange={(e) => setDefaultPoints(parseInt(e.target.value, 10) || 0)}
                  min="0"
                  max="1000"
                  className="w-28 pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-center"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">Poin</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-6">
              <button onClick={clearInput} className="px-5 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-all cursor-pointer">
                <Trash2 className="w-4 h-4" />
                Bersihkan
              </button>
              <button onClick={prosesKonversi} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl text-sm shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 transition-all cursor-pointer">
                <Zap className="w-4 h-4" />
                Proses & Konversi
              </button>
            </div>

          </div>
        </div>

        {/* Right Column: Live Preview & Excel Download (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col h-full">
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" />
                2. Hasil ({convertedQuestions.length} Soal)
              </h2>
              <div className="flex items-center gap-2">
                {tableQuestionsCount > 0 && tableExportMode === 'image' && (
                  <button
                    onClick={handleDownloadAllTables}
                    disabled={isExportingImages}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    title="Unduh gambar PNG semua tabel untuk ditaruh satu folder dengan Excel"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    {isExportingImages
                      ? 'Membuat...'
                      : `Unduh Tabel (${tableQuestionsCount})`}
                  </button>
                )}
                <button
                  onClick={exportToExcel}
                  disabled={convertedQuestions.length === 0 || isExporting}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? 'Mengekspor...' : 'Unduh Excel'}
                </button>
              </div>
            </div>

            {/* Table Export Options when tables exist */}
            {convertedQuestions.length > 0 && tableQuestionsCount > 0 && (
              <div className="mb-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-[11px] text-indigo-950 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <TableIcon className="w-3.5 h-3.5 text-indigo-600" />
                    Mode Ekspor Tabel ke iSpring ({tableQuestionsCount} soal):
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTableExportMode('image')}
                    className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                      tableExportMode === 'image'
                        ? 'bg-white border-indigo-400 text-indigo-700 shadow-xs'
                        : 'bg-indigo-100/50 border-transparent text-indigo-700/70 hover:bg-white/70'
                    }`}
                  >
                    Gambar PNG di Kolom Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableExportMode('text')}
                    className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                      tableExportMode === 'text'
                        ? 'bg-white border-indigo-400 text-indigo-700 shadow-xs'
                        : 'bg-indigo-100/50 border-transparent text-indigo-700/70 hover:bg-white/70'
                    }`}
                  >
                    Teks Berpemisah ( | )
                  </button>
                </div>
                <p className="text-indigo-800/90 leading-relaxed">
                  {tableExportMode === 'image'
                    ? 'Disarankan untuk iSpring: Excel tidak mendukung tabel di dalam sel teks. Kolom Image akan otomatis diisi tabel_soal_X.png — klik "Unduh Tabel", lalu taruh gambar satu folder dengan file Excel saat impor ke iSpring.'
                    : 'Tabel ditulis ke kolom Question Text dengan pemisah "|" antar kolom (rapi dibaca, namun tidak menjadi tabel grafis di iSpring).'}
                </p>
              </div>
            )}

            {/* Filter & Rich Text Note for iSpring */}
            {convertedQuestions.length > 0 && formattedQuestionsCount > 0 && (
              <div className="mb-3 space-y-2.5">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setPreviewFilter('all')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      previewFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua Soal ({convertedQuestions.length})
                  </button>
                  <button
                    onClick={() => setPreviewFilter('formatted')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                      previewFilter === 'formatted'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Berformat / Tabel ({formattedQuestionsCount})
                  </button>
                </div>

                {tableQuestionsCount === 0 && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                    <b>Info Format iSpring:</b> Bold, Italic, & Underline sudah tersimpan di file Excel. Jika importer Excel iSpring QuizMaker Anda tetap menghapus format sel saat impor, klik <b>Salin Berformat</b> pada soal yang bertanda lalu tempel (<code className="bg-amber-100 px-1 rounded font-bold">Ctrl+V</code>) ke iSpring.
                  </div>
                )}
              </div>
            )}

            <div className="flex-grow border border-slate-100 bg-slate-50/50 rounded-xl p-4 overflow-y-auto max-h-[600px]">
              {convertedQuestions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 text-slate-400">
                  <Database className="w-12 h-12 mb-3 text-slate-300" />
                  <p className="text-sm font-medium">Belum ada hasil konversi</p>
                  <p className="text-xs text-slate-400 mt-1">Masukkan data, lalu klik tombol Proses.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedQuestions.map(({ q, originalIndex }) => {
                    const hasCorrect = q.answers.some((a) => a.isCorrect);
                    const qHasFormat = questionHasRichFormatting(q);
                    const qTable = getFirstQuestionTable(q);
                    const qFormatTags = getFormattingSummary(q.questionNodes);
                    const qCopyId = `q-${originalIndex}`;
                    const effectiveImage =
                      q.image ||
                      (qTable && tableExportMode === 'image'
                        ? getTableImageFilename(originalIndex)
                        : '');

                    return (
                      <div key={originalIndex} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm relative">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                              SOAL {originalIndex + 1} ({q.type})
                            </span>
                            {qFormatTags.length > 0 && (
                              <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {qFormatTags.join(' · ')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {qTable && (
                              <button
                                type="button"
                                onClick={() => handleDownloadSingleTable(qTable, originalIndex)}
                                className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-all cursor-pointer"
                                title="Unduh tabel ini sebagai gambar PNG"
                              >
                                <Download className="w-3 h-3" />
                                PNG
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyQuestionRich(
                                  qCopyId,
                                  q.questionNodes,
                                  `Teks Soal ${originalIndex + 1}`
                                )
                              }
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
                                copiedId === qCopyId
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : qHasFormat || qTable
                                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                              title="Salin soal beserta format & tabel untuk ditempel ke iSpring"
                            >
                              {copiedId === qCopyId ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  Tersalin
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Salin Berformat
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {effectiveImage && (
                          <div className="mb-3 bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-2 border border-amber-200">
                            <ImageIcon className="w-4 h-4" />
                            File Kolom Image: {effectiveImage}
                          </div>
                        )}

                        <RichNodesRenderer
                          nodes={q.questionNodes}
                          prefixNumber={originalIndex + 1}
                        />

                        <div className="grid grid-cols-1 gap-2">
                          {q.answers.map((ans, optIdx) => {
                            const char = String.fromCharCode(97 + optIdx);
                            const ansHasFormat = hasRichFormatting(ans.richText);
                            const ansCopyId = `a-${originalIndex}-${optIdx}`;
                            return (
                              <div
                                key={optIdx}
                                className={`flex items-center justify-between gap-2 border px-3 py-2 rounded-lg text-xs ${
                                  ans.isCorrect
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-100'
                                }`}
                              >
                                <span className="flex items-start gap-2 min-w-0">
                                  <span className="uppercase font-bold text-[10px] bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                                    {char}
                                  </span>
                                  <span className="leading-relaxed break-words">
                                    <RichTextRenderer lines={ans.richText} />
                                  </span>
                                </span>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {ansHasFormat && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyAnswerRich(
                                          ansCopyId,
                                          ans.richText,
                                          `Opsi ${char.toUpperCase()} Soal ${originalIndex + 1}`
                                        )
                                      }
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                                        copiedId === ansCopyId
                                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
                                      }`}
                                      title="Salin opsi berformat"
                                    >
                                      {copiedId === ansCopyId ? (
                                        <Check className="w-2.5 h-2.5" />
                                      ) : (
                                        <Copy className="w-2.5 h-2.5" />
                                      )}
                                      Salin
                                    </button>
                                  )}
                                  {ans.isCorrect && (
                                    <span className="bg-emerald-500 text-white rounded-full p-0.5 flex items-center justify-center">
                                      <Check className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {!hasCorrect && (
                          <div className="mt-3 bg-rose-50 text-rose-600 text-[10px] font-bold px-2 py-1.5 rounded flex items-center justify-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> Kunci Jawaban Belum Cocok
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 iSpring Quiz Converter. 100% Kompatibel dengan iSpring Suite QuizMaker.</p>
          <p className="mt-2 font-medium text-slate-600">Made by Reyhan Ardisola</p>
        </div>
      </footer>

      {/* Toast */}
      <div className={`fixed bottom-6 right-6 transform ${toast.visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'} bg-slate-950 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 transition-all duration-300 z-50 text-sm max-w-md`}>
        {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
        {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
        {toast.type === 'info' && <Info className="w-4 h-4 text-indigo-400 shrink-0" />}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
