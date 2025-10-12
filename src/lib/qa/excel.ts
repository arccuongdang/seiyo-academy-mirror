import type { Manifest, SubjectSnapshot, ManifestEntry } from "./schema";

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch("/snapshots/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load manifest.json");
  return res.json();
}

/**
 * Chọn file snapshot mới nhất cho course/subject.
 * Trả về: string | null (tên file JSON)
 */
export function pickLatestFile(
  manifest: Manifest | any,   // 👈 cho phép nhận cả format mới
  courseId: string,
  subjectId: string
): string | null {
  const subjects = manifest[courseId];
  if (!subjects) return null;

  const list = subjects[subjectId];
  if (!list || list.length === 0) return null;

  // Nếu bạn luôn append theo thời gian, lấy phần tử cuối là đủ:
  // return list[list.length - 1].filename;

  // (Ổn hơn) Sắp theo publishedAt giảm dần rồi lấy filename đầu:
  const sorted = [...list].sort((a: ManifestEntry, b: ManifestEntry) => {
    const ta = Date.parse(a.publishedAt ?? "");
    const tb = Date.parse(b.publishedAt ?? "");
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    // nếu thiếu timestamp, giữ nguyên thứ tự ban đầu
    return 0;
  });

  return (sorted[0] ?? list[list.length - 1]).filename;
}

export async function loadSubjectSnapshot(courseId: string, subjectId: string, filename: string): Promise<SubjectSnapshot> {
  const url = `/snapshots/${courseId}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load snapshot: ${url}`);
  return res.json();
}
