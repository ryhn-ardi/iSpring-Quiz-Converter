import React, { useState } from 'react';
import {
  FileSpreadsheet, Zap, Sliders, Edit3, Award, Trash2, Eye,
  Download, Database, Check, AlertCircle, CheckCircle,
  AlertTriangle, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Types
type Answer = { text: string; isCorrect: boolean };
type Question = { type: 'MC'; question: string; answers: Answer[]; points: number };
type ToastState = { message: string; type: 'info' | 'success' | 'error'; visible: boolean };

// Initial Sample Data
const SAMPLE_AUTO_QUESTIONS = `1. Era musik yang mengutamakan kerapian, struktur simetri (tanya-jawab), dan keseimbangan adalah...
a. Era Barok
b. Era Romantik
c. Era Modern
d. Era Klasik

2. Siapakah komponis musik terkenal pada era Klasik yang menciptakan lagu "Für Elise"?
a. Johann Sebastian Bach
b. Ludwig van Beethoven
c. Wolfgang Amadeus Mozart
d. Franz Schubert

3. Unsur paling mendasar dalam musik yang merupakan getaran udara teratur yang memiliki tinggi rendah tertentu dan dapat didengar adalah...
a. Bunyi
b. Nada
c. Irama
d. Melodi`;

const SAMPLE_AUTO_KEYS = `1. d
2. b
3. b`;

const SAMPLE_RULE = `Era musik yang mengutamakan kerapian, struktur simetri (tanya-jawab), dan keseimbangan adalah...
a. Era Barok
b. Era Romantik
c. Era Modern
*d. Era Klasik

Siapakah komponis musik terkenal pada era Klasik yang menciptakan lagu "Für Elise"?
a. Johann Sebastian Bach
*b. Ludwig van Beethoven
c. Wolfgang Amadeus Mozart
d. Franz Schubert`;

export default function App() {
  const [mode, setMode] = useState<'auto' | 'rule'>('auto');
  const [autoQuestions, setAutoQuestions] = useState(SAMPLE_AUTO_QUESTIONS);
  const [autoKeys, setAutoKeys] = useState(SAMPLE_AUTO_KEYS);
  const [ruleText, setRuleText] = useState(SAMPLE_RULE);
  const [defaultPoints, setDefaultPoints] = useState<number>(10);
  const [convertedQuestions, setConvertedQuestions] = useState<Question[]>([]);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', visible: false });

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 4000);
  };

  const clearInput = () => {
    if (mode === 'auto') {
      setAutoQuestions('');
      setAutoKeys('');
    } else {
      setRuleText('');
    }
    showToast('Input dibersihkan.', 'info');
  };

  const konversiOtomatisTerpisah = () => {
    const qText = autoQuestions.trim();
    const kText = autoKeys.trim();
    
    if (!qText || !kText) {
      showToast('Kolom soal dan kolom kunci jawaban wajib diisi keduanya!', 'error');
      return;
    }

    try {
      const keysMap = new Map<number, string>();
      const keyRegex = /(\d+)[\s\.\-\=\:]*([a-jA-J])/g;
      let match;
      
      while ((match = keyRegex.exec(kText)) !== null) {
        keysMap.set(parseInt(match[1], 10), match[2].toLowerCase());
      }

      if (keysMap.size === 0) {
        const lines = kText.split('\n');
        lines.forEach((line, idx) => {
          const cleanLine = line.trim().toLowerCase();
          if (cleanLine) {
            const charMatch = cleanLine.match(/^[a-j]/);
            if (charMatch) {
              keysMap.set(idx + 1, charMatch[0]);
            }
          }
        });
      }

      const parsedBlocks: string[][] = [];
      let currentBlock: string[] = [];
      const linesArr = qText.split('\n').map(l => l.trim()).filter(Boolean);
      
      linesArr.forEach(line => {
        if (/^\d+[\.\)\-]?\s+/.test(line)) {
          if (currentBlock.length > 0) {
            parsedBlocks.push(currentBlock);
          }
          currentBlock = [line];
        } else {
          currentBlock.push(line);
        }
      });
      if (currentBlock.length > 0) {
        parsedBlocks.push(currentBlock);
      }

      const finalBlocks = parsedBlocks.length > 1 ? parsedBlocks : 
        qText.split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length > 0);

      const converted: Question[] = [];

      finalBlocks.forEach((lines, blockIdx) => {
        if (lines.length < 2) return;

        const rawTitle = lines[0];
        const numMatch = rawTitle.match(/^(\d+)/);
        const qNum = numMatch ? parseInt(numMatch[1], 10) : (blockIdx + 1);

        const targetKey = keysMap.get(qNum);
        const cleanQuestionText = rawTitle.replace(/^\d+[\.\)\s-]+\s*/, '');
        const answers: Answer[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const optionLetterMatch = line.match(/^([a-jA-J])[\.\)\s-]/);
          let isCorrect = false;

          if (optionLetterMatch && targetKey) {
            const currentLetter = optionLetterMatch[1].toLowerCase();
            if (currentLetter === targetKey) {
              isCorrect = true;
            }
          }

          const cleanedVal = line.replace(/^[a-jA-J0-9][\.\)\s-]+\s*/, '').trim();
          answers.push({ text: cleanedVal, isCorrect });
        }

        converted.push({
          type: 'MC',
          question: cleanQuestionText,
          answers,
          points: defaultPoints
        });
      });

      if (converted.length === 0) {
        throw new Error("Gagal mendeteksi struktur soal. Pastikan ada baris kosong di antara soal.");
      }

      setConvertedQuestions(converted);
      showToast(`Selesai! Berhasil menjodohkan ${converted.length} soal dengan kunci jawaban secara instan.`, 'success');

    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem', 'error');
    }
  };

  const konversiAturanLokal = () => {
    const text = ruleText.trim();
    if (!text) {
      showToast('Masukkan teks soal manual terlebih dahulu!', 'error');
      return;
    }

    try {
      const parsedBlocks: string[][] = [];
      let currentBlock: string[] = [];
      const linesArr = text.split('\n').map(l => l.trim()).filter(Boolean);
      
      linesArr.forEach(line => {
        if (/^\d+[\.\)\-]?\s+/.test(line)) {
          if (currentBlock.length > 0) {
            parsedBlocks.push(currentBlock);
          }
          currentBlock = [line];
        } else {
          currentBlock.push(line);
        }
      });
      if (currentBlock.length > 0) {
        parsedBlocks.push(currentBlock);
      }

      const finalBlocks = parsedBlocks.length > 1 ? parsedBlocks : 
        text.split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length > 0);

      const converted: Question[] = [];

      finalBlocks.forEach((lines) => {
        if (lines.length < 2) return;

        const questionText = lines[0].replace(/^\d+[\.\)\s-]+\s*/, '');
        const answers: Answer[] = [];

        for (let i = 1; i < lines.length; i++) {
          let line = lines[i];
          let isCorrect = false;

          if (line.startsWith('*') || line.toLowerCase().startsWith('[x]')) {
            isCorrect = true;
            line = line.replace(/^\*\s*/, '').replace(/^\[x\]\s*/i, '');
          }

          const cleanedVal = line.replace(/^[a-jA-J0-9][\.\)\s-]+\s*/, '').trim();
          answers.push({ text: cleanedVal, isCorrect });
        }

        converted.push({
          type: 'MC',
          question: questionText,
          answers,
          points: defaultPoints
        });
      });

      setConvertedQuestions(converted);
      showToast(`Berhasil mengonversi ${converted.length} soal secara lokal.`, 'success');
    } catch (err: any) {
      showToast('Gagal memproses susunan soal: ' + (err.message || ''), 'error');
    }
  };

  const prosesKonversi = () => {
    if (mode === 'auto') konversiOtomatisTerpisah();
    else konversiAturanLokal();
  };

  const exportToExcel = () => {
    if (convertedQuestions.length === 0) return;

    const headers = [
      'Question Type', 'Question Text', 'Image', 'Video', 'Audio',
      'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Answer 5',
      'Answer 6', 'Answer 7', 'Answer 8', 'Answer 9', 'Answer 10',
      'Correct Feedback', 'Incorrect Feedback', 'Points'
    ];

    const rows: string[][] = [];
    convertedQuestions.forEach(q => {
      const row = Array(18).fill('');
      row[0] = q.type;
      row[1] = q.question;
      
      q.answers.forEach((ans, idx) => {
        if (idx < 10) {
          row[5 + idx] = ans.isCorrect ? `*${ans.text}` : ans.text;
        }
      });

      row[17] = q.points.toString();
      rows.push(row);
    });

    const wb = XLSX.utils.book_new();
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Template");

    const filename = `iSpring_Import_Quiz_${Date.now().toString().slice(-5)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(`Excel "${filename}" diunduh! Siap diimpor ke iSpring QuizMaker.`, 'success');
  };

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
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">iSpring Quiz Converter</h1>
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
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-indigo-600" />
              1. Input Teks Soal & Kunci Jawaban
            </h2>

            {/* Mode Selector Tab */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 gap-1 sm:gap-0">
              <button 
                onClick={() => setMode('auto')} 
                className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${mode === 'auto' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <Zap className={`w-4 h-4 ${mode === 'auto' ? 'text-amber-500' : ''}`} />
                Otomatis (Soal + Kunci Terpisah)
              </button>
              <button 
                onClick={() => setMode('rule')} 
                className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${mode === 'rule' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <Sliders className="w-4 h-4" />
                Manual (Tanda Bintang *)
              </button>
            </div>

            {/* Mode 1: Auto */}
            {mode === 'auto' && (
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700">
                  <p className="font-bold mb-1 text-indigo-900">Cara Kerja Mode Otomatis:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Tempelkan daftar soal polos Anda pada kolom <b>Daftar Soal Polos</b> di bawah.</li>
                    <li>Masukkan daftar kunci jawaban pada kolom <b>Kunci Jawaban</b> (Contoh: <code className="bg-indigo-100 px-1 rounded text-indigo-900 font-bold">1.D, 2.B</code>).</li>
                    <li>Aplikasi akan otomatis mencari opsi yang sesuai dengan kunci dan memberikannya tanda bintang (*).</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Daftar Soal Polos:</label>
                    <textarea 
                      value={autoQuestions}
                      onChange={(e) => setAutoQuestions(e.target.value)}
                      rows={10} 
                      className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed resize-none" 
                      placeholder={"1. Pertanyaan contoh?\na. Opsi A\nb. Opsi B"}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Kunci Jawaban:</label>
                    <textarea 
                      value={autoKeys}
                      onChange={(e) => setAutoKeys(e.target.value)}
                      rows={10} 
                      className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed resize-none" 
                      placeholder={"1. D\n2. B\n3. B"}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Mode 2: Manual */}
            {mode === 'rule' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
                  <p className="font-bold mb-1 text-slate-700">Aturan Penulisan Manual:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Pisahkan antarsoal dengan 1 baris kosong (Double Enter).</li>
                    <li>Tandai kunci jawaban dengan tanda bintang (<span className="text-red-500 font-bold">*</span>) di awal teks pilihan.</li>
                    <li><i>Contoh: *d. Era Klasik</i></li>
                  </ul>
                </div>
                <textarea 
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  rows={10} 
                  className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed resize-none" 
                  placeholder="Tuliskan soal dengan tanda bintang di sini..."
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
                  onChange={(e) => setDefaultPoints(parseInt(e.target.value) || 0)}
                  min="0" max="1000" 
                  className="w-28 pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 text-center"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">Poin</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-6">
              <button onClick={clearInput} className="px-5 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-all">
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" />
                2. Hasil ({convertedQuestions.length} Soal)
              </h2>
              <button 
                onClick={exportToExcel} 
                disabled={convertedQuestions.length === 0} 
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
              >
                <Download className="w-4 h-4" />
                Unduh Excel
              </button>
            </div>

            <div className="flex-grow border border-slate-100 bg-slate-50/50 rounded-xl p-4 overflow-y-auto max-h-[600px]">
              {convertedQuestions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 text-slate-400">
                  <Database className="w-12 h-12 mb-3 text-slate-300" />
                  <p className="text-sm font-medium">Belum ada hasil konversi</p>
                  <p className="text-xs text-slate-400 mt-1">Masukkan data, lalu klik tombol Proses.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {convertedQuestions.map((q, idx) => {
                    let hasCorrect = false;
                    return (
                      <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm relative">
                        <div className="absolute right-4 top-4 bg-indigo-50 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          SOAL {idx + 1}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 pr-12 mb-3 leading-relaxed">
                          {idx + 1}. {q.question}
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                          {q.answers.map((ans, optIdx) => {
                            if (ans.isCorrect) hasCorrect = true;
                            const char = String.fromCharCode(97 + optIdx);
                            return (
                              <div key={optIdx} className={`flex items-center justify-between border px-3 py-2 rounded-lg text-xs ${ans.isCorrect ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold' : 'bg-slate-50 text-slate-700 border-slate-100'}`}>
                                <span className="flex items-center gap-2">
                                  <span className="uppercase font-bold text-[10px] bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded">{char}</span>
                                  {ans.text}
                                </span>
                                {ans.isCorrect && (
                                  <span className="bg-emerald-500 text-white rounded-full p-0.5 flex items-center justify-center">
                                    <Check className="w-3 h-3" />
                                  </span>
                                )}
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
      <div className={`fixed bottom-6 right-6 transform ${toast.visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'} bg-slate-950 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 transition-all duration-300 z-50 text-sm`}>
        {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
        {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
        {toast.type === 'info' && <Info className="w-4 h-4 text-indigo-400" />}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
