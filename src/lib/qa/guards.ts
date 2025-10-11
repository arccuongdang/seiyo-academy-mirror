// src/lib/qa/guards.ts
import type { QuestionItem } from "./types";

export type ValidationIssue =
  | { level: "error"; code: "NO_CORRECT"; message: string; questionId: string }
  | { level: "error"; code: "TOO_MANY_CORRECT"; message: string; questionId: string; count: number }
  | { level: "warn"; code: "MULTI_CORRECT"; message: string; questionId: string; count: number };

export function validateQuestion(q: QuestionItem): ValidationIssue[] {
  const count = q.options.filter(o => o.isAnswer).length;
  if (count === 0) {
    return [{ level: "error", code: "NO_CORRECT", message: "No correct answer", questionId: q.questionId }];
  }
  if (count === 1) return [];
  if (count === 2) {
    return [{ level: "warn", code: "MULTI_CORRECT", message: "Two correct answers allowed", questionId: q.questionId, count }];
  }
  return [{ level: "error", code: "TOO_MANY_CORRECT", message: "More than 2 correct answers", questionId: q.questionId, count }];
}

/** Validate một mảng câu hỏi, trả về issues & tách 2 mảng error vs warn */
export function validateQuestions(questions: QuestionItem[]) {
  const issues = questions.flatMap(validateQuestion);
  const errors = issues.filter(i => i.level === "error");
  const warns = issues.filter(i => i.level === "warn");
  return { errors, warns, issues };
}
