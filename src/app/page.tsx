'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth/useAuth';
import { db } from '../lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    (async () => {
      if (!ready) return;
      if (!user) {
        setDecided(true);
        return;
      }
      const snap = await getDoc(doc(db, 'users', user.uid));
      const ok = snap.exists() && snap.data()?.profileComplete === true;
      if (ok) router.replace('/courses');
      else router.replace('/onboarding?reason=need_profile');
    })();
  }, [ready, user, router]);

  if (!ready || !decided) {
    // Khi đã đăng nhập, ta sẽ redirect; khi chưa đăng nhập, ta hiển thị nút.
    // Để tránh "nhấp nháy", chỉ hiển thị UI khi đã xác định là chưa đăng nhập.
    if (user) return <main style={{ padding: 24 }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Seiyo Academy</h1>
      <p style={{ color: '#444', marginBottom: 16 }}>Hệ thống học trực tuyến 二級建築士</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/signin?mode=signup"
          style={{ padding: '12px 16px', borderRadius: 10, background: '#175cd3', color: '#fff', fontWeight: 700 }}>
          新規登録 / Đăng ký
        </Link>
        <Link href="/signin"
          style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #175cd3', color: '#175cd3', fontWeight: 700 }}>
          ログイン / Đăng nhập
        </Link>
        <Link href="/mypage"
          style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #ddd' }}>
          My Page
        </Link>
        <Link href="/courses"
          style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #ddd' }}>
          Courses
        </Link>
      </div>
    </main>
  );
}
