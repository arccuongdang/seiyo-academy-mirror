// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect root (/) -> /courses, no client-side flicker
  redirect('/courses');
}
