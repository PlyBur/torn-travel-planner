import Link from "next/link";
import { prisma } from "@/lib/prisma";

type LogbookPageProps = {
  searchParams?: Promise<{
    start?: string;
    end?: string;
  }>;
};

function money(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

function cleanDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

export default async function LogbookPage({ searchParams }: LogbookPageProps) {
  const params = await searchParams;

  const start = params?.start ?? "";
  const end = params?.end ?? "";

  const where: any = {};

  if (start || end) {
    where.purchaseDate = {};

    if (start) {
      where.purchaseDate.gte = start;
    }

    if (end) {
      where.purchaseDate.lte = `${end}T23:59:59.999Z`;
    }
  }

  const purchases = await prisma.travelPurchase.findMany({
    where,
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
          </div>

          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-white hover:bg-zinc-900"
          >
            Back to dashboard
          </Link>
        </div>

        <form
          method="GET"
          action="/logbook"
          className="mb-10 rounded-xl bg-zinc-900 p-6"
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
              <label className="mb-2 block text-sm text-zinc-400">
                End date
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
              className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-500"
            >
              Apply
            </button>

            <Link
              href="/logbook"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-white hover:bg-zinc-800"
            >
              Clear
            </Link>
          </div>
        </form>

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
                    No travel purchases found.
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