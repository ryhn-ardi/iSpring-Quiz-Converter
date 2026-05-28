import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
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

app.post('*', upload.single('file'), async (req, res) => {
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
Anda adalah asisten ekstraktor soal ujian yang sangat cerdas. 
Saya memberikan sebuah dokumen (teks, DOCX, atau file PDF) yang mengandung kumpulan soal pilihan ganda dan kunci jawaban.

Tugas dan Aturan Khusus:
1. Pisahkan secara spesifik mana bagian naskah soal dan mana kunci jawaban.
2. **Soal Matematika/Rumus**: Jika ada rumus matematika, angka kompleks, atau persamaan, ekstrak dan tulis ulang dengan rapi (bisa mendekati format aslinya atau menggunakan teks baku).
3. **Soal Bergambar**:
    - Jika Anda memproses file PDF dan "melihat" ada ilustrasi/gambar pada suatu soal, sisipkan teks \`[Gambar: deskripsi singkat gambar]\` pada teks pertanyaan tersebut.
    - Jika memproses teks DOCX/TXT dan menemukan placeholder \`[Gambar]\`, pertahankan posisi placeholder tersebut di soal.
4. Jangan mengubah makna soal, cukup rapikan keamanannya.
5. Keluarkan hasil akhir dalam format JSON yang valid dan murni dengan dua property:
   - "questions": string berisi daftar seluruh soal yang dirapikan beserta pilihan gandanya (A, B, C, D, E). Pisahkan tiap soal dengan spasi yang jelas.
   - "keys": string berisi daftar kunci jawaban, berurutan ke bawah (contoh: 1. A \\n 2. C \\n 3. A dan B).

PENTING: Hanya kembalikan string JSON murni tanpa markdown block formatter (tanpa awalan \`\`\`json).
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
        { text: `Teks Dokumen:\n${extractedText.substring(0, 35000)}\n\n${promptText}` }
      ];
    } else if (mimeType === 'text/plain') {
      const extractedText = buffer.toString('utf-8');
      parts = [
        { text: `Teks Dokumen:\n${extractedText.substring(0, 35000)}\n\n${promptText}` }
      ];
    } else {
      return res.status(400).json({ error: 'Tipe file tidak didukung. Harap unggah PDF, DOCX, atau TXT.' });
    }

    const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
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

// Configure Vercel serverless function to not parse the body 
// so that `multer` can process the raw `multipart/form-data` stream.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
