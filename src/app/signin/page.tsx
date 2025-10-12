'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, signInWithGoogle, signInWithEmail, signUpWithEmail, waitForUser, doSignOut } from '../../lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';

function SignInInner() {
  const router = useRouter();
  const q = useSearchParams();
  const mode = q.get('mode') || 'login'; // 'signup' | 'login'
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ uid: string; hasProfile: boolean } | null>(null);

  // Đọc trạng thái hiện tại (nếu đã đăng nhập) nhưng KHÔNG tự redirect
  useEffect(() => {
    (async () => {
      const u = await waitForUser();
      if (!u) {
        setSession(null);
        return;
      }
      const snap = await getDoc(doc(db, 'users', u.uid));
      const hasProfile = snap.exists() && snap.data()?.profileComplete === true;
      setSession({ uid: u.uid, hasProfile });
    })();
  }, []);

  const afterLogin = async () => {
    const u = await waitForUser();
    if (!u) return;
    const snap = await getDoc(doc(db, 'users', u.uid));
    const hasProfile = snap.exists() && snap.data()?.profileComplete === true;
    router.push(hasProfile ? '/courses' : '/onboarding?reason=need_profile');
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

      {/* Banner nếu đã có phiên */}
      {session && (
        <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, background: '#f9fafb' }}>
          <div style={{ marginBottom: 8 }}>Bạn đang đăng nhập. Chọn hành động:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/courses')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff' }}>
              Vào Courses
            </button>
            <button onClick={() => router.push('/onboarding?reason=need_profile')} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}>
              Tới Onboarding
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
          <button onClick={mode === 'signup' ? doEmailSignUp : doEmailLogin} disabled={loading}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff' }}>
            {mode === 'signup' ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
          <button onClick={() => router.replace(mode === 'signup' ? '/signin' : '/signin?mode=signup')}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}>
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
