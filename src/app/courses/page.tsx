"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadManifest } from "../../lib/qa/excel";
import type { Manifest } from '../../lib/qa/schema'; 
import AuthGate from '../../components/AuthGate';
import ProfileGate from '../../components/ProfileGate';

export default function CoursesPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    loadManifest()
      .then((m) => setManifest(() => m)) // ✅ functional updater, TS chấp nhận
      .catch((err) => console.error("Failed to load manifest:", err));
  }, []);

  if (!manifest) return <div className="p-8">Đang tải dữ liệu...</div>;

  const courseIds = Object.keys(manifest);
  return (
    <AuthGate>
      <ProfileGate>
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
      </ProfileGate>
    </AuthGate>
  );
}
