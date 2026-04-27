import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/current-user";

type LogbookPageProps = {
  searchParams?: Promise<{
    start?: string;
    end?: string;
  }>;
};

type QuickRange = "day" | "week" | "month";

function money(value: number) {
  return `$${value.toLocaleString("en-US")}`;
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

function buildQueryString(start: string, end: string) {
  const params = new URLSearchParams();

  params.set("start", start);
  params.set("end", end);

  return `?${params.toString()}`;
}

function buildPurchaseWhere(userId: string, start: string, end: string) {
  return {
    userId,
    purchaseDate: {
      gte: `${start}T00:00:00.000Z`,
      lte: `${end}T23:59:59.999Z`,
    },
  };
}

function cleanDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function quickRangeHref(range: QuickRange) {
  const dates = getRangeDates(range);
  return `/logbook${buildQueryString(dates.start, dates.end)}`;
}

function isActiveRange(start: string, end: string, range: QuickRange) {
  const dates = getRangeDates(range);
  return start === dates.start && end === dates.end;
}

export default async function LogbookPage({ searchParams }: LogbookPageProps) {
  const params = await searchParams;

  const { start, end } = getEffectiveDateRange(params?.start, params?.end);

  const user = await getCurrentAppUser();

  if (!user?.apiKey) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        <h1 className="text-3xl font-bold">Travel Purchase Logbook</h1>
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

  const purchases = await prisma.travelPurchase.findMany({
    where: buildPurchaseWhere(user.id, start, end),
    orderBy: {
      purchaseDate: "desc",
    },
  });

  const totalItems = purchases.reduce(
    (sum, purchase) => sum + purchase.quantity,
    0
  );

  const totalPurchaseCost = purchases.reduce(
    (sum, purchase) => sum + purchase.totalCost,
    0
  );

  const queryString = buildQueryString(start, end);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-12 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">
              Travel Purchase Logbook
            </h1>
            <p className="mt-4 text-xl text-zinc-400">
              Edit prices per trip/purchase and calculate true travel cost.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Showing data for: {user.playerName ?? "Current player"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Range: {start} to {end}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Link
              href={`/${queryString}`}
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-white hover:bg-zinc-900"
            >
              Dashboard
            </Link>

            <Link
              href={`/daily-activity?date=${end}`}
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-white hover:bg-zinc-900"
            >
              Daily Activity
            </Link>

            <Link
              href={`/travel-purchases${queryString}`}
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-white hover:bg-zinc-900"
            >
              Travel
            </Link>

            <Link
              href={`/trades${queryString}`}
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-white hover:bg-zinc-900"
            >
              Trades
            </Link>
          </div>
        </div>

        <div className="mb-10 rounded-xl bg-zinc-900 p-6">
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
            action="/logbook"
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

        <div className="mb-10 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl bg-zinc-900 p-6">
            <p className="text-lg text-zinc-400">Purchases</p>
            <p className="mt-4 text-3xl font-bold">{purchases.length}</p>
          </div>

          <div className="rounded-xl bg-zinc-900 p-6">
            <p className="text-lg text-zinc-400">Total Items</p>
            <p className="mt-4 text-3xl font-bold">
              {totalItems.toLocaleString("en-US")}
            </p>
          </div>

          <div className="rounded-xl bg-zinc-900 p-6">
            <p className="text-lg text-zinc-400">Total Purchase Cost</p>
            <p className="mt-4 text-3xl font-bold">
              {money(totalPurchaseCost)}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-800 text-zinc-300">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Trip</th>
                <th className="p-4">Country</th>
                <th className="p-4">Item</th>
                <th className="p-4">Qty</th>
                <th className="p-4">Unit Price</th>
                <th className="p-4">Total Cost</th>
                <th className="p-4">Notes</th>
                <th className="p-4">Save</th>
              </tr>
            </thead>

            <tbody>
              {purchases.map((purchase) => {
                const formId = `purchase-form-${purchase.id}`;

                return (
                  <tr key={purchase.id} className="border-t border-zinc-800">
                    <td className="p-4 text-zinc-300">
                      {cleanDate(purchase.purchaseDate)}
                    </td>

                    <td className="p-4">
                      <input
                        form={formId}
                        name="tripLabel"
                        defaultValue={purchase.tripLabel ?? ""}
                        className="w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-white"
                        placeholder="Trip name"
                      />
                    </td>

                    <td className="p-4 text-zinc-300">
                      {purchase.country ?? "-"}
                    </td>

                    <td className="p-4 text-zinc-300">
                      {purchase.itemName ?? `Item ${purchase.itemId}`}
                    </td>

                    <td className="p-4 text-zinc-300">
                      {purchase.quantity.toLocaleString("en-US")}
                    </td>

                    <td className="p-4">
                      <input
                        form={formId}
                        type="number"
                        name="unitPrice"
                        defaultValue={purchase.unitPrice}
                        className="w-32 rounded-md border border-zinc-700 bg-black px-3 py-2 text-white"
                      />
                    </td>

                    <td className="p-4 font-semibold text-zinc-100">
                      {money(purchase.totalCost)}
                    </td>

                    <td className="p-4">
                      <input
                        form={formId}
                        name="notes"
                        defaultValue={purchase.notes ?? ""}
                        className="w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-white"
                        placeholder="Notes"
                      />
                    </td>

                    <td className="p-4">
                      <form
                        id={formId}
                        action="/logbook/update-price"
                        method="POST"
                      >
                        <input type="hidden" name="id" value={purchase.id} />
                        <input
                          type="hidden"
                          name="quantity"
                          value={purchase.quantity}
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}

              {purchases.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-zinc-400">
                    No travel purchases found for this player/date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}