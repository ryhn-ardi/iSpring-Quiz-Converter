import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// Initialize Gemini
let ai: GoogleGenAI | null = null;
function getAi() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

app.post('/api/parse-document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const buffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    const originalName = req.file.originalname;

    const genAI = getAi();
    
    let parts: any[] = [];
    const promptText = `
Anda adalah asisten ekstraktor naskah ujian.
Saya memberikan sebuah dokumen (teks, DOCX, atau file PDF) yang mengandung kumpulan soal pilihan ganda dan kunci jawaban.
Jika dokumen berupa naskah ujian Matematika atau Fisika, bacalah setiap persamaan, angka, simbol matematika, dan gambar dengan sangat teliti.

Tugas dan Aturan Khusus:
1. Ekstrak teks soal secara persis, terutama angka, persamaan matematika, pecahan, dan simbol-simbol. Jangan mengubah nomor urut soal atau menghilangkannya.
2. Jika ada gambar atau ilustrasi pada soal, sisipkan teks \`[Gambar: <deskripsi singkat>]\` pada posisi yang tepat.
3. Pisahkan antara bagian "Soal" (termasuk opsi A, B, C, dst) dan "Kunci Jawaban".
4. Kembalikan output dalam format JSON murni dengan properti:
   - "questions": string panjang yang berisi *seluruh* naskah soal yang dirapikan, lengkap dengan opsi-opsi jawabannya. Pertahankan baris baru (enter/newline) agar mudah dibaca.
   - "keys": string yang berisi daftar kunci jawaban berurut ke bawah (contoh: 1. A \\n 2. B).
`;

    if (mimeType === 'application/pdf') {
      // Send PDF directly to Gemini
      parts = [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: buffer.toString('base64')
          }
        },
        { text: promptText }
      ];
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      originalName.endsWith('.docx')
    ) {
      // Use mammoth to get HTML and convert images to [Gambar] label
      const result = await mammoth.convertToHtml({ buffer });
      let html = result.value;
      // Replace image tags with [Gambar]
      html = html.replace(/<img[^>]*>/gi, '\n[Gambar]\n');
      // Strip other HTML tags smoothly
      let extractedText = html.replace(/<p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '');
      extractedText = extractedText.replace(/\n\s*\n/g, '\n\n').trim();

      if (!extractedText) {
        return res.status(400).json({ error: 'Gagal mengekstrak teks DOCX. File mungkin kosong.' });
      }

      parts = [
        { text: `Teks Dokumen:\n${extractedText.substring(0, 40000)}\n\n${promptText}` }
      ];
    } else if (mimeType === 'text/plain') {
      const extractedText = buffer.toString('utf-8');
      parts = [
        { text: `Teks Dokumen:\n${extractedText.substring(0, 40000)}\n\n${promptText}` }
      ];
    } else {
      return res.status(400).json({ error: 'Tipe file tidak didukung. Harap unggah PDF, DOCX, atau TXT.' });
    }

    const response = await genAI.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
          { role: 'user', parts: parts }
        ],
        config: {
            responseMimeType: 'application/json',
            temperature: 0.1
        }
    });

    const jsonStr = response.text || "{}";
    const resultJSON = JSON.parse(jsonStr);

    res.json({
        questions: resultJSON.questions || '',
        keys: resultJSON.keys || ''
    });

  } catch (error: any) {
    console.error('Document parsing error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
