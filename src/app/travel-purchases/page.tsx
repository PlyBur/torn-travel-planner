import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/current-user";
import { getItemNameMap, resolveItemName } from "@/lib/torn-lookups";

type PageProps = {
  searchParams?: Promise<{
    start?: string;
    end?: string;
  }>;
};

type QuickRange = "day" | "week" | "month";

function money(value?: number | null) {
  return `$${Number(value ?? 0).toLocaleString("en-US")}`;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoString(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function getRangeDates(range: QuickRange) {
  const end = todayString();

  if (range === "week") {
    return { start: daysAgoString(6), end };
  }

  if (range === "month") {
    return { start: daysAgoString(29), end };
  }

  return { start: todayString(), end };
}

function isValidDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime());
}

function getEffectiveDateRange(start?: string, end?: string) {
  const defaultRange = getRangeDates("day");

  return {
    start: isValidDate(start) ? (start as string) : defaultRange.start,
    end: isValidDate(end) ? (end as string) : defaultRange.end,
  };
}

function buildDateWhere(userId: string, start: string, end: string) {
  return {
    userId,
    purchaseDate: {
      gte: `${start}T00:00:00.000Z`,
      lte: `${end}T23:59:59.999Z`,
    },
  };
}

function buildQueryString(start: string, end: string) {
  const params = new URLSearchParams();

  params.set("start", start);
  params.set("end", end);

  return `?${params.toString()}`;
}

function cleanDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function quickRangeHref(range: QuickRange) {
  const dates = getRangeDates(range);
  return `/travel-purchases${buildQueryString(dates.start, dates.end)}`;
}

function isActiveRange(start: string, end: string, range: QuickRange) {
  const dates = getRangeDates(range);
  return start === dates.start && end === dates.end;
}

export default async function TravelPurchasesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const { start, end } = getEffectiveDateRange(params?.start, params?.end);

  const user = await getCurrentAppUser();

  if (!user?.apiKey) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        <h1 className="text-3xl font-bold">Travel Purchases</h1>
        <p className="mt-3 text-zinc-400">
          Please configure your Torn API key first.
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

  const [purchases, itemNameMap] = await Promise.all([
    prisma.travelPurchase.findMany({
      where: buildDateWhere(user.id, start, end),
      orderBy: {
        purchaseDate: "desc",
      },
    }),
    getItemNameMap(user.apiKey),
  ]);

  const totalItems = purchases.reduce(
    (sum, purchase) => sum + Number(purchase.quantity ?? 0),
    0
  );

  const totalCost = purchases.reduce(
    (sum, purchase) => sum + Number(purchase.totalCost ?? 0),
    0
  );

  const queryString = buildQueryString(start, end);

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Travel Purchases</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Abroad item purchases filtered from Torn log type 4201.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Showing data for: {user.playerName ?? "Current player"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Range: {start} to {end}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href={`/${queryString}`}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Dashboard
          </Link>

          <Link
            href={`/daily-activity?date=${end}`}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Daily Activity
          </Link>

          <Link
            href={`/logbook${queryString}`}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Logbook
          </Link>

          <Link
            href={`/trades${queryString}`}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Trades
          </Link>
        </div>
      </div>

      <div className="mb-8 rounded-xl bg-zinc-900 p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link
            href={quickRangeHref("day")}
            className={
              isActiveRange(start, end, "day")
                ? "rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold"
                : "rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800"
            }
          >
            Day
          </Link>

          <Link
            href={quickRangeHref("week")}
            className={
              isActiveRange(start, end, "week")
                ? "rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold"
                : "rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800"
            }
          >
            Week
          </Link>

          <Link
            href={quickRangeHref("month")}
            className={
              isActiveRange(start, end, "month")
                ? "rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold"
                : "rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800"
            }
          >
            Month
          </Link>

          <span className="text-sm text-zinc-500">
            Default view is today. Use custom range for older data.
          </span>
        </div>

        <form
          method="GET"
          action="/travel-purchases"
          className="flex flex-wrap items-end gap-4"
        >
          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Custom start
            </label>
            <input
              type="date"
              name="start"
              defaultValue={start}
              className="rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Custom end
            </label>
            <input
              type="date"
              name="end"
              defaultValue={end}
              className="rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-600"
          >
            Apply Custom Range
          </button>
        </form>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Purchases</p>
          <p className="mt-2 text-2xl font-bold">
            {purchases.length.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Total Items</p>
          <p className="mt-2 text-2xl font-bold">
            {totalItems.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Total Cost</p>
          <p className="mt-2 text-2xl font-bold">{money(totalCost)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Country</th>
              <th className="p-3 text-left">Item</th>
              <th className="p-3 text-left">Qty</th>
              <th className="p-3 text-left">Unit Price</th>
              <th className="p-3 text-left">Total Cost</th>
              <th className="p-3 text-left">Trip</th>
              <th className="p-3 text-left">Notes</th>
            </tr>
          </thead>

          <tbody>
            {purchases.map((purchase) => {
              const itemName = resolveItemName(
                purchase.itemId,
                purchase.itemName,
                itemNameMap
              );

              return (
                <tr key={purchase.id} className="border-t border-zinc-800">
                  <td className="p-3">{cleanDate(purchase.purchaseDate)}</td>
                  <td className="p-3">{purchase.country ?? "-"}</td>
                  <td className="p-3">{itemName}</td>
                  <td className="p-3">{purchase.quantity}</td>
                  <td className="p-3">{money(purchase.unitPrice)}</td>
                  <td className="p-3 text-red-400">
                    -{money(purchase.totalCost)}
                  </td>
                  <td className="p-3">{purchase.tripLabel ?? "-"}</td>
                  <td className="p-3">{purchase.notes ?? "-"}</td>
                </tr>
              );
            })}

            {purchases.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-zinc-400">
                  No travel purchases found for this player/date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}