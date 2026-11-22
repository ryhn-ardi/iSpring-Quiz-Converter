import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  RemoveFormatting,
  FileUp,
  Table as TableIcon,
  Sigma,
} from 'lucide-react';
import mammoth from 'mammoth';
import {
  escapeHtml,
  htmlToRichNodes,
  richNodesToEditorHtml,
  richNodesToHtml,
} from '../utils/richText';
import { MathEquationModal } from './MathEquationModal';
import { MathRenderEngine } from '../utils/mathEngine';

type RichQuizEditorProps = {
  valueHtml: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
  onNotify?: (message: string, type: 'info' | 'success' | 'error') => void;
  onDocxFileSelected?: (file: File) => void | Promise<void>;
  mathEngine?: MathRenderEngine;
};

export const RichQuizEditor: React.FC<RichQuizEditorProps> = ({
  valueHtml,
  onChangeHtml,
  placeholder,
  onNotify,
  onDocxFileSelected,
  mathEngine = 'katex',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastHtmlRef = useRef<string>(valueHtml);
  const savedRangeRef = useRef<Range | null>(null);
  const [mathModalOpen, setMathModalOpen] = useState(false);

  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
  });

  const isEditorEmpty =
    !valueHtml ||
    valueHtml === '<br>' ||
    valueHtml === '<div><br></div>' ||
    (valueHtml.replace(/<[^>]*>/g, '').trim() === '' && !valueHtml.includes('<table'));

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (valueHtml !== lastHtmlRef.current) {
      el.innerHTML = valueHtml;
      lastHtmlRef.current = valueHtml;
    }
  }, [valueHtml]);

  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== valueHtml) {
      el.innerHTML = valueHtml;
      lastHtmlRef.current = valueHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshActiveFormats = () => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    if (!el.contains(sel.anchorNode)) return;

    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {
      // Ignore unsupported browser queryCommandState
    }
  };

  useEffect(() => {
    const handleSelectionChange = () => refreshActiveFormats();
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastHtmlRef.current = html;
    onChangeHtml(html);
    refreshActiveFormats();
  };

  const execFormat = (command: 'bold' | 'italic' | 'underline' | 'removeFormat') => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false);
    emitChange();
  };

  const insertSampleTable = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const tableHtml =
      '<table><tbody>' +
      '<tr><th>Kolom 1</th><th>Kolom 2</th></tr>' +
      '<tr><td>Data A1</td><td>Data B1</td></tr>' +
      '<tr><td>Data A2</td><td>Data B2</td></tr>' +
      '</tbody></table><div><br></div>';
    document.execCommand('insertHTML', false, tableHtml);
    emitChange();
  };

  const openMathModal = () => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (el && sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
    setMathModalOpen(true);
  };

  const insertMathSnippet = (delimitedCode: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    document.execCommand('insertText', false, delimitedCode);
    savedRangeRef.current = null;
    emitChange();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clipboard = e.clipboardData;
    const rawHtml = clipboard.getData('text/html');
    const rawPlain = clipboard.getData('text/plain');

    let cleanHtmlToInsert = '';

    if (rawHtml && rawHtml.trim().length > 0) {
      const richNodes = htmlToRichNodes(rawHtml);
      if (richNodes.length > 0) {
        cleanHtmlToInsert = richNodesToHtml(richNodes, false);
      }
    }

    if (!cleanHtmlToInsert && rawPlain) {
      cleanHtmlToInsert = escapeHtml(rawPlain).replace(/\r?\n/g, '<br>');
    }

    if (cleanHtmlToInsert) {
      document.execCommand('insertHTML', false, cleanHtmlToInsert);
      emitChange();
    }
  };

  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (onDocxFileSelected) {
      await onDocxFileSelected(file);
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        { styleMap: ['u => u'] }
      );
      const richNodes = htmlToRichNodes(result.value);
      const editorHtml = richNodesToEditorHtml(richNodes);

      if (editorRef.current) {
        editorRef.current.innerHTML = editorHtml;
      }
      lastHtmlRef.current = editorHtml;
      onChangeHtml(editorHtml);

      const tableCount = richNodes.filter((n) => n.type === 'table').length;
      onNotify?.(
        tableCount > 0
          ? `Berhasil mengimpor "${file.name}" (${tableCount} tabel & format teks terjaga).`
          : `Berhasil mengimpor "${file.name}" beserta format Bold, Italic, dan Underline.`,
        'success'
      );
    } catch (err: any) {
      onNotify?.(
        'Gagal membaca file .docx: ' + (err?.message || 'Format file tidak valid'),
        'error'
      );
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 bg-white">
      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Bold (Ctrl+B)"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('bold');
            }}
            className={`p-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${
              activeFormats.bold
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Italic (Ctrl+I)"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('italic');
            }}
            className={`p-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${
              activeFormats.italic
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Underline (Ctrl+U)"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('underline');
            }}
            className={`p-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${
              activeFormats.underline
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button
            type="button"
            title="Hapus Format Teks Terpilih"
            onMouseDown={(e) => {
              e.preventDefault();
              execFormat('removeFormat');
            }}
            className="p-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-200/70 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Sisipkan Contoh Tabel"
            onMouseDown={(e) => {
              e.preventDefault();
              insertSampleTable();
            }}
            className="p-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-200/70 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <TableIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Sisipkan Rumus Matematika (LaTeX / AsciiMath / Typst / MathML)"
            onMouseDown={(e) => {
              e.preventDefault();
              openMathModal();
            }}
            className="px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Sigma className="w-3.5 h-3.5" />
            Rumus
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleDocxUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-700 text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            title="Impor langsung dari file Microsoft Word (.docx) sambil menjaga Bold, Italic, Underline, dan Tabel"
          >
            <FileUp className="w-3.5 h-3.5 text-indigo-600" />
            Impor Word (.docx)
          </button>
        </div>
      </div>

      {/* Editable Content Area */}
      <div className="relative">
        {isEditorEmpty && placeholder && (
          <div className="absolute inset-0 p-4 text-sm font-mono leading-relaxed text-slate-400 pointer-events-none whitespace-pre-wrap select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onPaste={handlePaste}
          onKeyUp={refreshActiveFormats}
          onMouseUp={refreshActiveFormats}
          className="w-full min-h-[256px] max-h-[380px] overflow-y-auto p-4 text-sm font-mono leading-relaxed text-slate-800 focus:outline-none [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_table]:text-xs [&_td]:border [&_td]:border-slate-300 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:font-bold [&_th]:text-left"
        />
      </div>

      <MathEquationModal
        open={mathModalOpen}
        onClose={() => setMathModalOpen(false)}
        onInsert={insertMathSnippet}
        defaultEngine={mathEngine}
      />
    </div>
  );
};
