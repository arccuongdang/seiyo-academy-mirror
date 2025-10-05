'use client';

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { useParams } from "next/navigation"; // 👈

type Row = {
  id: string; year: string; subject: string; q: string;
  questionText?: string; questionImage?: string;
  choiceAText?: string; choiceAImage?: string;
  choiceBText?: string; choiceBImage?: string;
  choiceCText?: string; choiceCImage?: string;
  choiceDText?: string; choiceDImage?: string;
  answer: "A"|"B"|"C"|"D"; explanation?: string;
};

export default function QuestionDetail() {
  const { course, subject, year, q } = useParams<{ course: string; subject: string; year: string; q: string }>(); // 👈
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<"A"|"B"|"C"|"D"|null>(null);

  useEffect(() => {
    const url = `/data/${course}/${year}/${subject}.csv`;
    Papa.parse<Row>(url, {
      header: true, download: true, skipEmptyLines: true,
      complete: (res) => setRows((res.data || []) as Row[])
    });
  }, [course, subject, year]);

  const item = useMemo(() => rows.find(r => r.q === q), [rows, q]);
  if (!item) return <main className="p-6">Đang tải/không tìm thấy câu hỏi…</main>;

  const choices = [
    { key: "A", text: item.choiceAText, image: item.choiceAImage },
    { key: "B", text: item.choiceBText, image: item.choiceBImage },
    { key: "C", text: item.choiceCText, image: item.choiceCImage },
    { key: "D", text: item.choiceDText, image: item.choiceDImage },
  ] as const;

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <Link href={`/${course}/${subject}/${year}`} className="text-blue-600 underline">
        ← Quay lại {String(subject)}/{String(year)} ({String(course)})
      </Link>
      <h1 className="text-xl font-bold">Câu {item.q} — {String(subject)} / {String(year)} ({String(course)})</h1>

      {item.questionImage && (
        <div className="aspect-video relative bg-neutral-100 rounded-lg">
          <Image src={item.questionImage} alt={item.id} fill className="object-contain" sizes="100vw" />
        </div>
      )}
      {item.questionText && <p className="text-gray-800">{item.questionText}</p>}

      <section className="space-y-3">
        {choices.map((c) => (
          <button
            key={c.key}
            onClick={() => setPicked(c.key as any)}
            className={clsx(
              "w-full text-left border rounded-lg p-3 hover:bg-neutral-50",
              picked && c.key === item.answer && "border-emerald-300",
              picked && picked === c.key && picked !== item.answer && "border-rose-300"
            )}
          >
            <span className="font-mono mr-2">{c.key}.</span>
            {c.image ? (
              <Image src={c.image} alt={`Answer ${c.key}`} width={800} height={450} className="h-auto w-full object-contain rounded inline-block" />
            ) : (
              <span>{c.text}</span>
            )}
          </button>
        ))}
      </section>

      {picked && (
        <div className={clsx(
          "p-3 rounded-lg border",
          picked === item.answer ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
        )}>
          {picked === item.answer ? "✅ Chính xác!" : `❌ Sai. Đáp án đúng: ${item.answer}`}
        </div>
      )}

      {item.explanation && (
        <section className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <h3 className="font-semibold mb-1">Giải thích</h3>
          <p>{item.explanation}</p>
        </section>
      )}
    </main>
  );
}
