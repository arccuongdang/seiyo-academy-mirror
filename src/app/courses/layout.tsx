'use client';
import type { ReactNode } from 'react';
import AuthGate from '../../components/AuthGate';
import ProfileGate from '../../components/ProfileGate';

export default function CoursesLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <ProfileGate>{children}</ProfileGate>
    </AuthGate>
  );
}
