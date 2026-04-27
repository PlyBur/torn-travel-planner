"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  initialStart?: string;
  initialEnd?: string;
};

export default function DateRangePicker({ initialStart = "", initialEnd = "" }: Props) {
  const router = useRouter();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  function applyFilter() {
    const params = new URLSearchParams();

    if (start) params.set("start", start);
    if (end) params.set("end", end);

    router.push(`/?${params.toString()}`);
  }

  function clearFilter() {
    setStart("");
    setEnd("");
    router.push("/");
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl bg-zinc-900 p-4 md:flex-row md:items-end">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Start date</label>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-400">End date</label>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      <button
        onClick={applyFilter}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Apply
      </button>

      <button
        onClick={clearFilter}
        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
      >
        Clear
      </button>
    </div>
  );
}