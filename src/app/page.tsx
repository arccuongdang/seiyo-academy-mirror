// src/app/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, waitForUser } from '../lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';

export default async function Home() {
  // Server Component: kiểm tra đăng nhập và hồ sơ
  const user = await waitForUser();
  if (user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const hasProfile = snap.exists() && snap.data()?.profileComplete === true;
    if (hasProfile) {
      // ĐÃ đăng nhập & có hồ sơ → chuyển tới trang chọn khóa học
      redirect('/courses');
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Seiyo Academy</h1>
      <p style={{ color: '#444', marginBottom: 16 }}>Hệ thống học trực tuyến 二級建築士</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link
          href="/signin?mode=signup"
          style={{ padding: '12px 16px', borderRadius: 10, background: '#175cd3', color: '#fff', fontWeight: 700 }}
        >
          新規登録 / Đăng ký
        </Link>
        <Link
          href="/signin"
          style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #175cd3', color: '#175cd3', fontWeight: 700 }}
        >
          ログイン / Đăng nhập
        </Link>
      </div>

      <div style={{ marginTop: 18, color: '#667085' }}>
        ※ Sau khi đăng nhập bằng Google lần đầu, bạn sẽ điền hồ sơ cá nhân ngắn và được chuyển đến My Page.
      </div>
    </main>
  );
}
