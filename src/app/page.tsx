"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function formatMoney(amount?: number | null) {
  const safeAmount = Number(amount ?? 0);
  return `$${safeAmount.toLocaleString("en-US")}`;
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

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tick, setTick] = useState(0);

  const queryString = useMemo(
    () => buildQueryString(startDate, endDate),
    [startDate, endDate]
  );

  const travelHref = `/travel-purchases${queryString}`;
  const tradesHref = `/trades${queryString}`;
  const logbookHref = `/logbook${queryString}`;

  async function loadDashboard() {
    try {
      const res = await fetch(`/dashboard-data${queryString}`, {
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

  function applyDateRange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    loadDashboard();
  }

  function clearDateRange() {
    setStartDate("");
    setEndDate("");
  }

  useEffect(() => {
    loadDashboard();
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
      {/* HEADER */}
      <div className="mb-8 flex justify-between">
        <div>
          <h1 className="text-3xl font-bold">Torn Ops Intelligence</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Player: {data.player?.playerName}
          </p>
          {message && (
            <p className="text-zinc-400 text-sm mt-2">{message}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={runLatestUpdate}
            disabled={syncingLatest}
            className="bg-emerald-600 px-5 py-2 rounded-lg font-semibold"
          >
            {syncingLatest ? "Updating..." : "Latest Update"}
          </button>

          <Link href="/daily-activity" className="btn">
            Daily Activity
          </Link>

          <Link href={travelHref} className="btn">
            Travel
          </Link>
          <Link href={tradesHref} className="btn">
            Trades
          </Link>
          <Link href={logbookHref} className="btn">
            Logbook
          </Link>
          <Link href="/settings" className="btn">
            Settings
          </Link>
        </div>
      </div>

      {/* STATUS */}
      <div className="grid grid-cols-4 gap-6 mb-8">
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

      {/* DATE FILTER */}
      <form
        onSubmit={applyDateRange}
        className="bg-zinc-900 p-5 rounded-xl mb-8 flex gap-4 items-end"
      >
        <InputDate label="Start" value={startDate} set={setStartDate} />
        <InputDate label="End" value={endDate} set={setEndDate} />

        <button className="btn">Apply</button>
        <button type="button" onClick={clearDateRange} className="btn-outline">
          Clear
        </button>
      </form>

      {/* FINANCIALS */}
      <div className="grid grid-cols-5 gap-6 mb-10">
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

/* --- UI HELPERS --- */

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
    <div className="bg-zinc-900 p-5 rounded-xl">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
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
      <label className="text-sm text-zinc-400 block mb-1">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => set(e.target.value)}
        className="bg-black border border-zinc-700 px-3 py-2 rounded-lg"
      />
    </div>
  );
}