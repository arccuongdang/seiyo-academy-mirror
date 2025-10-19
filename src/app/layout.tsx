// src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { notoJP, notoVI } from './fonts';

import TopNav from '../components/TopNav';
import BottomNav from '../components/BottomNav';

export const metadata: Metadata = {
  title: 'Seiyo Academy',
  description: 'Seiyo Academy Data System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${notoJP.variable} ${notoVI.variable}`}>
      <body style={{ margin: 0, paddingTop: 48, paddingBottom: 56, background: '#ffffff' }}>
        <TopNav />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
