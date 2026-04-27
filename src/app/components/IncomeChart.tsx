"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

type Props = {
  breakdown: {
    crimes: number;
    stocks: number;
    tradeIncome?: number;
    travelNet?: number;
    other: number;
  };
};

export default function IncomeChart({ breakdown }: Props) {
  const data = [
    { name: "Crimes", value: breakdown.crimes || 0 },
    { name: "Stocks", value: breakdown.stocks || 0 },
    { name: "Trades", value: breakdown.tradeIncome || 0 },
    { name: "Travel Net", value: breakdown.travelNet || 0 },
    { name: "Other", value: breakdown.other || 0 },
  ];

  return (
    <div className="rounded-2xl bg-zinc-900 p-6">
      <h3 className="mb-4 text-sm text-zinc-400">Income Distribution</h3>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />

          <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} />
          <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} />

          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #27272a",
              borderRadius: "8px",
              color: "#fff",
            }}
          />

          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.name === "Stocks"
                    ? "#22c55e"
                    : entry.name === "Trades"
                    ? "#f59e0b"
                    : entry.name === "Travel Net"
                    ? "#14b8a6"
                    : entry.name === "Crimes"
                    ? "#3b82f6"
                    : "#6b7280"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}