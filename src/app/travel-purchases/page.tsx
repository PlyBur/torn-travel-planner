import Link from "next/link";
import { prisma } from "@/lib/prisma";

const APP_USER_ID = process.env.APP_USER_ID || "default-user";
const TORN_API_KEY = process.env.TORN_API_KEY!;

type PageProps = {
  searchParams?: Promise<{
    start?: string;
    end?: string;
  }>;
};

function money(value?: number | null) {
  return `$${Number(value ?? 0).toLocaleString("en-US")}`;
}

function cleanDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function buildDateWhere(start?: string, end?: string) {
  const where: any = {
    userId: APP_USER_ID,
  };

  if (start || end) {
    where.purchaseDate = {};

    if (start) where.purchaseDate.gte = `${start}T00:00:00.000Z`;
    if (end) where.purchaseDate.lte = `${end}T23:59:59.999Z`;
  }

  return where;
}

function buildQueryString(start?: string, end?: string) {
  const params = new URLSearchParams();

  if (start) params.set("start", start);
  if (end) params.set("end", end);

  const query = params.toString();
  return query ? `?${query}` : "";
}

async function getItemNameMap() {
  if (!TORN_API_KEY) return new Map<string, string>();

  try {
    const url = `https://api.torn.com/torn/?selections=items&key=${TORN_API_KEY}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) return new Map<string, string>();

    const data = await response.json();

    if (data.error || !data.items) return new Map<string, string>();

    const map = new Map<string, string>();

    for (const [id, item] of Object.entries<any>(data.items)) {
      map.set(String(id), item.name ?? `Item ${id}`);
    }

    return map;
  } catch {
    return new Map<string, string>();
  }
}

export default async function TravelPurchasesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const start = params?.start ?? "";
  const end = params?.end ?? "";

  const [purchases, itemNameMap] = await Promise.all([
    prisma.travelPurchase.findMany({
      where: buildDateWhere(start, end),
      orderBy: {
        purchaseDate: "desc",
      },
    }),
    getItemNameMap(),
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
        </div>

        <div className="flex gap-3">
          <Link
            href={`/${queryString}`}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Dashboard
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

      <form
        method="GET"
        action="/travel-purchases"
        className="mb-8 rounded-xl bg-zinc-900 p-5"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Start date
            </label>
            <input
              type="date"
              name="start"
              defaultValue={start}
              className="rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">End date</label>
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
            Apply Range
          </button>

          <Link
            href="/travel-purchases"
            className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800"
          >
            Clear
          </Link>
        </div>
      </form>

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
              const itemName =
                purchase.itemName ??
                itemNameMap.get(String(purchase.itemId)) ??
                `Item ${purchase.itemId}`;

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
                  No travel purchases found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}