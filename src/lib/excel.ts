import type { Manifest, SubjectSnapshot } from "./schema";

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch("/snapshots/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load manifest.json");
  return res.json();
}

export function pickLatestFile(manifest: Manifest, courseId: string, subjectId: string): string | null {
  const subjects = manifest[courseId];
  if (!subjects) return null;
  const list = subjects[subjectId];
  if (!list || list.length === 0) return null;
  return list[0];
}

export async function loadSubjectSnapshot(courseId: string, subjectId: string, filename: string): Promise<SubjectSnapshot> {
  const url = `/snapshots/${courseId}/${filename}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot load snapshot: ${url}`);
  return res.json();
}
