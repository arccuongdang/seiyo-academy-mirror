'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const Player: any = dynamic(() => import('../../../../../components/practice/Player'), {
  ssr: false,
  loading: () => <main style={{ padding: 24 }}>Đang tải trình làm bài…</main>,
});

export default function PracticeYearPage({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();

  const subjectId = (search.get('subject') || '').toUpperCase();
  const year = search.get('year') || '';
  const shuffle = search.get('shuffle') === '1';

  if (!subjectId || !year) {
    return <main style={{ padding: 24 }}>Thiếu tham số <code>?subject=...</code> và <code>?year=...</code></main>;
  }

  return (
    <Player
      courseId={course}
      subjectId={subjectId}
      mode="year"
      initialShuffle={shuffle}
      years={[year]}
      initialTags={[]}
    />
  );
}
