'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  doc, getDoc, type Firestore
} from 'firebase/firestore';
import {
  db as _db,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  waitForUser,
  doSignOut,
} from '../../lib/firebase/client';

// ---- Firestore guard (ép kiểu an toàn chỉ chạy ở client) ----
function ensureDb(): Firestore {
  if (!_db) {
    throw new Error('Firestore is not available on this runtime. Ensure this page runs on client and Firebase env vars are set.');
  }
  return _db;
}

function SignInInner() {
  const router = useRouter();
  const q = useSearchParams();
  const mode = q.get('mode') || 'login'; // 'signup' | 'login'
  const redirectTo = q.get('redirect') || '/courses';
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ uid: string; hasProfile: boolean } | null>(null);

  // If already signed-in, show quick actions (no auto-redirect to avoid loop)
  useEffect(() => {
    (async () => {
      const u = await waitForUser();
      if (!u) {
        setSession(null);
        return;
      }
      try {
        const db = ensureDb();
        const snap = await getDoc(doc(db, 'users', u.uid));
        const hasProfile = snap.exists() && (snap.data() as any)?.profileComplete === true;
        setSession({ uid: u.uid, hasProfile });
      } catch (e: any) {
        setErr(e?.message || 'Load session failed');
      }
    })();
  }, []);

  const afterLogin = async () => {
    const u = await waitForUser();
    if (!u) return;
    try {
      const db = ensureDb();
      const snap = await getDoc(doc(db, 'users', u.uid));
      const hasProfile = snap.exists() && (snap.data() as any)?.profileComplete === true;
      router.replace(redirectTo || (hasProfile ? '/courses' : '/courses'));
    } catch {
      router.replace(redirectTo || '/courses');
    }
  };

  const doGoogle = async () => {
    try { setErr(null); setLoading(true); await signInWithGoogle(); await afterLogin(); }
    catch (e: any) { setErr(e?.message || 'Login failed'); }
    finally { setLoading(false); }
  };
  const doEmailLogin = async () => {
    try { setErr(null); setLoading(true); await signInWithEmail(email, pwd); await afterLogin(); }
    catch (e: any) { setErr(e?.message || 'Login failed'); }
    finally { setLoading(false); }
  };
  const doEmailSignUp = async () => {
    try { setErr(null); setLoading(true); await signUpWithEmail(email, pwd); await afterLogin(); }
    catch (e: any) { setErr(e?.message || 'Sign up failed'); }
    finally { setLoading(false); }
  };

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
        {mode === 'signup' ? '新規登録 / Tạo tài khoản' : 'ログイン / Đăng nhập'}
      </h1>

      {/* Session banner */}
      {session && (
        <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, background: '#f9fafb' }}>
          <div style={{ marginBottom: 8 }}>Bạn đang đăng nhập. Chọn hành động:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/courses')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff' }}>
              Vào Courses
            </button>
            <button onClick={async () => { await doSignOut(); setSession(null); }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ef4444', background: '#fff', color: '#ef4444' }}>
              Đăng xuất
            </button>
          </div>
        </div>
      )}

      <button onClick={doGoogle} disabled={loading}
        style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, marginBottom: 12 }}>
        Googleでログイン / Đăng nhập với Google
      </button>

      <div style={{ margin: '12px 0', color: '#667085' }}>— or —</div>

      <div style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }} />
        <input placeholder="Password" type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={mode === 'signup' ? doEmailSignUp : doEmailLogin}
            disabled={loading}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #175cd3',
              background: '#175cd3',
              color: '#fff',
            }}
          >
            {mode === 'signup' ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>

          <button
            onClick={() => router.replace(mode === 'signup' ? '/signin' : '/signin?mode=signup')}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: '#fff',
            }}
          >
            {mode === 'signup' ? 'Tôi đã có tài khoản' : 'Tạo tài khoản mới'}
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: 'crimson' }}>{String(err)}</div>}
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <SignInInner />
    </Suspense>
  );
}
