import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';

type AdminStatusResponse = {
  authenticated: boolean;
  username: string | null;
  needsBootstrap: boolean;
  envConfigured: boolean;
  defaultUsername: string;
};

type AdminLoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, username: string) => void;
};

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setLoadingStatus(true);

    fetch('/api/admin/status')
      .then(async (res) => {
        if (!res.ok) throw new Error('Gagal memeriksa status admin');
        return (await res.json()) as AdminStatusResponse;
      })
      .then((data) => {
        if (!active) return;
        setNeedsBootstrap(Boolean(data.needsBootstrap));
        setUsername(data.defaultUsername || 'admin');
      })
      .catch(() => {
        if (!active) return;
        setError('Tidak dapat terhubung ke server autentikasi.');
      })
      .finally(() => {
        if (active) setLoadingStatus(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('Username wajib diisi.');
      return;
    }
    if (!password) {
      setError('Password wajib diisi.');
      return;
    }

    if (needsBootstrap) {
      if (password.length < 6) {
        setError('Password minimal 6 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Konfirmasi password tidak cocok.');
        return;
      }
    }

    setSubmitting(true);
    setError('');

    try {
      const endpoint = needsBootstrap ? '/api/admin/bootstrap' : '/api/admin/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.needsBootstrap) {
          setNeedsBootstrap(true);
        }
        setError(data?.error || 'Login admin gagal.');
        return;
      }

      if (typeof data?.token === 'string' && typeof data?.username === 'string') {
        onSuccess(data.token, data.username);
        onClose();
      } else {
        setError('Respons server tidak valid.');
      }
    } catch {
      setError('Gagal menghubungi server. Coba beberapa saat lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              {needsBootstrap ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 id="admin-modal-title" className="text-base font-bold text-slate-900">
                {needsBootstrap ? 'Aktivasi Akun Admin' : 'Login Admin'}
              </h2>
              <p className="text-xs text-slate-500">
                {needsBootstrap
                  ? 'Atur password admin untuk mengelola foto & quote pemilik'
                  : 'Masuk untuk mengubah foto pemilik & quote website'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {loadingStatus ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Memeriksa konfigurasi akun admin...
            </div>
          ) : (
            <>
              {needsBootstrap && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-900 leading-relaxed">
                  Password admin belum dikonfigurasi di server. Silakan buat akun admin pertama
                  (username bawaan <span className="font-bold">admin</span>) untuk mengaktifkan
                  fitur edit foto &amp; quote.
                </div>
              )}

              <div>
                <label
                  htmlFor="admin-username"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Username
                </label>
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="admin"
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  {needsBootstrap ? 'Buat Password Admin' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-3.5 pr-10 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Masukkan password"
                    disabled={submitting}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {needsBootstrap && (
                <div>
                  <label
                    htmlFor="admin-confirm-password"
                    className="block text-xs font-bold text-slate-700 mb-1.5"
                  >
                    Konfirmasi Password
                  </label>
                  <input
                    id="admin-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Ulangi password"
                    disabled={submitting}
                  />
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  {submitting
                    ? 'Memproses...'
                    : needsBootstrap
                      ? 'Aktifkan & Masuk'
                      : 'Masuk Admin'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
