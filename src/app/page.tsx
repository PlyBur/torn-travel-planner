"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type QuickRange = "day" | "week" | "month" | "custom";

function formatMoney(amount?: number | null) {
  const safeAmount = Number(amount ?? 0);
  return `$${safeAmount.toLocaleString("en-US")}`;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayString() {
  return toDateInputValue(new Date());
}

function daysAgoString(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return toDateInputValue(date);
}

function getRangeDates(range: QuickRange) {
  const end = todayString();

  if (range === "week") {
    return {
      start: daysAgoString(6),
      end,
    };
  }

  if (range === "month") {
    return {
      start: daysAgoString(29),
      end,
    };
  }

  return {
    start: todayString(),
    end,
  };
}

function buildQueryString(startDate: string, endDate: string) {
  const params = new URLSearchParams();

  if (startDate) params.set("start", startDate);
  if (endDate) params.set("end", endDate);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function isValidDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function formatDateTime(value?: string | null) {
  if (!isValidDate(value)) return "Never";
  return new Date(value as string).toLocaleString();
}

function formatDate(value?: string | null) {
  if (!isValidDate(value)) return "-";
  return new Date(value as string).toISOString().slice(0, 10);
}

function getAgeText(value?: string | null) {
  if (!isValidDate(value)) return "Never updated";

  const diffMs = Date.now() - new Date(value as string).getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [syncingLatest, setSyncingLatest] = useState(false);
  const [message, setMessage] = useState("");

  const defaultRange = getRangeDates("day");

  const [activeRange, setActiveRange] = useState<QuickRange>("day");
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [, setTick] = useState(0);

  const queryString = useMemo(
    () => buildQueryString(startDate, endDate),
    [startDate, endDate]
  );

  const dailyActivityHref = `/daily-activity?date=${endDate || todayString()}`;
  const travelHref = `/travel-purchases${queryString}`;
  const tradesHref = `/trades${queryString}`;

  async function loadDashboard(nextQueryString = queryString) {
    try {
      const res = await fetch(`/dashboard-data${nextQueryString}`, {
        cache: "no-store",
      });

      const result = await res.json();

      setData(result);

      if (!result.success) {
        setMessage(result.error ?? "Failed to load dashboard.");
      }
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to load dashboard.");
    }
  }

  async function runLatestUpdate() {
    setSyncingLatest(true);
    setMessage("Running latest update...");

    try {
      const res = await fetch("/test-api", { cache: "no-store" });
      const result = await res.json();

      if (result.success) {
        setMessage(
          `Latest update complete. Scanned ${result.scannedLogs ?? 0} logs.`
        );
        await loadDashboard();
      } else {
        setMessage(result.error ?? "Latest update failed.");
      }
    } catch (err: any) {
      setMessage(err?.message ?? "Latest update failed.");
    } finally {
      setSyncingLatest(false);
    }
  }

  function applyQuickRange(range: QuickRange) {
    const nextRange = getRangeDates(range);
    const nextQueryString = buildQueryString(nextRange.start, nextRange.end);

    setActiveRange(range);
    setStartDate(nextRange.start);
    setEndDate(nextRange.end);

    loadDashboard(nextQueryString);
  }

  function applyDateRange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const nextQueryString = buildQueryString(startDate, endDate);

    setActiveRange("custom");
    loadDashboard(nextQueryString);
  }

  useEffect(() => {
    const initialRange = getRangeDates("day");
    const initialQueryString = buildQueryString(initialRange.start, initialRange.end);

    loadDashboard(initialQueryString);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return <div className="p-10">Loading...</div>;

  if (data.needsSettings) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        <h1 className="text-3xl font-bold">Torn Ops Intelligence</h1>
        <p className="mt-3 text-zinc-400">
          Please configure your API key first.
        </p>

        <Link
          href="/settings"
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-6 py-3 font-semibold"
        >
          Open Settings
        </Link>
      </main>
    );
  }

  const financials = data.financials ?? {};
  const syncState = data.syncState ?? {};
  const counts = data.counts ?? {};

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <div className="mb-8 flex justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Torn Ops Intelligence</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Player: {data.player?.playerName}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Showing: {formatDate(startDate)} to {formatDate(endDate)}
          </p>
          {message && (
            <p className="mt-2 text-sm text-zinc-400">{message}</p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            onClick={runLatestUpdate}
            disabled={syncingLatest}
            className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold disabled:opacity-60"
          >
            {syncingLatest ? "Updating..." : "Latest Update"}
          </button>

          <Link href={dailyActivityHref} className="btn">
            Daily Activity
          </Link>
          
          <Link href={`/trade-intelligence${queryString}`} className="btn">
            Trade Intelligence
          </Link>

          <Link href={travelHref} className="btn">
            Travel
          </Link>

          <Link href={tradesHref} className="btn">
            Trades
          </Link>

          <Link href="/settings" className="btn">
            Settings
          </Link>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-6">
        <Card
          title="Data From"
          value={formatDate(syncState.backfillFromDate)}
          sub={`Status: ${
            syncState.backfillComplete ? "Complete" : "Not Complete"
          }`}
        />

        <Card
          title="Latest Update"
          value={getAgeText(syncState.lastLatestUpdateAt)}
          sub={`Last: ${formatDateTime(syncState.lastLatestUpdateAt)}`}
        />

        <Card
          title="Backfill Logs"
          value={(syncState.backfillScannedLogs ?? 0).toLocaleString()}
        />

        <Card
          title="Latest Logs"
          value={(syncState.latestScannedLogs ?? 0).toLocaleString()}
        />
      </div>

      <div className="mb-8 rounded-xl bg-zinc-900 p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => applyQuickRange("day")}
            className={activeRange === "day" ? "btn-active" : "btn-outline"}
          >
            Day
          </button>

          <button
            type="button"
            onClick={() => applyQuickRange("week")}
            className={activeRange === "week" ? "btn-active" : "btn-outline"}
          >
            Week
          </button>

          <button
            type="button"
            onClick={() => applyQuickRange("month")}
            className={activeRange === "month" ? "btn-active" : "btn-outline"}
          >
            Month
          </button>

          <span className="text-sm text-zinc-500">
            Use custom range only when you need older or specific data.
          </span>
        </div>

        <form onSubmit={applyDateRange} className="flex flex-wrap items-end gap-4">
          <InputDate label="Custom start" value={startDate} set={setStartDate} />
          <InputDate label="Custom end" value={endDate} set={setEndDate} />

          <button className="btn">Apply Custom Range</button>
        </form>
      </div>

      <div className="mb-10 grid grid-cols-5 gap-6">
        <Card title="Networth" value={formatMoney(data.currentNetworth)} />
        <Card title="Trade Income" value={formatMoney(financials.tradeIncome)} />
        <Card title="Travel Spend" value={formatMoney(financials.travelCost)} />
        <Card title="Travel Profit" value={formatMoney(financials.travelNet)} />
        <Card
          title="Trades"
          value={(counts.tradeActivities ?? 0).toLocaleString()}
        />
      </div>
    </main>
  );
}

function Card({
  title,
  value,
  sub,
}: {
  title: string;
  value: any;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-900 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function InputDate({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-400">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => set(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
      />
    </div>
  );
}