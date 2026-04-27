"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Props = {
  data: {
    date: string;
    amount: number;
  }[];
};

export default function TimeTrendChart({ data }: Props) {
  return (
    <div className="rounded-2xl bg-zinc-900 p-6">
      <h3 className="mb-4 text-sm text-zinc-400">Income Over Time</h3>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />

          <XAxis
            dataKey="date"
            stroke="#a1a1aa"
            tick={{ fill: "#a1a1aa" }}
          />

          <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} />

          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #27272a",
              borderRadius: "8px",
              color: "#fff",
            }}
          />

          <Line
            type="monotone"
            dataKey="amount"
            stroke="#22c55e"
            strokeWidth={3}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}