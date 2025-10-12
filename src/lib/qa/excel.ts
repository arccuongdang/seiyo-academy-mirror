import type { Manifest, SubjectSnapshot, ManifestEntry } from "./schema";

export async function loadManifest(): Promise<Manifest> {
  try {
    const res = await fetch("/snapshots/manifest.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch manifest: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    try {
      const json = JSON.parse(text) as Manifest;
      return json;
    } catch (e: any) {
      throw new Error(`Invalid manifest.json: ${e?.message || "JSON parse error"}`);
    }
  } catch (e) {
    console.error("[loadManifest] error:", e);
    throw e;
  }
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


// ------------------------------------------------------------------
// (MỚI) Load meta môn từ /public/snapshots/<course>/subjects.json
// Cấu trúc gợi ý:
// { "TK": { "nameJA": "計画", "nameVI": "Thiết kế" }, "L": {...}, ... }
// Nếu chưa có file -> trả về {}
// ------------------------------------------------------------------
export async function loadSubjectsMeta(
  courseId: string
): Promise<Record<string, { nameJA?: string; nameVI?: string }>> {
  const url = `/snapshots/${courseId}/subjects.json`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    const json = await res.json();
    if (json && typeof json === 'object') return json;
    return {};
  } catch {
    return {};
  }
}
