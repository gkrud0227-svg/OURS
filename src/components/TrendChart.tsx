"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekPoint } from "@/lib/types";

const ACCENT = "#C17A5A";

export function TrendChart({ data }: { data: WeekPoint[] }) {
  const chartData = data.map((d) => ({
    label: d.period.slice(5), // MM-DD
    period: d.period,
    ratio: Math.round(d.ratio * 10) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 12, right: 16, left: -12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#efe7e2" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#9a8f89" }}
          axisLine={false}
          tickLine={false}
          padding={{ left: 8, right: 8 }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#9a8f89" }}
          axisLine={false}
          tickLine={false}
          width={40}
          domain={[0, "auto"]}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #eee",
            fontSize: 13,
            boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
          }}
          labelFormatter={(label, payload) =>
            payload?.[0]?.payload?.period ?? String(label)
          }
          formatter={(value) => [value as number, "검색지수"]}
        />
        <Line
          type="monotone"
          dataKey="ratio"
          stroke={ACCENT}
          strokeWidth={2.5}
          dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
