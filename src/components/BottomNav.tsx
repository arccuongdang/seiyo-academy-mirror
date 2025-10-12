'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase/client';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function BottomNav() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
      height: 52, background: '#0b1220', borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center'
    }}>
      <Link href="/courses" style={linkStyle}>Courses</Link>
      <Link href="/mypage" style={linkStyle}>My Page</Link>
      {!user ? (
        <Link href="/signin" style={linkStyle}>Sign in</Link>
      ) : (
        <span style={{...linkStyle, opacity: 0.8}}>{user.email?.split('@')[0] || 'Signed in'}</span>
      )}
    </nav>
  );
}

const linkStyle: React.CSSProperties = {
  color: '#e5e7eb', textDecoration: 'none', textAlign: 'center', padding: '8px 0'
};
