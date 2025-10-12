'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '../lib/firebase/client';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';

export default function TopNav() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Theo dõi trạng thái đăng nhập Firebase
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      height: 48, background: '#0f172a', color: '#fff',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
      borderBottom: '1px solid rgba(255,255,255,0.1)'
    }}>
      <Link href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
        Seiyo Academy
      </Link>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
        <Link href="/courses" style={{ color: '#e2e8f0', textDecoration: 'none' }}>Courses</Link>
        <Link href="/mypage" style={{ color: '#e2e8f0', textDecoration: 'none' }}>My Page</Link>

        {user ? (
          <button
            onClick={() => signOut(auth)}
            style={{
              background: 'transparent', color: '#fca5a5', border: '1px solid #fca5a5',
              borderRadius: 6, padding: '4px 8px', cursor: 'pointer'
            }}
            title={user.email || ''}
          >
            Sign out
          </button>
        ) : (
          <Link
            href="/signin"
            style={{
              color: '#dbeafe', border: '1px solid #93c5fd',
              borderRadius: 6, padding: '4px 8px', textDecoration: 'none'
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
