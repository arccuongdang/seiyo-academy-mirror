'use client';

import { useEffect, useState } from "react";
import Papa from "papaparse";
import Image from "next/image";
import Link from "next/link";
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

export default function QuestionListPage() {
  const { course, subject, year } = useParams<{ course: string; subject: string; year: string }>(); // 👈
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const csvUrl = `/data/${course}/${year}/${subject}.csv`;

  useEffect(() => {
    setLoading(true);
    Papa.parse<Row>(csvUrl, {
      header: true, download: true, skipEmptyLines: true,
      complete: (result) => {
        const data = (result.data || []).filter(Boolean) as Row[];
        data.sort((a, b) => Number(a.q) - Number(b.q));
        setRows(data);
        setLoading(false);
      },
      error: () => setLoading(false),
    });
  }, [csvUrl]);

  if (loading) return <main className="p-6">Đang tải dữ liệu…</main>;
  if (!rows.length) return <main className="p-6">Không có dữ liệu cho {String(subject)}/{String(year)} ({String(course)})</main>;

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Đề {String(subject)} — {String(year)} ({String(course)})</h1>
      <ul className="grid md:grid-cols-2 gap-6">
        {rows.map((r) => (
          <li key={r.id} className="border rounded-xl p-4">
            {r.questionImage ? (
              <div className="aspect-video relative mb-3 bg-neutral-100 rounded-lg">
                <Image src={r.questionImage} alt={r.id} fill className="object-contain" sizes="50vw" />
              </div>
            ) : (
              <p className="mb-3 line-clamp-3 text-sm text-gray-700">{r.questionText}</p>
            )}
            <div className="font-semibold mb-2">Câu {r.q}</div>
            <Link className="text-blue-600 underline" href={`/${course}/${subject}/${year}/${r.q}`}>
              Xem chi tiết
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
