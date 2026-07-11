/**
 * Tiny CSV exporter — admin pages call `downloadCsv("members.csv", rows)`
 * to dump the current selection. No external dep; quoting handles
 * commas, quotes, and newlines the RFC 4180 way.
 */

export interface CsvColumn<T> {
  header: string;
  /** Accessor returning a string or number; null/undefined become empty. */
  get: (row: T) => string | number | bigint | null | undefined;
}

function escapeField(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "bigint" ? v.toString() : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeField(c.get(r))).join(",")).join("\n");
  // BOM so Excel detects UTF-8 (Chinese column headers stay legible).
  return `﻿${header}\n${body}\n`;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
