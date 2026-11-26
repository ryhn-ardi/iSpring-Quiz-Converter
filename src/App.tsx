import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'katex/dist/katex.min.css';
import {
  FileSpreadsheet, Zap, Sliders, Edit3, Award, Trash2, Eye,
  Download, Database, Check, AlertCircle, CheckCircle,
  AlertTriangle, Info, Image as ImageIcon, Copy, Sparkles, Table as TableIcon,
  FileText, FileUp, Sigma, ClipboardList, FileArchive, Lock, LogOut, ShieldCheck
} from 'lucide-react';
import { RichQuizEditor } from './components/RichQuizEditor';
import { AdminLoginModal } from './components/AdminLoginModal';
import { OwnerProfileData, OwnerSpotlight } from './components/OwnerSpotlight';
import {
  RichQuestion,
  convertAutoRich,
  convertRuleRich,
  getFirstQuestionTable,
  getQuestionTables,
  questionHasImage,
  questionHasRichFormatting,
  questionHasTable,
} from './utils/quizParser';
import {
  RichContentNode,
  RichLine,
  RichTable,
  RichText,
  copyRichNodesToClipboard,
  copyRichTextToClipboard,
  getFormattingSummary,
  hasRichFormatting,
  htmlToRichNodes,
  richLineToPlain,
  richNodesToEditorHtml,
  richNodesToPlain,
} from './utils/richText';
import { TableExportMode, exportRichQuizToExcel } from './utils/excelExport';
import {
  DEFAULT_QUIZ_RESULT_OPTIONS,
  QuizResultSlideOptions,
  ResultSlideDisplayOptions,
  exportRichQuizToISpringQuiz,
} from './utils/quizExport';
import {
  downloadAllTableImages,
  downloadQuestionTablePng,
  getTableImageFilename,
  renderTableToPngBlob,
} from './utils/tableImage';
import {
  downloadSampleWordTemplate,
  parseDocxFile,
} from './utils/docxImport';
import {
  DollarSyntaxMode,
  MathExportMode,
  MathRenderEngine,
  convertMathToMathML,
  hasMathInNodes,
  hasMathInRichText,
  hasMathInText,
  renderMathToHtml,
  splitTextWithMath,
} from './utils/mathEngine';
import {
  downloadAllMathImages,
  downloadQuestionMathPng,
  extractMathSegmentsFromQuestion,
  getMathImageFilename,
} from './utils/mathImage';
import {
  downloadAllWordImages,
  downloadQuestionWordImage,
  getWordImageFilename,
} from './utils/wordImage';
import {
  analyzeQuizAnswers,
  describeIssueReasons,
  formatEmptyAnswerReport,
  upsertAutoKeyLine,
} from './utils/quizAnalyzer';

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

function renderPlainSliceWithSpans(
  line: RichLine,
  startOffset: number,
  endOffset: number
): React.ReactNode {
  let pos = 0;
  const parts: React.ReactNode[] = [];
  line.forEach((span, idx) => {
    const spanStart = pos;
    const spanEnd = pos + span.text.length;
    pos = spanEnd;

    const overlapStart = Math.max(spanStart, startOffset);
    const overlapEnd = Math.min(spanEnd, endOffset);
    if (overlapStart >= overlapEnd) return;

    const slice = span.text.slice(overlapStart - spanStart, overlapEnd - spanStart);
    const classes = [
      span.bold ? 'font-bold' : '',
      span.italic ? 'italic' : '',
      span.underline ? 'underline decoration-1 underline-offset-2' : '',
    ]
      .filter(Boolean)
      .join(' ');

    parts.push(
      classes ? (
        <span key={idx} className={classes}>
          {slice}
        </span>
      ) : (
        <React.Fragment key={idx}>{slice}</React.Fragment>
      )
    );
  });
  return parts;
}

