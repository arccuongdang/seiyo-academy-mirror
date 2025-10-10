'use client';

import { useEffect, useState } from 'react';
import Papa from 'papaparse';

// Custom ParseResult type
interface ParseResult<T> {
  data: T[];
  errors: Array<{ message: string; row: number; index?: number }>;
  meta: {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
  };
}

// Custom ParseError type
interface ParseError {
  message: string;
  code?: string;
  row?: number;
}

type Row = {
  id?: string;
  question?: string;
  answer?: string;
  [key: string]: unknown;
};

type PageProps = {
  params: { course: string; subject: string; year: string };
  searchParams?: { csv?: string };
};

export default function Page({ params, searchParams }: PageProps) {
  const { course, subject, year } = params;

  const csvUrl =
    searchParams?.csv ??
    `/data/${encodeURIComponent(course)}/${encodeURIComponent(subject)}/${encodeURIComponent(year)}.csv`;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);

    Papa.parse(csvUrl, {
      header: true,
      download: true,
      skipEmptyLines: true,
      complete: (result: ParseResult<Row>) => {
        const data = (result.data ?? []).filter(Boolean) as Row[];
        setRows(data);
        setLoading(false);
      },
      error: (error: ParseError) => {
        setErr(error.message || 'CSV parse error');
        setLoading(false);
      },
    });
  }, [csvUrl]);

  if (loading) return <p style={{ padding: 16 }}>Đang tải dữ liệu…</p>;
  if (err) return <p style={{ padding: 16, color: 'crimson' }}>Lỗi: {err}</p>;

  return (
    <main style={{ padding: 24 }}>
      <h1>
        {course} / {subject} / {year}
      </h1>
      {rows.length === 0 ? (
        <p>Không có dữ liệu (kiểm tra đường dẫn CSV: <code>{csvUrl}</code>)</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 12 }}>
          <thead>
            <tr>
              {Object.keys(rows[0]).map((k) => (
                <th key={k} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {Object.keys(rows[0]).map((k) => (
                  <td key={k} style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>
                    {String(r[k] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}