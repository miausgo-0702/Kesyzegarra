// Exportación de tablas a CSV (con BOM, separador ";" para Excel en español) y a Excel (.xls).
export type Fila = Record<string, string | number | null | undefined>;

function descargar(nombre: string, contenido: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escCsv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportarCSV(nombre: string, filas: Fila[]) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const csv = [cols.join(";"), ...filas.map((f) => cols.map((c) => escCsv(f[c])).join(";"))].join("\r\n");
  descargar(`${nombre}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
}

const escHtml = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function exportarExcel(nombre: string, filas: Fila[], hoja = "Nexoresto") {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escHtml(hoja)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1"><thead><tr>${cols.map((c) => `<th style="background:#0c1117;color:#1ee08f">${escHtml(c)}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${cols.map((c) => `<td${typeof f[c] === "number" ? ' style="mso-number-format:\\#\\,\\#\\#0"' : ""}>${escHtml(f[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  descargar(`${nombre}.xls`, html, "application/vnd.ms-excel");
}
