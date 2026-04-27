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

function money(value?: number | null) {
  return `$${Number(value ?? 0).toLocaleString("en-US")}`;
}

function cleanDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function isValidDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime());
}

function buildDateWhere(userId: string, start?: string, end?: string) {
  const where: any = { userId };

  const hasStart = isValidDate(start);
  const hasEnd = isValidDate(end);

  if (hasStart || hasEnd) {
    where.purchaseDate = {};

    if (hasStart) {
      where.purchaseDate.gte = `${start}T00:00:00.000Z`;
    }

    if (hasEnd) {
      where.purchaseDate.lte = `${end}T23:59:59.999Z`;
    }
  }

  return where;
}

function buildQueryString(start?: string, end?: string) {
  const params = new URLSearchParams();

  if (isValidDate(start)) params.set("start", start as string);
  if (isValidDate(end)) params.set("end", end as string);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function TravelPurchasesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const start = params?.start ?? "";
  const end = params?.end ?? "";

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
              defaultValue={isValidDate(start) ? start : ""}
              className="rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">End date</label>
            <input
              type="date"
              name="end"
              defaultValue={isValidDate(end) ? end : ""}
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
            Show All
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