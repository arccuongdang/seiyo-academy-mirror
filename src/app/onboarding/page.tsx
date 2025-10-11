'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db, requireUser, serverTimestamp } from '../../lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';

function OnboardingInner() {
  const router = useRouter();
  const q = useSearchParams();
  const reason = q.get('reason');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nickname, setNickname] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const u = await requireUser(); // nếu chưa login -> throw
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data()?.profileComplete === true) {
          router.replace('/courses');
          return;
        }
      } catch (e: any) {
        if (e?.message === 'AUTH_REQUIRED') {
          router.replace('/signin');
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
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        profileComplete: true,
      }, { merge: true });
      router.push('/courses');
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

      {reason === 'need_profile' && (
        <div style={{ padding: 12, border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', borderRadius: 8, marginBottom: 12 }}>
          Cần điền đầy đủ thông tin cá nhân để bắt đầu khóa học.
        </div>
      )}

      <p style={{ color: '#667085', marginBottom: 12 }}>
        Vui lòng điền <b>nickname</b> (bắt buộc) và thông tin cơ bản (tùy chọn).
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

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <OnboardingInner />
    </Suspense>
  );
}
