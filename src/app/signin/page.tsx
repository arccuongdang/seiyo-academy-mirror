'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../../lib/firebase/client';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [pwd, setPwd] = useState('');
  const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);

  const afterLogin = () => router.push('/onboarding'); // dẫn sang Onboarding (lần đầu sẽ yêu cầu điền hồ sơ)

  const doGoogle = async () => {
    try { setErr(null); setLoading(true); await signInWithGoogle(); afterLogin(); }
    catch (e: any) { setErr(e?.message || 'Login failed'); } finally { setLoading(false); }
  };
  const doEmailLogin = async () => {
    try { setErr(null); setLoading(true); await signInWithEmail(email, pwd); afterLogin(); }
    catch (e: any) { setErr(e?.message || 'Login failed'); } finally { setLoading(false); }
  };
  const doEmailSignUp = async () => {
    try { setErr(null); setLoading(true); await signUpWithEmail(email, pwd); afterLogin(); }
    catch (e: any) { setErr(e?.message || 'Sign up failed'); } finally { setLoading(false); }
  };

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>ログイン / Đăng nhập</h1>

      <button onClick={doGoogle} disabled={loading}
        style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, marginBottom: 12 }}>
        Continue with Google
      </button>

      <div style={{ margin: '12px 0', color: '#667085' }}>— or —</div>

      <div style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }} />
        <input placeholder="Password" type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={doEmailLogin} disabled={loading}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff' }}>
            Đăng nhập
          </button>
          <button onClick={doEmailSignUp} disabled={loading}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}>
            Tạo tài khoản
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, color: 'crimson' }}>{String(err)}</div>}
    </main>
  );
}
