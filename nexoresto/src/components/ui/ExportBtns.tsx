"use client";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Btn } from "./kit";
import { exportarCSV, exportarExcel, type Fila } from "@/lib/exportar";

export function ExportBtns({ nombre, filas }: { nombre: string; filas: () => Fila[] }) {
  const fecha = new Date().toISOString().slice(0, 10);
  return (
    <span className="flex gap-1.5">
      <Btn size="sm" variant="outline" onClick={() => exportarExcel(`${nombre}-${fecha}`, filas())} title="Exportar a Excel"><FileSpreadsheet size={14} />Excel</Btn>
      <Btn size="sm" variant="outline" onClick={() => exportarCSV(`${nombre}-${fecha}`, filas())} title="Exportar a CSV"><FileText size={14} />CSV</Btn>
    </span>
  );
}
