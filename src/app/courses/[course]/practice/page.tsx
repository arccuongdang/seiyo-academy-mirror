'use client';

import { useEffect, useState } from "react";
import Link from "next/link";

// ⛳️ Import TRỰC TIẾP
import { loadManifest } from "@/lib/qa/excel";
import { formatJpEra } from "@/lib/qa/jpEra";

export default function PracticeMenu({ params }: { params: { course: string } }) {
  const { course } = params;
  const [manifest, setManifest] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((e) => setErr(e?.message || "Không tải được manifest"));
  }, []);

  if (err) return <main className="p-8 text-red-600">Lỗi: {err}</main>;
  if (!manifest) return <main className="p-8">Đang tải...</main>;

  const subjects = manifest[course] || {};

  return (
    <main className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Khóa {course} — Chọn đề</h1>

      {/* 分野別 */}
      <section>
        <h2 className="text-xl font-semibold mb-2">分野別 (Theo môn)</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.keys(subjects).map((subjectId) => (
            <Link
              key={subjectId}
              href={`/courses/${course}/practice/start?subject=${subjectId}`}
              className="border rounded-lg p-4 bg-white shadow hover:shadow-lg"
            >
              <div className="font-medium text-lg">{subjectId}</div>
              <div className="text-sm text-gray-500">
                {subjects[subjectId].length} phiên bản đề
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 年度別 */}
      <section>
        <h2 className="text-xl font-semibold mb-2">年度別 (Theo năm)</h2>
        <div className="flex flex-wrap gap-2">
          {[2024, 2023, 2022, 2021, 2020].map((y) => (
            <button
              key={y}
              className="border rounded-lg px-3 py-2 hover:bg-gray-100"
              onClick={() => alert(`Chưa implement filter năm ${formatJpEra(y)}`)}
            >
              {formatJpEra(y)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
