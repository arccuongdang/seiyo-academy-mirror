// src/app/courses/[course]/practice/start/page.tsx
'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const Player: any = dynamic(() => import('../../../../../components/practice/Player'), {
  ssr: false,
  loading: () => <main style={{ padding: 24 }}>Đang tải trình làm bài…</main>,
});

export default function PracticeStartPage({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();

  const subjectId = (search.get('subject') || '').toUpperCase();
  const shuffle = search.get('shuffle') === '1';
  const tags = useMemo(() => (search.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean), [search]);
  const years = useMemo(() => (search.get('years') || '').split(',').map(s => s.trim()).filter(Boolean), [search]);

  if (!subjectId) {
    return <main style={{ padding: 24 }}>Thiếu tham số <code>?subject=...</code></main>;
  }

  return (
    <Player
      courseId={course}
      subjectId={subjectId}
      mode="subject"
      initialShuffle={shuffle}
      initialTags={tags}
      years={years}
    />
  );
}