function RichTextRenderer({
  lines,
  mathEngine = 'katex',
  dollarSyntax = 'auto',
}: {
  lines: RichText;
  mathEngine?: MathRenderEngine;
  dollarSyntax?: DollarSyntaxMode;
}) {
  return (
    <>
      {lines.map((line, lineIdx) => {
        const plain = richLineToPlain(line);
        const hasMath = hasMathInText(plain, dollarSyntax);

        if (!hasMath) {
          return (
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
          );
        }

        const segments = splitTextWithMath(plain, dollarSyntax);
        let offset = 0;
        return (
          <React.Fragment key={lineIdx}>
            {lineIdx > 0 && <br />}
            {segments.map((seg, segIdx) => {
              if (seg.type === 'text') {
                const start = offset;
                const end = offset + seg.text.length;
                offset = end;
                return (
                  <React.Fragment key={segIdx}>
                    {renderPlainSliceWithSpans(line, start, end)}
                  </React.Fragment>
                );
              }
              offset += seg.raw.length;
              const rendered = renderMathToHtml(
                seg.code,
                seg.format,
                mathEngine,
                seg.display
              );
              if (rendered.error || !rendered.html) {
                return (
                  <code
                    key={segIdx}
                    className="px-1 py-0.5 rounded bg-rose-50 text-rose-700 text-xs font-mono"
                    title={rendered.error}
                  >
                    {seg.raw}
                  </code>
                );
              }
              return (
                <span
                  key={segIdx}
                  className={
                    seg.display
                      ? 'block my-2 overflow-x-auto text-center [&_.katex-display]:my-1 [&_svg]:inline-block'
                      : 'inline-block align-middle mx-0.5 [&_svg]:inline-block [&_svg]:align-middle'
                  }
                  title={`Format: ${seg.format.toUpperCase()}`}
                  dangerouslySetInnerHTML={{ __html: rendered.html }}
                />
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

function RichTableRenderer({
  table,
  mathEngine,
  dollarSyntax,
}: {
  table: RichTable;
  mathEngine: MathRenderEngine;
  dollarSyntax: DollarSyntaxMode;
}) {
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
                    <RichTextRenderer
                      lines={cell.lines}
                      mathEngine={mathEngine}
                      dollarSyntax={dollarSyntax}
                    />
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

function TablePngPreview({
  table,
  mathEngine,
  mathExportMode,
  dollarSyntax,
}: {
  table: RichTable;
  mathEngine: MathRenderEngine;
  mathExportMode: MathExportMode;
  dollarSyntax: DollarSyntaxMode;
}) {
  const [pngUrl, setPngUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    renderTableToPngBlob(table, mathExportMode, dollarSyntax)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPngUrl(objectUrl);
      })
      .catch(() => {
        if (active) setPngUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [table, mathExportMode, dollarSyntax]);

  if (!pngUrl) {
    return (
      <RichTableRenderer
        table={table}
        mathEngine={mathEngine}
        dollarSyntax={dollarSyntax}
      />
    );
  }

  return (
    <div className="my-2.5 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] font-bold text-indigo-700">
        <span className="flex items-center gap-1">
          <ImageIcon className="w-3 h-3" />
          Tabel otomatis dikonversi menjadi gambar PNG (siap iSpring)
        </span>
      </div>
      <div className="overflow-x-auto">
        <img
          src={pngUrl}
          alt="Pratinjau gambar tabel soal"
          className="max-w-full h-auto rounded-lg border border-slate-300 bg-white shadow-xs"
        />
      </div>
    </div>
  );
}

function RichNodesRenderer({
  nodes,
  prefixNumber,
  mathEngine,
  dollarSyntax,
  tableExportMode = 'image',
  mathExportMode = 'unicode',
}: {
  nodes: RichContentNode[];
  prefixNumber?: number;
  mathEngine: MathRenderEngine;
  dollarSyntax: DollarSyntaxMode;
  tableExportMode?: TableExportMode;
  mathExportMode?: MathExportMode;
}) {
  let renderedPrefix = false;
  return (
    <div className="text-sm text-slate-900 mb-4 leading-relaxed space-y-1.5">
      {nodes.map((node, idx) => {
        if (node.type === 'table') {
          return (
            <React.Fragment key={idx}>
              {tableExportMode === 'image' ? (
                <TablePngPreview
                  table={node}
                  mathEngine={mathEngine}
                  mathExportMode={mathExportMode}
                  dollarSyntax={dollarSyntax}
                />
              ) : (
                <RichTableRenderer
                  table={node}
                  mathEngine={mathEngine}
                  dollarSyntax={dollarSyntax}
                />
              )}
            </React.Fragment>
          );
        }
        if (node.type === 'image') {
          const showPrefix = !renderedPrefix && prefixNumber !== undefined;
          if (showPrefix) renderedPrefix = true;
          return (
            <div key={idx} className="my-2">
              {showPrefix && <span className="font-semibold block mb-1">{prefixNumber}.</span>}
              <img
                src={node.dataUrl}
                alt={node.alt || 'Gambar soal'}
                referrerPolicy="no-referrer"
                className="max-h-64 max-w-full rounded-lg border border-slate-200 bg-white object-contain"
              />
            </div>
          );
        }
        const showPrefix = !renderedPrefix && prefixNumber !== undefined;
        if (showPrefix) renderedPrefix = true;
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {showPrefix && <span className="font-semibold">{prefixNumber}. </span>}
            <RichTextRenderer
              lines={[node.spans]}
              mathEngine={mathEngine}
              dollarSyntax={dollarSyntax}
            />
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
  const [previewFilter, setPreviewFilter] = useState<'all' | 'incomplete' | 'formatted'>('all');
  const [highlightedQuestionIdx, setHighlightedQuestionIdx] = useState<number | null>(null);
  const [tableExportMode, setTableExportMode] = useState<TableExportMode>('image');
  const [mathEngine, setMathEngine] = useState<MathRenderEngine>('katex');
  const [dollarSyntax, setDollarSyntax] = useState<DollarSyntaxMode>('auto');
  const [mathExportMode, setMathExportMode] = useState<MathExportMode>('unicode');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingQuiz, setIsExportingQuiz] = useState(false);
  const [quizResultOptions, setQuizResultOptions] = useState<QuizResultSlideOptions>(
    DEFAULT_QUIZ_RESULT_OPTIONS
  );
  const [showQuizResultSettings, setShowQuizResultSettings] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [isExportingMathImages, setIsExportingMathImages] = useState(false);
  const [isExportingWordImages, setIsExportingWordImages] = useState(false);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', visible: false });
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('ispring_admin_logged_in_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [adminUsername, setAdminUsername] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('ispring_admin_logged_in_v1') === 'true' ? 'admin' : null;
    } catch {
      return null;
    }
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfileData>(() => {
    const fallback: OwnerProfileData = {
      ownerName: 'ms. Reyhan lohyaa',
      ownerRole: 'Pemilik Website',
      quote: 'Mengajar dengan hati, menyusun evaluasi lebih cepat dan rapi setiap hari.',
      photoDataUrl: null,
    };
    try {
      const raw = localStorage.getItem('ispring_owner_profile_v1');
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<OwnerProfileData>;
      return {
        ownerName: typeof parsed.ownerName === 'string' && parsed.ownerName.trim() ? parsed.ownerName : fallback.ownerName,
        ownerRole: typeof parsed.ownerRole === 'string' && parsed.ownerRole.trim() ? parsed.ownerRole : fallback.ownerRole,
        quote: typeof parsed.quote === 'string' ? parsed.quote : fallback.quote,
        photoDataUrl: typeof parsed.photoDataUrl === 'string' ? parsed.photoDataUrl : null,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      };
    } catch {
      return fallback;
    }
  });
  const headerDocxInputRef = useRef<HTMLInputElement>(null);
  const questionCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4500);
  };

  const handleAdminLoginSuccess = (username: string) => {
    setIsAdminLoggedIn(true);
    setAdminUsername(username);
    try {
      sessionStorage.setItem('ispring_admin_logged_in_v1', 'true');
    } catch {
      // Ignore storage error
    }
    showToast(`Selamat datang, ${username}! Anda kini dapat mengubah foto & quote.`, 'success');
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminUsername(null);
    try {
      sessionStorage.removeItem('ispring_admin_logged_in_v1');
    } catch {
      // Ignore storage error
    }
    showToast('Anda telah keluar dari sesi admin.', 'info');
  };

  const handleOwnerProfileUpdated = (next: OwnerProfileData): boolean => {
    try {
      localStorage.setItem('ispring_owner_profile_v1', JSON.stringify(next));
      setOwnerProfile(next);
      return true;
    } catch {
      return false;
    }
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
      const analysis = analyzeQuizAnswers(converted);
      setPreviewFilter('all');

      const fmtCount = converted.filter(questionHasRichFormatting).length;
      const tblCount = converted.filter(questionHasTable).length;
      const imgCount = converted.filter(questionHasImage).length;

      if (analysis.incompleteCount > 0) {
        showToast(
          `Konversi selesai (${converted.length} soal), tetapi ${analysis.incompleteCount} soal masih memiliki jawaban/kunci kosong. Lihat panel Analisis di kanan.`,
          'info'
        );
      } else if (imgCount > 0) {
        showToast(
          `Selesai! ${converted.length} soal dikonversi (${imgCount} soal bergambar siap ditautkan ke Excel + Unduh Gambar Word).`,
          'success'
        );
      } else if (tblCount > 0) {
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
      const mediaParts: string[] = [];
      if (parsed.tableCount > 0) mediaParts.push(`${parsed.tableCount} tabel`);
      if (parsed.imageCount > 0) mediaParts.push(`${parsed.imageCount} gambar`);
      const mediaNote = mediaParts.length > 0 ? ` (${mediaParts.join(' & ')} terjaga)` : '';
      const unsupportedNote =
        parsed.unsupportedImageCount > 0
          ? ` Catatan: ${parsed.unsupportedImageCount} gambar format EMF/WMF Word tidak didukung browser—ubah ke PNG/JPG terlebih dahulu.`
          : '';

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
            `Berhasil mengekstrak ${converted.length} soal & kunci jawaban dari "${file.name}"${mediaNote}!${unsupportedNote}`,
            parsed.unsupportedImageCount > 0 ? 'info' : 'success'
          );
        } catch (convErr: any) {
          setConvertedQuestions([]);
          showToast(
            `Soal & kunci diekstrak dari "${file.name}", namun perlu dicek: ${
              convErr?.message || ''
            }${unsupportedNote}`,
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
              `Berhasil mengimpor & mengonversi ${converted.length} soal dari "${file.name}"${mediaNote}.${unsupportedNote}`,
              parsed.unsupportedImageCount > 0 ? 'info' : 'success'
            );
            return;
          } catch {
            // Fall back to regular load notice below
          }
        }
        showToast(
          `Soal dari "${file.name}" dimuat${mediaNote} (tidak ditemukan bagian "Kunci Jawaban").${unsupportedNote}`,
          'info'
        );
      } else {
        setAutoQuestionsHtml(qHtml);
        try {
          const converted = convertAutoRich(
            parsed.questionNodes,
            autoKeys || '',
            defaultPoints
          );
          setConvertedQuestions(converted);
          const analysis = analyzeQuizAnswers(converted);
          showToast(
            analysis.incompleteCount > 0
              ? `Soal dari "${file.name}" dimuat (${converted.length} soal${mediaParts.length ? ', ' + mediaParts.join(' & ') : ''}), ${analysis.incompleteCount} soal jawabannya masih kosong.${unsupportedNote}`
              : `Soal dari "${file.name}" dimuat${mediaNote} & dicocokkan dengan kunci yang ada.${unsupportedNote}`,
            'info'
          );
        } catch {
          showToast(
            parsed.hasKeysSection
              ? `Soal dari "${file.name}" dimuat${mediaNote}, tetapi isi "Kunci Jawaban" kosong.${unsupportedNote}`
              : `Soal dari "${file.name}" dimuat${mediaNote}! Tambahkan heading "Kunci Jawaban" di Word atau isi kolom Kunci Jawaban di kanan.${unsupportedNote}`,
            'info'
          );
        }
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
      const { filename, formattedCount, tableImageCount, mathImageCount, wordImageCount } =
        await exportRichQuizToExcel(
          convertedQuestions,
          tableExportMode,
          mathExportMode,
          dollarSyntax
        );
      const hasWarning = answerAnalysis.incompleteCount > 0;
      const incompleteWarn = hasWarning
        ? ` Catatan: ${answerAnalysis.incompleteCount} soal masih memiliki jawaban/kunci kosong.`
        : '';
      if (wordImageCount > 0 || tableImageCount > 0 || mathImageCount > 0) {
        const parts: string[] = [];
        if (wordImageCount > 0) parts.push(`${wordImageCount} gambar Word`);
        if (tableImageCount > 0) parts.push(`${tableImageCount} gambar tabel`);
        if (mathImageCount > 0) parts.push(`${mathImageCount} gambar rumus`);
        showToast(
          `Excel "${filename}" diunduh (${parts.join(' & ')} ditautkan ke kolom Image).${incompleteWarn}`,
          hasWarning ? 'info' : 'success'
        );
      } else if (formattedCount > 0) {
        showToast(
          `Excel "${filename}" diunduh dengan ${formattedCount} sel berformat Bold/Italic/Underline!${incompleteWarn}`,
          hasWarning ? 'info' : 'success'
        );
      } else {
        showToast(
          `Excel "${filename}" diunduh! Siap diimpor ke iSpring QuizMaker.${incompleteWarn}`,
          hasWarning ? 'info' : 'success'
        );
      }
    } catch (err: any) {
      showToast('Gagal mengekspor Excel: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToQuiz = async () => {
    if (convertedQuestions.length === 0 || isExportingQuiz) return;
    setIsExportingQuiz(true);
    try {
      const {
        filename,
        questionCount,
        formattedSlideCount,
        embeddedWordImageCount,
        embeddedTableCount,
      } = await exportRichQuizToISpringQuiz(
        convertedQuestions,
        mathExportMode,
        dollarSyntax,
        quizResultOptions,
        tableExportMode
      );
      const hasWarning = answerAnalysis.incompleteCount > 0;
      const incompleteWarn = hasWarning
        ? ` Catatan: ${answerAnalysis.incompleteCount} soal masih memiliki jawaban/kunci kosong.`
        : '';
      const detailParts: string[] = [`${questionCount} soal`];
      if (formattedSlideCount > 0) {
        detailParts.push(`${formattedSlideCount} soal berformat Bold/Italic/Underline`);
      }
      if (embeddedTableCount > 0) {
        detailParts.push(`${embeddedTableCount} tabel dijadikan gambar`);
      }
      if (embeddedWordImageCount > 0) {
        detailParts.push(`${embeddedWordImageCount} gambar disematkan`);
      }
      showToast(
        `File "${filename}" (${detailParts.join(', ')}) siap dibuka di iSpring QuizMaker!${incompleteWarn}`,
        hasWarning ? 'info' : 'success'
      );
    } catch (err: any) {
      showToast('Gagal membuat file .quiz: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsExportingQuiz(false);
    }
  };

  const handleDownloadAllWordImages = async () => {
    if (isExportingWordImages) return;
    setIsExportingWordImages(true);
    try {
      const { count, filename } = await downloadAllWordImages(convertedQuestions);
      showToast(
        `${count} gambar Word berhasil diunduh (${filename}). Simpan satu folder dengan file Excel sebelum impor ke iSpring.`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh gambar Word', 'error');
    } finally {
      setIsExportingWordImages(false);
    }
  };

  const handleDownloadSingleWordImage = async (q: RichQuestion, questionIdx: number) => {
    try {
      const filename = await downloadQuestionWordImage(q.questionImages, questionIdx);
      showToast(`Gambar soal "${filename}" diunduh!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh gambar soal', 'error');
    }
  };

  const handleDownloadAllTables = async () => {
    if (isExportingImages) return;
    setIsExportingImages(true);
    try {
      const { count, filename } = await downloadAllTableImages(
        convertedQuestions,
        mathExportMode,
        dollarSyntax
      );
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

  const handleDownloadSingleTable = async (tables: RichTable | RichTable[], questionIdx: number) => {
    try {
      const filename = await downloadQuestionTablePng(
        tables,
        questionIdx,
        mathExportMode,
        dollarSyntax
      );
      showToast(`Gambar tabel "${filename}" diunduh!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh gambar tabel', 'error');
    }
  };

  const handleDownloadAllMath = async () => {
    if (isExportingMathImages) return;
    setIsExportingMathImages(true);
    try {
      const { count, filename } = await downloadAllMathImages(
        convertedQuestions,
        dollarSyntax
      );
      showToast(
        `${count} gambar rumus berhasil diunduh (${filename}). Simpan satu folder dengan file Excel sebelum impor ke iSpring.`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal membuat gambar rumus', 'error');
    } finally {
      setIsExportingMathImages(false);
    }
  };

  const handleDownloadSingleMath = async (q: RichQuestion, questionIdx: number) => {
    try {
      const filename = await downloadQuestionMathPng(q, questionIdx, dollarSyntax);
      showToast(`Gambar rumus "${filename}" diunduh!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh gambar rumus', 'error');
    }
  };

  const handleCopyQuestionMathML = async (
    id: string,
    q: RichQuestion,
    questionIdx: number
  ) => {
    const segs = extractMathSegmentsFromQuestion(q, dollarSyntax);
    if (segs.length === 0) return;
    const mmlList = segs
      .map((s) => convertMathToMathML(s.code, s.format, true))
      .filter(Boolean);
    if (mmlList.length === 0) {
      showToast('Gagal mengonversi rumus ke MathML.', 'error');
      return;
    }
    await navigator.clipboard?.writeText(mmlList.join('\n'));
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    showToast(
      `MathML Soal ${questionIdx + 1} disalin! Dapat langsung ditempel ke Word / editor MathML.`,
      'success'
    );
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

  const questionHasMath = (q: RichQuestion) =>
    hasMathInNodes(q.questionNodes, dollarSyntax) ||
    q.answers.some((a) => hasMathInRichText(a.richText, dollarSyntax));

  const formattedQuestionsCount = useMemo(
    () =>
      convertedQuestions.filter(
        (q) =>
          questionHasRichFormatting(q) ||
          questionHasTable(q) ||
          questionHasImage(q) ||
          questionHasMath(q)
      ).length,
    [convertedQuestions, dollarSyntax]
  );

  const tableQuestionsCount = useMemo(
    () => convertedQuestions.filter(questionHasTable).length,
    [convertedQuestions]
  );

  const wordImageQuestionsCount = useMemo(
    () => convertedQuestions.filter(questionHasImage).length,
    [convertedQuestions]
  );

  const mathQuestionsCount = useMemo(
    () => convertedQuestions.filter(questionHasMath).length,
    [convertedQuestions, dollarSyntax]
  );

  const answerAnalysis = useMemo(
    () => analyzeQuizAnswers(convertedQuestions),
    [convertedQuestions]
  );

  const handleToggleOptionCorrect = (questionIdx: number, optionIdx: number) => {
    const target = convertedQuestions[questionIdx];
    if (!target) return;

    const nextAnswers = target.answers.map((ans, aIdx) =>
      aIdx === optionIdx ? { ...ans, isCorrect: !ans.isCorrect } : ans
    );
    const correctCount = nextAnswers.filter((a) => a.isCorrect).length;

    setConvertedQuestions((prev) =>
      prev.map((q, idx) =>
        idx === questionIdx
          ? {
              ...q,
              type: correctCount > 1 ? 'MR' : 'MC',
              answers: nextAnswers,
            }
          : q
      )
    );

    if (mode === 'auto') {
      const qNum = target.sourceNumber ?? questionIdx + 1;
      const letters = nextAnswers
        .map((a, aIdx) => (a.isCorrect ? String.fromCharCode(97 + aIdx) : ''))
        .filter(Boolean);
      setAutoKeys((curr) => upsertAutoKeyLine(curr, qNum, letters));
    }
  };

  const handleJumpToQuestion = (questionIdx: number) => {
    if (previewFilter === 'formatted') {
      setPreviewFilter('all');
    }
    setHighlightedQuestionIdx(questionIdx);
    setTimeout(() => {
      questionCardRefs.current[questionIdx]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 60);
    setTimeout(() => {
      setHighlightedQuestionIdx((prev) => (prev === questionIdx ? null : prev));
    }, 2200);
  };

  const handleCopyEmptyAnswerReport = async () => {
    const report = formatEmptyAnswerReport(answerAnalysis);
    await navigator.clipboard?.writeText(report);
    setCopiedId('empty-report');
    setTimeout(() => {
      setCopiedId((prev) => (prev === 'empty-report' ? null : prev));
    }, 2000);
    showToast('Daftar soal yang jawabannya masih kosong disalin ke clipboard.', 'success');
  };

  const displayedQuestions = useMemo(() => {
    return convertedQuestions
      .map((q, idx) => ({ q, originalIndex: idx }))
      .filter(({ q, originalIndex }) => {
        if (previewFilter === 'incomplete') {
          return answerAnalysis.issuesByIndex.has(originalIndex);
        }
        if (previewFilter === 'formatted') {
          return (
            questionHasRichFormatting(q) ||
            questionHasTable(q) ||
            questionHasImage(q) ||
            questionHasMath(q)
          );
        }
        return true;
      });
  }, [convertedQuestions, previewFilter, dollarSyntax, answerAnalysis]);

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-md shadow-indigo-100 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                iSpring Quiz Converter ms. Reyhan lohyaa
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Ubah Soal Teks Menjadi File .quiz &amp; Template Excel iSpring Suite
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {isAdminLoggedIn ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin: {adminUsername || 'admin'}
                </span>
                <button
                  type="button"
                  onClick={handleAdminLogout}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Keluar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3.5 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5 text-indigo-600" />
                Login Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Owner Photo Frame & Custom Quote */}
        <div className="lg:col-span-12">
          <OwnerSpotlight
            profile={ownerProfile}
            isAdmin={isAdminLoggedIn}
            onProfileUpdated={handleOwnerProfileUpdated}
            onOpenLogin={() => setIsLoginModalOpen(true)}
            onNotify={showToast}
          />
        </div>

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
                    <li>Format <b>Bold</b>, <i>Italic</i>, <u>Underline</u>, <b>Gambar</b>, dan <b>Tabel</b> (termasuk tabel kunci jawaban) otomatis terbaca &amp; dipertahankan.</li>
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
                      mathEngine={mathEngine}
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
                  <p className="font-bold mb-1 text-slate-700">Aturan Penulisan Manual (Mendukung Bold / Italic / Underline / Tabel / Matematika):</p>
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
                  mathEngine={mathEngine}
                />
              </div>
            )}

            {/* Supported Math Formats Hint */}
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Sigma className="w-3.5 h-3.5 text-indigo-600" />
                Sintaks Matematika:
              </span>
              <span><b>LaTeX/KaTeX/MathJax:</b> <code className="bg-white border border-slate-200 px-1 rounded">$...$</code> / <code className="bg-white border border-slate-200 px-1 rounded">$$...$$</code></span>
              <span><b>AsciiMath:</b> <code className="bg-white border border-slate-200 px-1 rounded">`...`</code></span>
              <span><b>Typst:</b> <code className="bg-white border border-slate-200 px-1 rounded">[typst]...[/typst]</code></span>
              <span><b>MathML:</b> <code className="bg-white border border-slate-200 px-1 rounded">&lt;math&gt;...&lt;/math&gt;</code></span>
            </div>

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
              <div className="flex flex-wrap items-center gap-2">
                {wordImageQuestionsCount > 0 && (
                  <button
                    onClick={handleDownloadAllWordImages}
                    disabled={isExportingWordImages}
                    className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    title="Unduh semua gambar Word untuk ditaruh satu folder dengan Excel saat impor ke iSpring"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    {isExportingWordImages
                      ? 'Membuat...'
                      : `Unduh Gambar Word (${wordImageQuestionsCount})`}
                  </button>
                )}
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
                {mathQuestionsCount > 0 && mathExportMode === 'image' && (
                  <button
                    onClick={handleDownloadAllMath}
                    disabled={isExportingMathImages}
                    className="bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    title="Unduh gambar PNG rumus matematika untuk ditaruh satu folder dengan Excel"
                  >
                    <Sigma className="w-3.5 h-3.5" />
                    {isExportingMathImages
                      ? 'Membuat...'
                      : `Unduh Rumus (${mathQuestionsCount})`}
                  </button>
                )}
                <button
                  onClick={exportToQuiz}
                  disabled={convertedQuestions.length === 0 || isExportingQuiz}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/10 cursor-pointer"
                  title="Unduh paket file .quiz siap buka di iSpring QuizMaker dengan format Bold/Italic/Underline terjaga"
                >
                  <FileArchive className="w-4 h-4" />
                  {isExportingQuiz ? 'Membuat .quiz...' : 'Unduh .quiz'}
                </button>
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

            {convertedQuestions.length > 0 && wordImageQuestionsCount > 0 && (
              <div className="mb-3 p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl text-[11px] text-emerald-950 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Terdeteksi {wordImageQuestionsCount} Soal Bergambar dari Word:
                </p>
                <p>
                  Gambar sudah siap disematkan otomatis ke dalam file <b>.quiz</b> (folder <code>images/</code> iSpring). Jika mengekspor lewat <b>Unduh Excel</b>, klik juga <b>Unduh Gambar Word ({wordImageQuestionsCount})</b> dan taruh dalam satu folder yang sama dengan Excel.
                </p>
              </div>
            )}

            {/* Math Engine & Export Controls when math exists */}
            {convertedQuestions.length > 0 && mathQuestionsCount > 0 && (
              <div className="mb-3 p-3 bg-violet-50/80 border border-violet-200 rounded-xl text-[11px] text-violet-950 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <Sigma className="w-3.5 h-3.5 text-violet-600" />
                    Sistem Matematika ({mathQuestionsCount} soal):
                  </span>
                  <div className="flex items-center gap-1 bg-white/80 p-0.5 rounded-lg border border-violet-200">
                    <button
                      type="button"
                      onClick={() => setMathEngine('katex')}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        mathEngine === 'katex'
                          ? 'bg-violet-600 text-white'
                          : 'text-violet-700 hover:bg-violet-100'
                      }`}
                    >
                      KaTeX
                    </button>
                    <button
                      type="button"
                      onClick={() => setMathEngine('mathjax')}
                      className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        mathEngine === 'mathjax'
                          ? 'bg-violet-600 text-white'
                          : 'text-violet-700 hover:bg-violet-100'
                      }`}
                    >
                      MathJax
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="block font-semibold text-violet-800 mb-1">
                      Mode Ekspor Rumus ke Excel:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'unicode', label: 'Unicode' },
                          { id: 'image', label: 'PNG Image' },
                          { id: 'raw', label: 'Kode Asli' },
                        ] as { id: MathExportMode; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMathExportMode(opt.id)}
                          className={`py-1 px-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                            mathExportMode === opt.id
                              ? 'bg-white border-violet-400 text-violet-800 shadow-2xs'
                              : 'bg-violet-100/60 border-transparent text-violet-700/80 hover:bg-white/70'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block font-semibold text-violet-800 mb-1">
                      Sintaks <code className="bg-violet-100 px-1 rounded">$...$</code>:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: 'latex', label: 'LaTeX' },
                          { id: 'typst', label: 'Typst' },
                        ] as { id: DollarSyntaxMode; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDollarSyntax(opt.id)}
                          className={`py-1 px-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                            dollarSyntax === opt.id
                              ? 'bg-white border-violet-400 text-violet-800 shadow-2xs'
                              : 'bg-violet-100/60 border-transparent text-violet-700/80 hover:bg-white/70'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Table Export Options when tables exist */}
            {convertedQuestions.length > 0 && tableQuestionsCount > 0 && (
              <div className="mb-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-[11px] text-indigo-950 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold flex items-center gap-1.5">
                    <TableIcon className="w-3.5 h-3.5 text-indigo-600" />
                    Mode Tabel ke iSpring ({tableQuestionsCount} soal bertabel):
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
                    Otomatis Jadi Gambar PNG
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
                    ? 'Aktif otomatis: Tabel langsung dikonversi menjadi gambar PNG dan disematkan ke dalam slide file .quiz agar tampil rapi di iSpring. Untuk ekspor Excel, kolom Image otomatis diisi tabel_soal_X.png (unduh file gambarnya via tombol Unduh Tabel).'
                    : 'Tabel ditulis sebagai teks dengan pemisah "|" antar kolom di .quiz dan Excel (tidak menjadi gambar tabel di iSpring).'}
                </p>
              </div>
            )}

            {/* Final Slide Options for .quiz */}
            {convertedQuestions.length > 0 && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/80 text-[11px] text-slate-700">
                <button
                  type="button"
                  onClick={() => setShowQuizResultSettings((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 font-bold text-slate-800 hover:bg-slate-100/70 rounded-xl transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    Pengaturan Final Slide (.quiz):
                    <span className="font-normal text-slate-500">
                      Slide Gagal {Object.values(quizResultOptions.failed).every((v) => !v)
                        ? '(Semua info & retry disembunyikan)'
                        : '(Kustom)'}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-indigo-600">
                    {showQuizResultSettings ? 'Tutup' : 'Ubah'}
                  </span>
                </button>

                {showQuizResultSettings && (
                  <div className="px-3.5 pb-3 pt-1 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['failed', 'passed'] as const).map((branch) => {
                      const isFailed = branch === 'failed';
                      const branchOpts = quizResultOptions[branch];
                      const items: { key: keyof ResultSlideDisplayOptions; label: string }[] = [
                        { key: 'showUserScore', label: "Show user's score" },
                        { key: 'showPassingScore', label: 'Show passing score' },
                        { key: 'allowReview', label: 'Allow user to review quiz' },
                        { key: 'showDetailedReport', label: 'Show detailed report' },
                        { key: 'allowRetry', label: 'Allow user to retry quiz' },
                      ];
                      return (
                        <div
                          key={branch}
                          className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                            <span
                              className={`font-extrabold ${
                                isFailed ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {isFailed ? 'When user fails:' : 'When user passes:'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const allOff = Object.values(branchOpts).every((v) => !v);
                                setQuizResultOptions((prev) => ({
                                  ...prev,
                                  [branch]: {
                                    showUserScore: allOff,
                                    showPassingScore: allOff,
                                    allowReview: allOff,
                                    showDetailedReport: false,
                                    allowRetry: allOff,
                                  },
                                }));
                              }}
                              className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                            >
                              {Object.values(branchOpts).every((v) => !v)
                                ? 'Aktifkan standar'
                                : 'Matikan semua'}
                            </button>
                          </div>
                          {items.map((item) => (
                            <label
                              key={item.key}
                              className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={branchOpts[item.key]}
                                onChange={(e) =>
                                  setQuizResultOptions((prev) => ({
                                    ...prev,
                                    [branch]: {
                                      ...prev[branch],
                                      [item.key]: e.target.checked,
                                    },
                                  }))
                                }
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Empty Answer Analysis Panel */}
            {convertedQuestions.length > 0 && (
              <div
                className={`mb-3 rounded-xl border p-3.5 text-xs ${
                  answerAnalysis.incompleteCount === 0
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50/70 border-rose-200 text-rose-950'
                }`}
              >
                {answerAnalysis.incompleteCount === 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Analisis Jawaban: Semua {answerAnalysis.totalQuestions} soal memiliki opsi & kunci jawaban lengkap.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-extrabold text-rose-800">
                        <ClipboardList className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          Analisis Jawaban Kosong: {answerAnalysis.incompleteCount} dari {answerAnalysis.totalQuestions} soal
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCopyEmptyAnswerReport}
                          className="px-2 py-1 rounded-lg border border-rose-200 bg-white hover:bg-rose-100/70 text-[11px] font-semibold text-rose-700 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Salin daftar nomor soal yang jawabannya masih kosong"
                        >
                          {copiedId === 'empty-report' ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          Salin Daftar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewFilter((prev) =>
                              prev === 'incomplete' ? 'all' : 'incomplete'
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            previewFilter === 'incomplete'
                              ? 'bg-rose-700 text-white shadow-xs'
                              : 'bg-rose-600 hover:bg-rose-700 text-white'
                          }`}
                        >
                          {previewFilter === 'incomplete'
                            ? 'Tampilkan Semua'
                            : `Filter Kosong (${answerAnalysis.incompleteCount})`}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="bg-white/90 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                        <span className="block text-slate-500 font-medium">Kunci Kosong</span>
                        <span className="text-sm font-extrabold text-rose-700">
                          {answerAnalysis.noKeyCount} soal
                        </span>
                      </div>
                      <div className="bg-white/90 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                        <span className="block text-slate-500 font-medium">Opsi Tidak Ada</span>
                        <span className="text-sm font-extrabold text-rose-700">
                          {answerAnalysis.noOptionsCount} soal
                        </span>
                      </div>
                      <div className="bg-white/90 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                        <span className="block text-slate-500 font-medium">Teks Opsi Kosong</span>
                        <span className="text-sm font-extrabold text-amber-700">
                          {answerAnalysis.emptyOptionTextCount} soal
                        </span>
                      </div>
                    </div>

                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                      {answerAnalysis.issues.map((issue) => (
                        <button
                          key={issue.index}
                          type="button"
                          onClick={() => handleJumpToQuestion(issue.index)}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/90 hover:bg-white border border-rose-200/70 hover:border-rose-400 transition-all flex items-center justify-between gap-2 text-[11px] cursor-pointer"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-extrabold text-rose-700 mr-1.5">
                              Soal #{issue.displayNumber}
                            </span>
                            <span className="text-slate-600">{issue.questionSnippet}</span>
                          </span>
                          <span className="shrink-0 font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded">
                            {describeIssueReasons(issue)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filter & Rich Text Note for iSpring */}
            {convertedQuestions.length > 0 &&
              (formattedQuestionsCount > 0 || answerAnalysis.incompleteCount > 0) && (
              <div className="mb-3 space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setPreviewFilter('all')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      previewFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({convertedQuestions.length})
                  </button>
                  {answerAnalysis.incompleteCount > 0 && (
                    <button
                      onClick={() => setPreviewFilter('incomplete')}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        previewFilter === 'incomplete'
                          ? 'bg-white text-rose-700 shadow-xs'
                          : 'text-rose-700/80 hover:text-rose-800'
                      }`}
                    >
                      <AlertCircle className="w-3 h-3" />
                      Jawaban Kosong ({answerAnalysis.incompleteCount})
                    </button>
                  )}
                  {formattedQuestionsCount > 0 && (
                    <button
                      onClick={() => setPreviewFilter('formatted')}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        previewFilter === 'formatted'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      Berformat / Rumus ({formattedQuestionsCount})
                    </button>
                  )}
                </div>

                {formattedQuestionsCount > 0 &&
                  tableQuestionsCount === 0 &&
                  mathQuestionsCount === 0 && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                      <b>Info Format iSpring:</b> Gunakan tombol <b>Unduh .quiz</b> untuk membuka langsung di iSpring QuizMaker dengan format <b>Bold</b>, <i>Italic</i>, &amp; <u>Underline</u> terjaga penuh, atau gunakan <b>Unduh Excel</b> / <b>Salin Berformat</b> (<code className="bg-amber-100 px-1 rounded font-bold">Ctrl+V</code>).
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
              ) : displayedQuestions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-500">
                  <CheckCircle className="w-10 h-10 mb-2.5 text-emerald-500" />
                  <p className="text-sm font-bold text-slate-700">
                    Tidak ada soal pada filter ini
                  </p>
                  <p className="text-xs text-slate-400 mt-1 mb-3">
                    {previewFilter === 'incomplete'
                      ? 'Semua soal sudah memiliki opsi & kunci jawaban lengkap.'
                      : 'Coba tampilkan semua soal untuk melihat daftar lengkap.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('all')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Tampilkan Semua Soal ({convertedQuestions.length})
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayedQuestions.map(({ q, originalIndex }) => {
                    const issue = answerAnalysis.issuesByIndex.get(originalIndex);
                    const hasCorrect = q.answers.some((a) => a.isCorrect);
                    const qHasFormat = questionHasRichFormatting(q);
                    const qTable = getFirstQuestionTable(q);
                    const qMathSegments = extractMathSegmentsFromQuestion(q, dollarSyntax);
                    const qHasMath = qMathSegments.length > 0;
                    const qHasWordImage = q.questionImages.length > 0;
                    const qFormatTags = [
                      ...getFormattingSummary(q.questionNodes),
                      ...(qHasMath || q.answers.some((a) => hasMathInRichText(a.richText, dollarSyntax))
                        ? ['Rumus']
                        : []),
                    ];
                    const qCopyId = `q-${originalIndex}`;
                    const qMmlCopyId = `mml-${originalIndex}`;
                    const effectiveImage =
                      q.image ||
                      (qHasWordImage
                        ? getWordImageFilename(originalIndex, q.questionImages)
                        : qTable && tableExportMode === 'image'
                          ? getTableImageFilename(originalIndex)
                          : qHasMath && mathExportMode === 'image'
                            ? getMathImageFilename(originalIndex)
                            : '');

                    const displayNum = q.sourceNumber ?? originalIndex + 1;
                    const isHighlighted = highlightedQuestionIdx === originalIndex;
                    return (
                      <div
                        key={originalIndex}
                        ref={(el) => {
                          questionCardRefs.current[originalIndex] = el;
                        }}
                        className={`bg-white p-4 rounded-xl border shadow-sm relative transition-all ${
                          isHighlighted
                            ? 'border-indigo-500 ring-2 ring-indigo-200'
                            : issue
                              ? 'border-rose-300 ring-1 ring-rose-100'
                              : 'border-slate-200/80'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                              SOAL {displayNum} ({q.type})
                            </span>
                            {qFormatTags.length > 0 && (
                              <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {qFormatTags.join(' · ')}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {qHasWordImage && (
                              <button
                                type="button"
                                onClick={() => handleDownloadSingleWordImage(q, originalIndex)}
                                className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-800 hover:bg-amber-100 flex items-center gap-1 transition-all cursor-pointer"
                                title="Unduh gambar soal dari Word"
                              >
                                <Download className="w-3 h-3" />
                                Gambar
                              </button>
                            )}
                            {qTable && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadSingleTable(getQuestionTables(q), originalIndex)
                                }
                                className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-all cursor-pointer"
                                title="Unduh tabel ini sebagai gambar PNG"
                              >
                                <Download className="w-3 h-3" />
                                Tabel PNG
                              </button>
                            )}
                            {qHasMath && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadSingleMath(q, originalIndex)}
                                  className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-violet-200 bg-violet-50/70 text-violet-700 hover:bg-violet-100 flex items-center gap-1 transition-all cursor-pointer"
                                  title="Unduh rumus soal ini sebagai gambar PNG"
                                >
                                  <Download className="w-3 h-3" />
                                  Rumus PNG
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyQuestionMathML(qMmlCopyId, q, originalIndex)}
                                  className={`text-[11px] font-semibold px-2 py-1 rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
                                    copiedId === qMmlCopyId
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                  title="Salin MathML untuk ditempel ke Word / Equation Editor"
                                >
                                  {copiedId === qMmlCopyId ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  MathML
                                </button>
                              </>
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
                          prefixNumber={displayNum}
                          mathEngine={mathEngine}
                          dollarSyntax={dollarSyntax}
                          tableExportMode={tableExportMode}
                          mathExportMode={mathExportMode}
                        />

                        {q.answers.length === 0 ? (
                          <div className="border border-dashed border-rose-300 bg-rose-50/70 rounded-lg px-3 py-2.5 text-xs text-rose-700 font-medium">
                            Opsi pilihan jawaban kosong / tidak terdeteksi (pastikan opsi diawali huruf a., b., c., d.).
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2">
                            {q.answers.map((ans, optIdx) => {
                              const char = String.fromCharCode(97 + optIdx);
                              const ansHasFormat = hasRichFormatting(ans.richText);
                              const ansHasImages = Boolean(ans.images && ans.images.length > 0);
                              const isOptionEmpty = ans.text.trim() === '' && !ansHasImages;
                              const ansCopyId = `a-${originalIndex}-${optIdx}`;
                              return (
                                <div
                                  key={optIdx}
                                  className={`flex items-center justify-between gap-2 border px-3 py-2 rounded-lg text-xs ${
                                    isOptionEmpty
                                      ? 'bg-amber-50/80 text-amber-800 border-amber-300'
                                      : ans.isCorrect
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : 'bg-slate-50 text-slate-700 border-slate-100'
                                  }`}
                                >
                                  <span className="flex items-start gap-2 min-w-0">
                                    <span className="uppercase font-bold text-[10px] bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                                      {char}
                                    </span>
                                    <span className="leading-relaxed break-words space-y-1.5">
                                      {isOptionEmpty ? (
                                        <span className="italic text-amber-700">
                                          (Teks opsi {char.toUpperCase()} masih kosong)
                                        </span>
                                      ) : (
                                        <>
                                          {ans.text.trim() !== '' && (
                                            <RichTextRenderer
                                              lines={ans.richText}
                                              mathEngine={mathEngine}
                                              dollarSyntax={dollarSyntax}
                                            />
                                          )}
                                          {ans.images?.map((img, imIdx) => (
                                            <img
                                              key={imIdx}
                                              src={img.dataUrl}
                                              alt={img.alt || `Gambar opsi ${char.toUpperCase()}`}
                                              referrerPolicy="no-referrer"
                                              className="block max-h-36 max-w-full rounded border border-slate-200 bg-white object-contain"
                                            />
                                          ))}
                                        </>
                                      )}
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
                                            `Opsi ${char.toUpperCase()} Soal ${displayNum}`
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
                                    <button
                                      type="button"
                                      onClick={() => handleToggleOptionCorrect(originalIndex, optIdx)}
                                      className={`rounded-full p-0.5 flex items-center justify-center transition-all cursor-pointer ${
                                        ans.isCorrect
                                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                          : 'px-2 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 hover:border-emerald-300 hover:text-emerald-700'
                                      }`}
                                      title={
                                        ans.isCorrect
                                          ? 'Batalkan tanda kunci jawaban'
                                          : `Tandai opsi ${char.toUpperCase()} sebagai kunci jawaban`
                                      }
                                    >
                                      {ans.isCorrect ? (
                                        <Check className="w-3 h-3" />
                                      ) : (
                                        'Tandai'
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {issue && (
                          <div className="mt-3 bg-rose-50 text-rose-700 border border-rose-200/80 text-[11px] font-semibold px-3 py-2 rounded-lg flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {describeIssueReasons(issue)}
                            </span>
                            {!hasCorrect && q.answers.length > 0 && (
                              <span className="text-[10px] font-normal text-rose-600">
                                Klik &quot;Tandai&quot; di opsi untuk isi kunci
                              </span>
                            )}
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
          <p>© 2026 iSpring Quiz Converter ms. Reyhan lohyaa. 100% Kompatibel dengan iSpring Suite QuizMaker.</p>
          <p className="mt-2 font-medium text-slate-600">Made by ms. Reyhan lohyaa</p>
        </div>
      </footer>

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={handleAdminLoginSuccess}
      />

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
