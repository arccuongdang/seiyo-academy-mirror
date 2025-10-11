// src/lib/qa/grade.ts
import type { OptionItem, QuestionItem, GradeResult } from "./types";

export function gradeSingleChoice(
  selectedId: string | null,
  options: OptionItem[]
): GradeResult {
  const correctIds = options.filter(o => o.isAnswer).map(o => o.id);
  const isCorrect = !!selectedId && correctIds.includes(selectedId);
  return {
    isCorrect,
    selectedId,
    correctIds,
    primaryCorrectId: correctIds[0],
    multiCorrect: correctIds.length >= 2,
  };
}

/** Lấy giải thích để hiển thị sau khi nộp */
export function getExplanationFor(
  q: QuestionItem,
  selectedId: string | null,
  lang: "JA" | "VI" = "JA"
): { selected?: string; others?: string[]; general?: string } {
  const byId = new Map(q.options.map(o => [o.id, o]));
  const sel = selectedId ? byId.get(selectedId) : undefined;

  const selExpl =
    lang === "VI" ? sel?.explanationVI || sel?.explanationJA : sel?.explanationJA || sel?.explanationVI;

  const otherCorrectExplanations = q.options
    .filter(o => o.isAnswer && o.id !== selectedId)
    .map(o => (lang === "VI" ? o.explanationVI || o.explanationJA : o.explanationJA || o.explanationVI))
    .filter(Boolean) as string[];

  const general =
    lang === "VI"
      ? q.generalExplanationVI || q.generalExplanationJA
      : q.generalExplanationJA || q.generalExplanationVI;

  return { selected: selExpl, others: otherCorrectExplanations, general };
}
