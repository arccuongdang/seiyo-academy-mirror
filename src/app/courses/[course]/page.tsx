'use client';

import { useEffect, useState } from "react";
import Link from "next/link";

// ⛳️ Import TRỰC TIẾP
import { loadManifest } from "../../../lib/qa/excel";

type Manifest = Record<string, Record<string, string[]>>;

export default function CoursesPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((e) => setErr(e?.message || "Không tải được manifest"));
  }, []);

  if (err) return <main className="p-8 text-red-600">Lỗi: {err}</main>;
  if (!manifest) return <main className="p-8">Đang tải dữ liệu...</main>;

  const courseIds = Object.keys(manifest);

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold mb-4">Danh sách khóa học</h1>
      <div className="grid md:grid-cols-3 gap-4">
        {courseIds.map((courseId) => (
          <Link
            key={courseId}
            href={`/courses/${courseId}/practice`}
            className="border rounded-xl shadow hover:shadow-lg p-4 bg-white"
          >
            <div className="text-lg font-semibold">{courseId}</div>
            <div className="text-sm text-gray-500">
              {Object.keys(manifest[courseId]).length} môn
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
