import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/current-user";
import {
  getItemNameMap,
  getPlayerNameMap,
  resolveItemName,
  resolvePlayerName,
} from "@/lib/torn-lookups";

type PageProps = {
  searchParams?: Promise<{
    start?: string;
    end?: string;
  }>;
};

type QuickRange = "day" | "week" | "month";

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
  status: string;
  moneyReceived: number;
  itemsSent: TradeItem[];
};

type ItemInsight = {
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

type TraderInsight = {
  traderKey: string;
  traderName: string;
  traderId: string | null;
  tradeCount: number;
  moneyReceived: number;
  itemsSent: number;
  avgTradeValue: number;
  avgItemValue: number;
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

function buildDateWhere(userId: string, field: string, start: string, end: string) {
  return {
    userId,
    [field]: {
      gte: `${start}T00:00:00.000Z`,
      lte: `${end}T23:59:59.999Z`,
    },
  };
}

function quickRangeHref(range: QuickRange) {
  const dates = getRangeDates(range);
  return `/trade-intelligence${buildQueryString(dates.start, dates.end)}`;
}

function isActiveRange(start: string, end: string, range: QuickRange) {
  const dates = getRangeDates(range);
  return start === dates.start && end === dates.end;
}

function cleanDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
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
        itemName: resolveItemName(itemId, null, itemNameMap),
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

    const itemName =
      item.name ?? item.item_name ?? item.itemName ?? item.title ?? null;

    addItem(found, {
      itemId: cleanItemId,
      itemName: resolveItemName(cleanItemId, itemName, itemNameMap),
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
      itemName: resolveItemName(
        itemId,
        data.item_name ?? data.name ?? null,
        itemNameMap
      ),
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

function buildItemInsights(
  purchases: any[],
  groupedTrades: TradeGroup[],
  itemNameMap: Map<string, string>
) {
  const insights = new Map<string, ItemInsight>();

  function ensureItem(itemId: string) {
    if (!insights.has(itemId)) {
      insights.set(itemId, {
        itemId,
        itemName: resolveItemName(itemId, null, itemNameMap),
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

    return insights.get(itemId)!;
  }

  for (const purchase of purchases) {
    const itemId = String(purchase.itemId);
    const item = ensureItem(itemId);

    item.itemName = resolveItemName(itemId, purchase.itemName, itemNameMap);
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
      const itemId = String(soldItem.itemId);
      const item = ensureItem(itemId);
      const itemQty = Number(soldItem.quantity ?? 0);
      const incomeShare = Math.round(
        (itemQty / totalItemsInTrade) * trade.moneyReceived
      );

      item.itemName = resolveItemName(
        soldItem.itemId,
        soldItem.itemName,
        itemNameMap
      );

      item.soldQty += itemQty;
      item.soldIncome += incomeShare;
    }
  }

  for (const item of insights.values()) {
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

  return Array.from(insights.values()).sort(
    (a, b) => b.estimatedProfit - a.estimatedProfit
  );
}

function buildTraderInsights(
  groupedTrades: TradeGroup[],
  playerNameMap: Map<string, string>
) {
  const insights = new Map<string, TraderInsight>();

  function ensureTrader(trade: TradeGroup) {
    const traderName = resolvePlayerName(
      trade.traderId,
      trade.traderName,
      playerNameMap
    );

    const traderKey = trade.traderId ?? trade.traderName ?? traderName;

    if (!insights.has(traderKey)) {
      insights.set(traderKey, {
        traderKey,
        traderName,
        traderId: trade.traderId,
        tradeCount: 0,
        moneyReceived: 0,
        itemsSent: 0,
        avgTradeValue: 0,
        avgItemValue: 0,
      });
    }

    return insights.get(traderKey)!;
  }

  for (const trade of groupedTrades) {
    const trader = ensureTrader(trade);

    const itemCount = trade.itemsSent.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0),
      0
    );

    trader.tradeCount += 1;
    trader.moneyReceived += trade.moneyReceived;
    trader.itemsSent += itemCount;
  }

  for (const trader of insights.values()) {
    trader.avgTradeValue =
      trader.tradeCount > 0
        ? Math.round(trader.moneyReceived / trader.tradeCount)
        : 0;

    trader.avgItemValue =
      trader.itemsSent > 0
        ? Math.round(trader.moneyReceived / trader.itemsSent)
        : 0;
  }

  return Array.from(insights.values()).sort(
    (a, b) => b.moneyReceived - a.moneyReceived
  );
}

export default async function TradeIntelligencePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { start, end } = getEffectiveDateRange(params?.start, params?.end);

  const user = await getCurrentAppUser();

  if (!user?.apiKey) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        <h1 className="text-3xl font-bold">Trade Intelligence</h1>
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

  const [itemNameMap, purchases, tradeActivities] = await Promise.all([
    getItemNameMap(user.apiKey),

    prisma.travelPurchase.findMany({
      where: buildDateWhere(user.id, "purchaseDate", start, end),
      orderBy: {
        purchaseDate: "asc",
      },
    }),

    prisma.tradeActivity.findMany({
      where: buildDateWhere(user.id, "activityDate", start, end),
      orderBy: {
        activityDate: "asc",
      },
    }),
  ]);

  const groupedTrades = groupTrades(tradeActivities, itemNameMap);

  const traderIds = groupedTrades
    .map((trade) => trade.traderId)
    .filter(Boolean) as string[];

  const playerNameMap = await getPlayerNameMap(user.apiKey, traderIds);

  const itemInsights = buildItemInsights(purchases, groupedTrades, itemNameMap);
  const traderInsights = buildTraderInsights(groupedTrades, playerNameMap);

  const totalTradeIncome = groupedTrades.reduce(
    (sum, trade) => sum + trade.moneyReceived,
    0
  );

  const totalItemsSold = groupedTrades.reduce(
    (sum, trade) =>
      sum +
      trade.itemsSent.reduce(
        (itemSum, item) => itemSum + Number(item.quantity ?? 0),
        0
      ),
    0
  );

  const estimatedCostOfSoldItems = itemInsights.reduce(
    (sum, item) => sum + item.avgBuyPrice * item.soldQty,
    0
  );

  const estimatedProfit = totalTradeIncome - estimatedCostOfSoldItems;

  const estimatedRoi =
    estimatedCostOfSoldItems > 0
      ? (estimatedProfit / estimatedCostOfSoldItems) * 100
      : 0;

  const bestItem = itemInsights.find((item) => item.soldQty > 0);
  const worstItem = [...itemInsights]
    .filter((item) => item.soldQty > 0)
    .sort((a, b) => a.estimatedProfit - b.estimatedProfit)[0];

  const bestTrader = traderInsights[0];

  const queryString = buildQueryString(start, end);

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Trade Intelligence</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Estimated trade profit, ROI, item performance and trader performance.
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
            href={`/travel-purchases${queryString}`}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Travel
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
            Default view is today. Use custom range for deeper analysis.
          </span>
        </div>

        <form
          method="GET"
          action="/trade-intelligence"
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

      <div className="mb-8 grid gap-6 md:grid-cols-4">
        <MetricCard title="Trade Income" value={money(totalTradeIncome)} />
        <MetricCard title="Items Sold / Sent" value={totalItemsSold.toLocaleString("en-US")} />
        <MetricCard title="Estimated Profit" value={money(estimatedProfit)} isPositive={estimatedProfit >= 0} />
        <MetricCard title="Estimated ROI" value={percent(estimatedRoi)} isPositive={estimatedRoi >= 0} />
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <SummaryCard
          title="Best Item"
          value={bestItem ? bestItem.itemName : "-"}
          sub={bestItem ? `${money(bestItem.estimatedProfit)} profit` : "No sold items"}
        />

        <SummaryCard
          title="Best Trader"
          value={bestTrader ? bestTrader.traderName : "-"}
          sub={bestTrader ? `${money(bestTrader.moneyReceived)} received` : "No trader data"}
        />

        <SummaryCard
          title="Lowest Margin Item"
          value={worstItem ? worstItem.itemName : "-"}
          sub={worstItem ? `${money(worstItem.estimatedProfit)} profit` : "No sold items"}
        />
      </div>

      <div className="mb-8 overflow-hidden rounded-xl bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="text-xl font-semibold">Item Profitability</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Estimated profit uses average buy price from travel purchases and allocates trade income by item quantity.
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
              <th className="p-3 text-left">Income</th>
              <th className="p-3 text-left">Est. Profit</th>
              <th className="p-3 text-left">ROI</th>
            </tr>
          </thead>

          <tbody>
            {itemInsights.map((item) => (
              <tr key={item.itemId} className="border-t border-zinc-800">
                <td className="p-3">{item.itemName}</td>
                <td className="p-3">{item.boughtQty.toLocaleString("en-US")}</td>
                <td className="p-3">{item.avgBuyPrice ? money(item.avgBuyPrice) : "-"}</td>
                <td className="p-3">{item.soldQty.toLocaleString("en-US")}</td>
                <td className="p-3">{item.avgSellPrice ? money(item.avgSellPrice) : "-"}</td>
                <td className="p-3">{money(item.soldIncome)}</td>
                <td className={item.estimatedProfit >= 0 ? "p-3 text-emerald-400" : "p-3 text-red-400"}>
                  {money(item.estimatedProfit)}
                </td>
                <td className={item.roiPercent >= 0 ? "p-3 text-emerald-400" : "p-3 text-red-400"}>
                  {percent(item.roiPercent)}
                </td>
              </tr>
            ))}

            {itemInsights.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-zinc-400">
                  No item intelligence found for this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl bg-zinc-900">
        <div className="border-b border-zinc-800 p-5">
          <h2 className="text-xl font-semibold">Trader Performance</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Ranking of traders by money received in the selected date range.
          </p>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="p-3 text-left">Trader</th>
              <th className="p-3 text-left">Trades</th>
              <th className="p-3 text-left">Items Sent</th>
              <th className="p-3 text-left">Money Received</th>
              <th className="p-3 text-left">Avg Trade</th>
              <th className="p-3 text-left">Avg Item</th>
            </tr>
          </thead>

          <tbody>
            {traderInsights.map((trader) => (
              <tr key={trader.traderKey} className="border-t border-zinc-800">
                <td className="p-3">{trader.traderName}</td>
                <td className="p-3">{trader.tradeCount.toLocaleString("en-US")}</td>
                <td className="p-3">{trader.itemsSent.toLocaleString("en-US")}</td>
                <td className="p-3 text-emerald-400">{money(trader.moneyReceived)}</td>
                <td className="p-3">{money(trader.avgTradeValue)}</td>
                <td className="p-3">{money(trader.avgItemValue)}</td>
              </tr>
            ))}

            {traderInsights.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-400">
                  No trader intelligence found for this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  isPositive,
}: {
  title: string;
  value: string;
  isPositive?: boolean;
}) {
  return (
    <div className="rounded-xl bg-zinc-900 p-6">
      <p className="text-sm text-zinc-400">{title}</p>
      <p
        className={
          isPositive === undefined
            ? "mt-2 text-2xl font-bold"
            : isPositive
              ? "mt-2 text-2xl font-bold text-emerald-400"
              : "mt-2 text-2xl font-bold text-red-400"
        }
      >
        {value}
      </p>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-900 p-6">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{sub}</p>
    </div>
  );
}