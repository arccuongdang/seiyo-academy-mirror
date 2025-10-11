// src/app/signin/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, signInWithGoogle, signInWithEmail, signUpWithEmail, waitForUser } from '../../lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';

export default function SignInPage() {
  const router = useRouter();
  const q = useSearchParams();
  const mode = q.get('mode') || 'login'; // 'signup' | 'login'
  const [email, setEmail] = useState(''); const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Nếu đã đăng nhập từ trước, chuyển nhanh theo hồ sơ
    (async () => {
      const u = await waitForUser();
      if (!u) return;
      const snap = await getDoc(doc(db, 'users', u.uid));
      const hasProfile = snap.exists() && snap.data()?.profileComplete === true;
      router.replace(hasProfile ? '/courses' : '/onboarding');
    })();
  }, [router]);

  const afterLogin = async () => {
    const u = await waitForUser();
    if (!u) return;
    const snap = await getDoc(doc(db, 'users', u.uid));
    const hasProfile = snap.exists() && snap.data()?.profileComplete === true;
    router.push(hasProfile ? '/courses' : '/onboarding');
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
