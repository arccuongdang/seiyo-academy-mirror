'use client';

/** PATCH NOTES: guard nullable Firebase Auth like BottomNav/ProfileGate */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth as _auth } from '../lib/firebase/client';
import { signOut, onAuthStateChanged, type User, type Auth } from 'firebase/auth';

type Lang = 'JA' | 'VI';
const LANG_STORAGE_KEY = 'seiyo:lang';

// ---- Auth guard: our client lib exports `Auth | null` for SSR safety ----
function ensureAuth(): Auth | null {
  return _auth ?? null;
}

export default function TopNav() {
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLang] = useState<Lang>('JA');

  // Theo dõi trạng thái đăng nhập Firebase (guard null)
  useEffect(() => {
    const a = ensureAuth();
    if (!a) return; // running on server or auth not ready -> skip subscribe
    const unsub = onAuthStateChanged(a, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Khởi tạo JA/VI từ localStorage
  useEffect(() => {
    try {
      const saved = (localStorage.getItem(LANG_STORAGE_KEY) || 'JA').toUpperCase();
      const initial = saved === 'VI' ? 'VI' : 'JA';
      setLang(initial as Lang);
      document.documentElement.setAttribute('data-lang', initial);
    } catch {
      /* ignore */
    }
  }, []);

  // Đổi ngôn ngữ
  function changeLang(next: Lang) {
    if (next === lang) return;
    setLang(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch {}
    document.documentElement.setAttribute('data-lang', next);
    try { window.dispatchEvent(new CustomEvent('seiyo:lang-change', { detail: { lang: next } })); } catch {}
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: 48,
        background: '#0f172a',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 12px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
        Seiyo Academy
      </Link>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/courses" style={{ color: '#e2e8f0', textDecoration: 'none' }}>
          Courses
        </Link>
        <Link href="/mypage" style={{ color: '#e2e8f0', textDecoration: 'none' }}>
          My Page
        </Link>
        <Link href="/mypage#wrongs" style={{ color: '#e2e8f0', textDecoration: 'none' }}>
          Wrongs
        </Link>

        {/* ===== Global JA/VI Toggle ===== */}
        <div
          aria-label="Language toggle"
          role="group"
          style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid #334155',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => changeLang('JA')}
            aria-pressed={lang === 'JA'}
            title='日本語'
            style={{
              padding: '4px 10px',
              background: lang === 'JA' ? '#1d4ed8' : 'transparent',
              color: lang === 'JA' ? '#fff' : '#dbeafe',
              border: 'none',
              borderRight: '1px solid #334155',
              fontWeight: lang === 'JA' ? 800 : 600,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            JA
          </button>
          <button
            onClick={() => changeLang('VI')}
            aria-pressed={lang === 'VI'}
            title="Tiếng Việt"
            style={{
              padding: '4px 10px',
              background: lang === 'VI' ? '#1d4ed8' : 'transparent',
              color: lang === 'VI' ? '#fff' : '#dbeafe',
              border: 'none',
              fontWeight: lang === 'VI' ? 800 : 600,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            VI
          </button>
        </div>

        {user ? (
          <button
            onClick={() => { const a = ensureAuth(); if (a) signOut(a); }}
            style={{
              background: 'transparent',
              color: '#fca5a5',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
            title={user.email || ''}
          >
            Sign out
          </button>
        ) : (
          <Link
            href="/signin"
            style={{
              color: '#dbeafe',
              border: '1px solid #93c5fd',
              borderRadius: 6,
              padding: '4px 8px',
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
