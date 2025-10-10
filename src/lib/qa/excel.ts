// Loader cho snapshots tĩnh trong /public/snapshots

import type { Manifest, SubjectSnapshot } from "./schema";

// Đọc manifest tĩnh (SSR/CSR đều được vì nằm trong public/)
export async function loadManifest(): Promise<Manifest> {
  const res = await fetch("/snapshots/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load manifest.json");
  return res.json();
}

// Lấy tên file snapshot mới nhất cho 1 môn
export function pickLatestFile(manifest: Manifest, courseId: string, subjectId: string): string | null {
  const subjects = manifest[courseId];
  if (!subjects) return null;
  const list = subjects[subjectId];
  if (!list || list.length === 0) return null;
  return list[0]; // newest-first theo Bước 2
}

// Tải snapshot 1 môn
export async function loadSubjectSnapshot(courseId: string, subjectId: string, filename: string): Promise<SubjectSnapshot> {
  const url = `/snapshots/${courseId}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load snapshot: ${url}`);
  return res.json();
}
