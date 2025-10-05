'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation"; // 👈 dùng hook này

type Course = { slug: string; name: string; subjects: string[]; years: number[] };

export default function CoursePage() {
  const { course } = useParams<{ course: string }>(); // 👈 lấy course từ URL
  const [c, setC] = useState<Course | null>(null);

  useEffect(() => {
    fetch('/data/index.json')
      .then(r => r.json())
      .then((d: { courses: Course[] }) => {
        setC(d.courses.find(x => x.slug === course) ?? null);
      });
  }, [course]);

  if (!c) return <main className="p-6">Không tìm thấy khóa: {String(course)}</main>;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">{c.name}</h1>
      {c.years.map(y => (
        <section key={y} className="mb-4">
          <h2 className="font-semibold">Năm {y}</h2>
          <ul className="flex gap-3 flex-wrap">
            {c.subjects.map(s => (
              <li key={`${y}-${s}`}>
                <Link className="text-blue-600 underline" href={`/${course}/${s}/${y}`}>
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
