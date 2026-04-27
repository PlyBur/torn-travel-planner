import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/current-user";

type PageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

type TradeItem = {
  itemId: string;
  itemName: string | null;
  quantity: number;
};

type TradeGroup = {
  groupKey: string;
  lastDate: string;
  traderName: string | null;
  traderId: string | null;
  tradeName: string | null;
  status: string;
  moneyReceived: number;
  itemsSent: TradeItem[];
};

type ItemPerformance = {
  itemId: string;
  itemName: string;
  boughtQty: number;
  boughtCost: number;
  soldQty: number;
  soldIncome: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  estimatedProfit: number;
  roiPercent: number;
};

function money(value?: number | null) {
  return `$${Number(value ?? 0).toLocaleString("en-US")}`;
}

function percent(value?: number | null) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function cleanDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function buildDayWhere(userId: string, field: string, selectedDate: string) {
  return {
    userId,
    [field]: {
      gte: `${selectedDate}T00:00:00.000Z`,
      lte: `${selectedDate}T23:59:59.999Z`,
    },
  };
}

async function getItemNameMap(apiKey?: string | null) {
  if (!apiKey) return new Map<string, string>();

  try {
    const response = await fetch(
      `https://api.torn.com/torn/?selections=items&key=${apiKey}`,
      { cache: "no-store" }
    );

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

function addItem(items: TradeItem[], item: TradeItem) {
  const existing = items.find(
    (current) =>
      current.itemId === item.itemId && current.itemName === item.itemName
  );

  if (existing) {
    existing.quantity += item.quantity;
    return;
  }

  items.push(item);
}

function extractItems(rawData: any, itemNameMap: Map<string, string>) {
  const data = rawData ?? {};
  const found: TradeItem[] = [];

  function normaliseItem(item: any) {
    if (!item) return;

    if (typeof item === "string" || typeof item === "number") {
      const itemId = String(item);

      addItem(found, {
        itemId,
        itemName: itemNameMap.get(itemId) ?? null,
        quantity: 1,
      });

      return;
    }

    const itemId =
      item.item ??
      item.item_id ??
      item.id ??
      item.itemId ??
      item.uid ??
      item.type ??
      null;

    if (itemId === null || itemId === undefined) return;

    const cleanItemId = String(itemId);
    const quantity = Number(item.quantity ?? item.qty ?? item.amount ?? 1);

    addItem(found, {
      itemId: cleanItemId,
      itemName:
        item.name ??
        item.item_name ??
        item.itemName ??
        item.title ??
        itemNameMap.get(cleanItemId) ??
        null,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    });
  }

  const collections = [
    data.items,
    data.item,
    data.items_outgoing,
    data.items_incoming,
    data.trade_items,
    data.inventory,
  ];

  for (const collection of collections) {
    if (Array.isArray(collection)) {
      collection.forEach(normaliseItem);
    } else if (collection && typeof collection === "object") {
      Object.values(collection).forEach(normaliseItem);
    }
  }

  const directItem = data.item_id ?? data.itemId ?? data.itemid ?? null;

  if (directItem !== null && directItem !== undefined) {
    const itemId = String(directItem);

    addItem(found, {
      itemId,
      itemName: data.item_name ?? data.name ?? itemNameMap.get(itemId) ?? null,
      quantity: Number(data.quantity ?? data.qty ?? 1),
    });
  }

  return found;
}

function getTradeKey(activity: any) {
  const raw = activity.rawData ?? {};

  const possible =
    raw.trade_id ??
    raw.trade ??
    raw.tradeId ??
    raw.tradeID ??
    raw.trade_key ??
    activity.tradeId ??
    null;

  if (possible) {
    const text = String(possible);

    if (!text.startsWith(`${activity.logType}-`)) {
      return text;
    }
  }

  const day = activity.activityDate?.slice(0, 10) ?? "unknown-day";
  const trader =
    activity.traderId ??
    activity.traderName ??
    raw.user ??
    raw.user_id ??
    raw.target ??
    raw.target_id ??
    "unknown-trader";

  return `${day}-${trader}`;
}

function getTradeName(activity: any) {
  const raw = activity.rawData ?? {};

  const possible =
    raw.trade_name ??
    raw.tradeName ??
    raw.name ??
    raw.title ??
    raw.description ??
    raw.message ??
    activity.description ??
    null;

  if (!possible) return null;

  const text = String(possible);

  if (
    [
      "Trade completed",
      "Trade accepted",
      "Trade money incoming",
      "Trade items outgoing",
      "Trade items incoming",
      "Trade initiate outgoing",
    ].includes(text)
  ) {
    return null;
  }

  return text;
}

function groupTrades(activities: any[], itemNameMap: Map<string, string>) {
  const groups = new Map<string, TradeGroup>();

  for (const activity of activities) {
    const key = getTradeKey(activity);

    if (!groups.has(key)) {
      groups.set(key, {
        groupKey: key,
        lastDate: activity.activityDate,
        traderName: activity.traderName ?? null,
        traderId: activity.traderId ?? null,
        tradeName: getTradeName(activity),
        status: activity.tradeStatus ?? "UNKNOWN",
        moneyReceived: 0,
        itemsSent: [],
      });
    }

    const group = groups.get(key)!;

    if (activity.activityDate > group.lastDate) {
      group.lastDate = activity.activityDate;
    }

    if (!group.traderName && activity.traderName) {
      group.traderName = activity.traderName;
    }

    if (!group.traderId && activity.traderId) {
      group.traderId = activity.traderId;
    }

    if (!group.tradeName && getTradeName(activity)) {
      group.tradeName = getTradeName(activity);
    }

    if (activity.tradeStatus === "COMPLETED") {
      group.status = "COMPLETED";
    } else if (
      activity.tradeStatus === "ACCEPTED" &&
      group.status !== "COMPLETED"
    ) {
      group.status = "ACCEPTED";
    } else if (
      activity.tradeStatus === "MONEY_INCOMING" &&
      !["COMPLETED", "ACCEPTED"].includes(group.status)
    ) {
      group.status = "PAID";
    }

    if (activity.tradeStatus === "MONEY_INCOMING" && activity.amount) {
      group.moneyReceived += Number(activity.amount ?? 0);
    }

    if (activity.tradeStatus === "ITEMS_OUTGOING") {
      const items = extractItems(activity.rawData, itemNameMap);
      for (const item of items) addItem(group.itemsSent, item);
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    b.lastDate.localeCompare(a.lastDate)
  );
}

function renderItems(items: TradeItem[]) {
  if (items.length === 0) return "-";

  return items
    .map((item) => {
      const name = item.itemName ?? `Item ${item.itemId}`;
      return `${item.quantity.toLocaleString("en-US")} × ${name}`;
    })
    .join(", ");
}

function buildItemPerformance(
  purchases: any[],
  groupedTrades: TradeGroup[],
  itemNameMap: Map<string, string>
) {
  const performance = new Map<string, ItemPerformance>();

  function ensureItem(itemId: string) {
    if (!performance.has(itemId)) {
      performance.set(itemId, {
        itemId,
        itemName: itemNameMap.get(itemId) ?? `Item ${itemId}`,
        boughtQty: 0,
        boughtCost: 0,
        soldQty: 0,
        soldIncome: 0,
        avgBuyPrice: 0,
        avgSellPrice: 0,
        estimatedProfit: 0,
        roiPercent: 0,
      });
    }

    return performance.get(itemId)!;
  }

  for (const purchase of purchases) {
    const itemId = String(purchase.itemId);
    const item = ensureItem(itemId);

    item.boughtQty += Number(purchase.quantity ?? 0);
    item.boughtCost += Number(purchase.totalCost ?? 0);
  }

  for (const trade of groupedTrades) {
    const totalItemsInTrade = trade.itemsSent.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0),
      0
    );

    if (totalItemsInTrade <= 0 || trade.moneyReceived <= 0) continue;

    for (const soldItem of trade.itemsSent) {
      const item = ensureItem(String(soldItem.itemId));
      const itemQty = Number(soldItem.quantity ?? 0);
      const incomeShare = Math.round(
        (itemQty / totalItemsInTrade) * trade.moneyReceived
      );

      item.soldQty += itemQty;
      item.soldIncome += incomeShare;
    }
  }

  for (const item of performance.values()) {
    item.avgBuyPrice =
      item.boughtQty > 0 ? Math.round(item.boughtCost / item.boughtQty) : 0;

    item.avgSellPrice =
      item.soldQty > 0 ? Math.round(item.soldIncome / item.soldQty) : 0;

    const estimatedSoldCost = item.avgBuyPrice * item.soldQty;

    item.estimatedProfit = item.soldIncome - estimatedSoldCost;

    item.roiPercent =
      estimatedSoldCost > 0
        ? (item.estimatedProfit / estimatedSoldCost) * 100
        : 0;
  }

  return Array.from(performance.values()).sort(
    (a, b) => b.estimatedProfit - a.estimatedProfit
  );
}

export default async function DailyActivityPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedDate = params?.date ?? todayString();

  const user = await getCurrentAppUser();

  if (!user?.apiKey) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        <h1 className="text-3xl font-bold">Daily Activity</h1>
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

  const [itemNameMap, purchases, tradeActivities, tradeIncomes] =
    await Promise.all([
      getItemNameMap(user.apiKey),

      prisma.travelPurchase.findMany({
        where: buildDayWhere(user.id, "purchaseDate", selectedDate),
        orderBy: {
          purchaseDate: "asc",
        },
      }),

      prisma.tradeActivity.findMany({
        where: buildDayWhere(user.id, "activityDate", selectedDate),
        orderBy: {
          activityDate: "asc",
        },
      }),

      prisma.tradeIncome.findMany({
        where: buildDayWhere(user.id, "incomeDate", selectedDate),
        orderBy: {
          incomeDate: "asc",
        },
      }),
    ]);

  const groupedTrades = groupTrades(tradeActivities, itemNameMap);
  const itemPerformance = buildItemPerformance(
    purchases,
    groupedTrades,
    itemNameMap
  );

  const travelSpend = purchases.reduce(
    (sum, purchase) => sum + Number(purchase.totalCost ?? 0),
    0
  );

  const travelItemsBought = purchases.reduce(
    (sum, purchase) => sum + Number(purchase.quantity ?? 0),
    0
  );

  const tradeMoneyReceived = tradeIncomes.reduce(
    (sum, income) => sum + Number(income.amount ?? 0),
    0
  );

  const tradeItemsSent = groupedTrades.reduce(
    (sum, trade) =>
      sum +
      trade.itemsSent.reduce(
        (itemSum, item) => itemSum + Number(item.quantity ?? 0),
        0
      ),
    0
  );

  const netCashFlow = tradeMoneyReceived - travelSpend;

  const bestTrade = [...groupedTrades].sort(
    (a, b) => b.moneyReceived - a.moneyReceived
  )[0];

  const estimatedCostOfSoldItems = itemPerformance.reduce(
    (sum, item) => sum + item.avgBuyPrice * item.soldQty,
    0
  );

  const estimatedTradingProfit = tradeMoneyReceived - estimatedCostOfSoldItems;

  const estimatedTradingRoi =
    estimatedCostOfSoldItems > 0
      ? (estimatedTradingProfit / estimatedCostOfSoldItems) * 100
      : 0;

  const bestItem = itemPerformance.find((item) => item.soldQty > 0);

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Daily Activity</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Travel buys, trade sales, cash flow, estimated profit and ROI for one day.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Showing data for: {user.playerName ?? "Current player"}
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Dashboard
          </Link>
          <Link
            href="/travel-purchases"
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Travel
          </Link>
          <Link
            href="/trades"
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Trades
          </Link>
        </div>
      </div>

      <form
        method="GET"
        action="/daily-activity"
        className="mb-8 rounded-xl bg-zinc-900 p-5"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Activity date
            </label>
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-600"
          >
            View Day
          </button>

          <Link
            href="/daily-activity"
            className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800"
          >
            Today
          </Link>
        </div>
      </form>

      <div className="mb-8 grid gap-6 md:grid-cols-5">
        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Travel Spend</p>
          <p className="mt-2 text-2xl font-bold text-red-400">
            -{money(travelSpend)}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Trade Money Received</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">
            {money(tradeMoneyReceived)}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Net Cash Flow</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {money(netCashFlow)}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Est. Trading Profit</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              estimatedTradingProfit >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {money(estimatedTradingProfit)}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Est. ROI</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              estimatedTradingRoi >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {percent(estimatedTradingRoi)}
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-4">
        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Items Bought</p>
          <p className="mt-2 text-2xl font-bold">
            {travelItemsBought.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Items Sold / Sent</p>
          <p className="mt-2 text-2xl font-bold">
            {tradeItemsSent.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Best Trade</p>
          <p className="mt-2 text-lg font-bold">
            {bestTrade
              ? `${bestTrade.traderName ?? bestTrade.traderId ?? "Unknown"} — ${money(
                  bestTrade.moneyReceived
                )}`
              : "-"}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Best Item</p>
          <p className="mt-2 text-lg font-bold">
            {bestItem
              ? `${bestItem.itemName} — ${money(bestItem.estimatedProfit)}`
              : "-"}
          </p>
        </div>
      </div>

      <div className="mb-8 overflow-hidden rounded-xl bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="text-xl font-semibold">Item Performance</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Estimated profit uses that day&apos;s average buy price against sold quantity.
          </p>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="p-3 text-left">Item</th>
              <th className="p-3 text-left">Bought Qty</th>
              <th className="p-3 text-left">Avg Buy</th>
              <th className="p-3 text-left">Sold Qty</th>
              <th className="p-3 text-left">Avg Sell</th>
              <th className="p-3 text-left">Est. Profit</th>
              <th className="p-3 text-left">ROI</th>
            </tr>
          </thead>

          <tbody>
            {itemPerformance.map((item) => (
              <tr key={item.itemId} className="border-t border-zinc-800">
                <td className="p-3">{item.itemName}</td>
                <td className="p-3">{item.boughtQty.toLocaleString("en-US")}</td>
                <td className="p-3">
                  {item.avgBuyPrice ? money(item.avgBuyPrice) : "-"}
                </td>
                <td className="p-3">{item.soldQty.toLocaleString("en-US")}</td>
                <td className="p-3">
                  {item.avgSellPrice ? money(item.avgSellPrice) : "-"}
                </td>
                <td
                  className={`p-3 ${
                    item.estimatedProfit >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {money(item.estimatedProfit)}
                </td>
                <td
                  className={`p-3 ${
                    item.roiPercent >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {percent(item.roiPercent)}
                </td>
              </tr>
            ))}

            {itemPerformance.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-400">
                  No item performance data for this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-8 overflow-hidden rounded-xl bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="text-xl font-semibold">Travel Purchases</h2>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="p-3 text-left">Time</th>
              <th className="p-3 text-left">Country</th>
              <th className="p-3 text-left">Bought</th>
              <th className="p-3 text-left">Qty</th>
              <th className="p-3 text-left">Unit Cost</th>
              <th className="p-3 text-left">Total Cost</th>
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
                  <td className="p-3">{cleanDateTime(purchase.purchaseDate)}</td>
                  <td className="p-3">{purchase.country ?? "-"}</td>
                  <td className="p-3">{itemName}</td>
                  <td className="p-3">{purchase.quantity}</td>
                  <td className="p-3">{money(purchase.unitPrice)}</td>
                  <td className="p-3 text-red-400">
                    -{money(purchase.totalCost)}
                  </td>
                </tr>
              );
            })}

            {purchases.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-400">
                  No travel purchases for this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="text-xl font-semibold">Trades</h2>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="p-3 text-left">Time</th>
              <th className="p-3 text-left">Trader</th>
              <th className="p-3 text-left">Trade</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Items Sold / Sent</th>
              <th className="p-3 text-left">Money Received</th>
              <th className="p-3 text-left">Avg / Item</th>
            </tr>
          </thead>

          <tbody>
            {groupedTrades.map((trade) => {
              const totalItems = trade.itemsSent.reduce(
                (sum, item) => sum + item.quantity,
                0
              );

              const avg =
                totalItems > 0 && trade.moneyReceived > 0
                  ? Math.round(trade.moneyReceived / totalItems)
                  : null;

              return (
                <tr
                  key={trade.groupKey}
                  className="border-t border-zinc-800 align-top"
                >
                  <td className="p-3">{cleanDateTime(trade.lastDate)}</td>
                  <td className="p-3">
                    {trade.traderName ??
                      (trade.traderId ? `Trader ${trade.traderId}` : "-")}
                  </td>
                  <td className="p-3">{trade.tradeName ?? trade.groupKey}</td>
                  <td className="p-3">{trade.status}</td>
                  <td className="max-w-md p-3 text-zinc-300">
                    {renderItems(trade.itemsSent)}
                  </td>
                  <td className="p-3 text-emerald-400">
                    {trade.moneyReceived > 0 ? money(trade.moneyReceived) : "-"}
                  </td>
                  <td className="p-3">{avg ? money(avg) : "-"}</td>
                </tr>
              );
            })}

            {groupedTrades.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-400">
                  No trades for this day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}