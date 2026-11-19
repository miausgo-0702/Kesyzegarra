"use client";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { useId } from "react";
import type { PuntoPrecio } from "@/lib/types";

/** Gráfico de cotización tipo bolsa (verde si sube, rojo si baja). */
export function Sparkline({ data, up, height = 120, neon, strokeWidth = 2 }: { data: PuntoPrecio[]; up?: boolean; height?: number | `${number}%`; neon?: boolean; strokeWidth?: number }) {
  const id = useId().replace(/:/g, "");
  const subiendo = up ?? (data.length > 1 ? data[data.length - 1].p >= data[0].p : true);
  const color = neon ? (subiendo ? "#00FF66" : "#FF3333") : subiendo ? "#1ee08f" : "#ff4d5e";
  const pts = data.length ? data : [{ t: 0, p: 0 }];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={pts} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin - 50", "dataMax + 50"]} />
        <Area type="linear" dataKey="p" stroke={color} strokeWidth={strokeWidth} fill={`url(#g${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
