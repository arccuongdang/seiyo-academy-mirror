'use client';
import { useEffect, useState } from "react";
import Link from "next/link";

type Course = { slug: string; name: string; subjects: string[]; years: number[] };
type IndexData = { courses: Course[] };

export default function Home() {
  const [data, setData] = useState<IndexData>({ courses: [] });

  useEffect(() => {
    fetch('/data/index.json').then(r => r.json()).then(setData);
  }, []);

  if (!data.courses.length) return <main className="p-6">Đang tải khóa học…</main>;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Seiyo Academy</h1>
      <ul className="space-y-3">
        {data.courses.map(c => (
          <li key={c.slug}>
            <Link className="text-blue-600 underline" href={`/${c.slug}`}>
              {c.name} ({c.slug})
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
