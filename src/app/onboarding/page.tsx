'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, requireUser, serverTimestamp } from '../../lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nickname, setNickname] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState(''); // optional

  useEffect(() => {
    (async () => {
      try {
        const u = await requireUser();
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          // nếu đã hoàn tất hồ sơ → đưa về trang học
          return router.push('/courses/KTS2'); // hoặc trang dashboard của bạn
        }
      } catch (e: any) {
        if (e?.message === 'AUTH_REQUIRED') {
          router.push('/signin');
          return;
        }
        setErr(e?.message || 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const canSave = nickname.trim().length >= 2;

  const save = async () => {
    try {
      setSaving(true); setErr(null);
      const u = await requireUser();
      const ref = doc(db, 'users', u.uid);
      await setDoc(ref, {
        nickname: nickname.trim(),
        lastName: lastName.trim() || null,
        firstName: firstName.trim() || null,
        birthYear: birthYear.trim() || null,
        gender: gender || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        profileComplete: true,
      }, { merge: true });
      router.push('/courses/KTS2'); // điều hướng tới nơi bạn muốn bắt đầu học
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>はじめての設定 / Thiết lập lần đầu</h1>
      <p style={{ color: '#667085', marginBottom: 12 }}>
        Vui lòng điền **nickname** (bắt buộc) và thông tin cá nhân cơ bản (tùy chọn).
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        <label>Nickname*<br/>
          <input value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="ví dụ: Minato"
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, width: '100%' }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>Họ (姓)<br/>
            <input value={lastName} onChange={e=>setLastName(e.target.value)}
              style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, width: '100%' }} />
          </label>
          <label>Tên (名)<br/>
            <input value={firstName} onChange={e=>setFirstName(e.target.value)}
              style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, width: '100%' }} />
          </label>
        </div>

        <label>Năm sinh (YYYY)<br/>
          <input value={birthYear} onChange={e=>setBirthYear(e.target.value)} placeholder="2001"
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, width: '100%' }} />
        </label>

        <label>Giới tính (tùy chọn)<br/>
          <select value={gender} onChange={e=>setGender(e.target.value)}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, width: '100%' }}>
            <option value="">—</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
            <option value="other">Khác</option>
          </select>
        </label>

        <button onClick={save} disabled={!canSave || saving}
          style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}>
          Lưu & bắt đầu học
        </button>

        {err && <div style={{ color: 'crimson' }}>{err}</div>}
      </div>
    </main>
  );
}
