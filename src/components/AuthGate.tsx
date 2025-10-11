'use client';
import { ReactNode } from 'react';
import Link from 'next/link';
// đổi sang relative để tránh lỗi alias:
import { useAuth } from '../lib/auth/useAuth';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 700, marginBottom: 8 }}>この機能を使うにはログインが必要です</h2>
        <Link href="/signin" style={{ color: '#175cd3', textDecoration: 'underline' }}>
          ログイン / Đăng nhập
        </Link>
      </main>
    );
  }
  return <>{children}</>;
}
