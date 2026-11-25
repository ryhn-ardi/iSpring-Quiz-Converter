import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Lock, Pencil, Quote, Trash2, Upload, User, X } from 'lucide-react';

export type OwnerProfileData = {
  ownerName: string;
  ownerRole: string;
  quote: string;
  photoDataUrl: string | null;
  updatedAt?: string;
};

type OwnerSpotlightProps = {
  profile: OwnerProfileData;
  isAdmin: boolean;
  adminToken: string | null;
  onProfileUpdated: (next: OwnerProfileData) => void;
  onOpenLogin: () => void;
  onSessionExpired: () => void;
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
};

const SAFE_IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

function isSafeImageDataUrl(url: string | null | undefined): url is string {
  return Boolean(url && SAFE_IMAGE_DATA_URL_RE.test(url));
}

function getInitials(name: string): string {
  const cleaned = name
    .replace(/\b(ms|mr|mrs|ibu|bapak|pak|bu)\.?\s+/gi, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'RL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

async function readAndResizeImageFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Gunakan file gambar berformat PNG, JPG, WebP, atau GIF.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file gambar terlalu besar (maksimal 10 MB).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(file);
  });

  // Preserve animated GIF directly if within 2 MB
  if (file.type === 'image/gif' && rawDataUrl.length <= 2_600_000) {
    return rawDataUrl;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('File gambar tidak dapat dimuat.'));
    image.src = rawDataUrl;
  });

  const maxSide = 640;
  let targetW = img.naturalWidth || img.width;
  let targetH = img.naturalHeight || img.height;
  if (targetW > maxSide || targetH > maxSide) {
    const ratio = Math.min(maxSide / targetW, maxSide / targetH);
    targetW = Math.max(1, Math.round(targetW * ratio));
    targetH = Math.max(1, Math.round(targetH * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawDataUrl;

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvas.toDataURL(outputMime, 0.88);
}

export const OwnerSpotlight: React.FC<OwnerSpotlightProps> = ({
  profile,
  isAdmin,
  adminToken,
  onProfileUpdated,
  onOpenLogin,
  onSessionExpired,
  onNotify,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.ownerName);
  const [draftRole, setDraftRole] = useState(profile.ownerRole);
  const [draftQuote, setDraftQuote] = useState(profile.quote);
  const [draftPhoto, setDraftPhoto] = useState<string | null>(profile.photoDataUrl);
  const [saving, setSaving] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftName(profile.ownerName);
      setDraftRole(profile.ownerRole);
      setDraftQuote(profile.quote);
      setDraftPhoto(profile.photoDataUrl);
      setPhotoLoadError(false);
    }
  }, [profile, isEditing]);

  useEffect(() => {
    if (!isAdmin) {
      setIsEditing(false);
    }
  }, [isAdmin]);

  const activePhoto = isEditing ? draftPhoto : profile.photoDataUrl;
  const validPhoto = isSafeImageDataUrl(activePhoto) && !photoLoadError ? activePhoto : null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await readAndResizeImageFile(file);
      setPhotoLoadError(false);
      setDraftPhoto(dataUrl);
      if (!isEditing) {
        setIsEditing(true);
      }
    } catch (err: any) {
      onNotify(err?.message || 'Gagal memproses foto.', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || saving) return;

    const cleanName = draftName.trim();
    if (!cleanName) {
      onNotify('Nama pemilik tidak boleh kosong.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          ownerName: cleanName,
          ownerRole: draftRole.trim() || 'Pemilik Website',
          quote: draftQuote.trim(),
          photoDataUrl: draftPhoto,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      if (!res.ok) {
        onNotify(data?.error || 'Gagal menyimpan perubahan profil.', 'error');
        return;
      }

      if (data?.profile) {
        onProfileUpdated(data.profile);
      }
      setIsEditing(false);
      onNotify('Foto pemilik & quote berhasil diperbarui.', 'success');
    } catch {
      onNotify('Gagal menghubungi server saat menyimpan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftName(profile.ownerName);
    setDraftRole(profile.ownerRole);
    setDraftQuote(profile.quote);
    setDraftPhoto(profile.photoDataUrl);
    setPhotoLoadError(false);
    setIsEditing(false);
  };

  return (
    <section
      aria-label="Profil Pemilik dan Quote"
      className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handlePhotoSelect}
        className="hidden"
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
        {/* Custom Owner Photo Frame */}
        <div className="relative shrink-0 self-center sm:self-auto">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl p-1.5 bg-slate-50 border border-slate-200 shadow-xs">
            {validPhoto ? (
              <img
                src={validPhoto}
                alt={`Foto ${profile.ownerName}`}
                referrerPolicy="no-referrer"
                onError={() => setPhotoLoadError(true)}
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <div className="w-full h-full rounded-xl bg-gradient-to-br from-slate-100 via-indigo-50 to-slate-200 flex flex-col items-center justify-center text-slate-600 select-none">
                <span className="text-xl font-extrabold tracking-tight text-indigo-700">
                  {getInitials(isEditing ? draftName : profile.ownerName)}
                </span>
                <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
                  <User className="w-3 h-3" />
                  Foto Pemilik
                </span>
              </div>
            )}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-md flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              title="Unggah atau ganti foto pemilik"
            >
              <Camera className="w-3.5 h-3.5" />
              Foto
            </button>
          )}
        </div>

        {/* Quote & Owner Details */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="font-semibold text-slate-700">{profile.ownerRole}</span>
              <span aria-hidden="true">·</span>
              <span>{profile.ownerName}</span>
            </div>

            {isAdmin ? (
              !isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Ubah Foto &amp; Quote
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Login sebagai admin untuk mengubah foto dan quote"
              >
                <Lock className="w-3.5 h-3.5" />
                Login Admin untuk ubah
              </button>
            )}
          </div>

          {!isEditing ? (
            <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <Quote className="w-4 h-4 text-indigo-500 shrink-0 mt-1" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm sm:text-base text-slate-800 font-medium leading-relaxed italic break-words">
                    {profile.quote
                      ? `“${profile.quote}”`
                      : 'Belum ada quote yang ditulis.'}
                  </p>
                  <p className="mt-1.5 text-xs font-semibold text-slate-500">
                    — {profile.ownerName}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-3 bg-slate-50/70 border border-slate-200 rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nama Pemilik
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="ms. Reyhan lohyaa"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Label / Peran
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={draftRole}
                    onChange={(e) => setDraftRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Pemilik Website"
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    Quote Pemilik
                  </label>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {draftQuote.length}/400
                  </span>
                </div>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={draftQuote}
                  onChange={(e) => setDraftQuote(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                  placeholder="Tulis quote atau pesan Anda di sini..."
                  disabled={saving}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    disabled={saving}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Pilih Foto Custom
                  </button>
                  {draftPhoto && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraftPhoto(null);
                        setPhotoLoadError(false);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      disabled={saving}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus Foto
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    disabled={saving}
                  >
                    <X className="w-3.5 h-3.5" />
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {saving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};
