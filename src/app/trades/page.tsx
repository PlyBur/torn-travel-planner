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

type TradeItem = {
  itemId: string;
  itemName: string | null;
  quantity: number;
};

type TradeGroup = {
  groupKey: string;
  tradeId: string | null;
  firstDate: string;
  lastDate: string;
  traderName: string | null;
  traderId: string | null;
  tradeName: string | null;
  description: string | null;
  statuses: string[];
  moneyReceived: number;
  itemsOutgoing: TradeItem[];
  events: any[];
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

function buildActivityDateWhere(userId: string, start?: string, end?: string) {
  const where: any = { userId };

  const hasStart = isValidDate(start);
  const hasEnd = isValidDate(end);

  if (hasStart || hasEnd) {
    where.activityDate = {};

    if (hasStart) where.activityDate.gte = `${start}T00:00:00.000Z`;
    if (hasEnd) where.activityDate.lte = `${end}T23:59:59.999Z`;
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

function extractItemsFromRawData(rawData: any, itemNameMap: Map<string, string>) {
  const data = rawData ?? {};
  const found: TradeItem[] = [];

  function normaliseItem(item: any) {
    if (item === null || item === undefined) return;

    if (typeof item === "number" || typeof item === "string") {
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

    const itemName =
      item.name ?? item.item_name ?? item.itemName ?? item.title ?? null;

    const quantity = Number(item.quantity ?? item.qty ?? item.amount ?? 1);

    addItem(found, {
      itemId: cleanItemId,
      itemName: resolveItemName(cleanItemId, itemName, itemNameMap),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    });
  }

  const possibleCollections = [
    data.items,
    data.item,
    data.items_outgoing,
    data.trade_items,
    data.inventory,
  ];

  for (const collection of possibleCollections) {
    if (Array.isArray(collection)) {
      for (const item of collection) normaliseItem(item);
    } else if (
      collection !== null &&
      collection !== undefined &&
      typeof collection === "object"
    ) {
      for (const item of Object.values(collection)) normaliseItem(item);
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

function extractTradeName(activity: any) {
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
    text === "Trade completed" ||
    text === "Trade accepted" ||
    text === "Trade money incoming" ||
    text === "Trade items outgoing" ||
    text === "Trade items incoming" ||
    text === "Trade initiate outgoing"
  ) {
    return null;
  }

  return text;
}

function getTrueTradeId(activity: any) {
  const raw = activity.rawData ?? {};

  const possible =
    raw.trade_id ??
    raw.trade ??
    raw.tradeId ??
    raw.tradeID ??
    raw.trade_key ??
    activity.tradeId ??
    null;

  if (!possible) return null;

  const text = String(possible);

  if (text === activity.sourceLogKey) return null;
  if (text.startsWith(`${activity.logType}-`)) return null;

  return text;
}

function getFallbackGroupKey(activity: any) {
  const date = cleanDate(activity.activityDate);
  const trader =
    activity.traderId ??
    activity.traderName ??
    activity.rawData?.user ??
    activity.rawData?.user_id ??
    activity.rawData?.target ??
    activity.rawData?.target_id ??
    "unknown-trader";

  return `${date}-${trader}`;
}

function groupTrades(activities: any[], itemNameMap: Map<string, string>) {
  const groups = new Map<string, TradeGroup>();

  for (const activity of activities) {
    const trueTradeId = getTrueTradeId(activity);
    const groupKey = trueTradeId ?? getFallbackGroupKey(activity);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        tradeId: trueTradeId,
        firstDate: activity.activityDate,
        lastDate: activity.activityDate,
        traderName: activity.traderName ?? null,
        traderId: activity.traderId ?? null,
        tradeName: extractTradeName(activity),
        description: activity.description ?? null,
        statuses: [],
        moneyReceived: 0,
        itemsOutgoing: [],
        events: [],
      });
    }

    const group = groups.get(groupKey)!;

    group.events.push(activity);

    if (activity.activityDate < group.firstDate) {
      group.firstDate = activity.activityDate;
    }

    if (activity.activityDate > group.lastDate) {
      group.lastDate = activity.activityDate;
    }

    if (!group.traderName && activity.traderName) {
      group.traderName = activity.traderName;
    }

    if (!group.traderId && activity.traderId) {
      group.traderId = activity.traderId;
    }

    const tradeName = extractTradeName(activity);

    if (!group.tradeName && tradeName) {
      group.tradeName = tradeName;
    }

    if (!group.description && activity.description) {
      group.description = activity.description;
    }

    if (!group.statuses.includes(activity.tradeStatus)) {
      group.statuses.push(activity.tradeStatus);
    }

    if (activity.tradeStatus === "MONEY_INCOMING" && activity.amount) {
      group.moneyReceived += Number(activity.amount ?? 0);
    }

    if (activity.tradeStatus === "ITEMS_OUTGOING") {
      const extractedItems = extractItemsFromRawData(
        activity.rawData,
        itemNameMap
      );

      for (const item of extractedItems) addItem(group.itemsOutgoing, item);
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    b.lastDate.localeCompare(a.lastDate)
  );
}

function statusLabel(group: TradeGroup) {
  if (group.statuses.includes("COMPLETED")) return "COMPLETED";
  if (group.statuses.includes("ACCEPTED")) return "ACCEPTED";
  if (group.statuses.includes("MONEY_INCOMING")) return "PAID";
  if (group.statuses.includes("INITIATED")) return "INITIATED";
  return group.statuses[0] ?? "UNKNOWN";
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

function getTotalItemsSent(trade: TradeGroup) {
  return trade.itemsOutgoing.reduce(
    (sum, item) => sum + Number(item.quantity ?? 0),
    0
  );
}

function getAveragePricePerItem(trade: TradeGroup) {
  const totalItems = getTotalItemsSent(trade);

  if (!totalItems || trade.moneyReceived <= 0) return null;

  return Math.round(trade.moneyReceived / totalItems);
}

function getCompletedTradesPerTrader(
  groupedTrades: TradeGroup[],
  playerNameMap: Map<string, string>
) {
  const counts = new Map<string, number>();

  for (const trade of groupedTrades) {
    const status = statusLabel(trade);

    if (!["COMPLETED", "ACCEPTED", "PAID"].includes(status)) continue;

    const traderKey =
      trade.traderId ??
      trade.traderName ??
      resolvePlayerName(trade.traderId, trade.traderName, playerNameMap);

    counts.set(traderKey, (counts.get(traderKey) ?? 0) + 1);
  }

  return counts;
}

export default async function TradesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const start = params?.start ?? "";
  const end = params?.end ?? "";

  const user = await getCurrentAppUser();

  if (!user?.apiKey) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        <h1 className="text-3xl font-bold">Trades</h1>
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

  const [activities, itemNameMap] = await Promise.all([
    prisma.tradeActivity.findMany({
      where: buildActivityDateWhere(user.id, start, end),
      orderBy: {
        activityDate: "desc",
      },
    }),
    getItemNameMap(user.apiKey),
  ]);

  const groupedTrades = groupTrades(activities, itemNameMap);

  const traderIds = groupedTrades
    .map((trade) => trade.traderId)
    .filter(Boolean) as string[];

  const playerNameMap = await getPlayerNameMap(user.apiKey, traderIds);

  const completedPerTrader = getCompletedTradesPerTrader(
    groupedTrades,
    playerNameMap
  );

  const totalMoneyReceived = groupedTrades.reduce(
    (sum, trade) => sum + trade.moneyReceived,
    0
  );

  const completedCount = groupedTrades.filter((trade) =>
    ["COMPLETED", "ACCEPTED", "PAID"].includes(statusLabel(trade))
  ).length;

  const initiatedCount = groupedTrades.filter(
    (trade) => statusLabel(trade) === "INITIATED"
  ).length;

  const queryString = buildQueryString(start, end);

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Trades</h1>
          <p className="mt-2 text-sm text-zinc-400">
            One row per trade, showing trader, trade name, items and money received.
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
            href={`/travel-purchases${queryString}`}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
          >
            Travel Purchases
          </Link>
        </div>
      </div>

      <form
        method="GET"
        action="/trades"
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
            href="/trades"
            className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800"
          >
            Show All
          </Link>
        </div>
      </form>

      <div className="mb-8 grid gap-6 md:grid-cols-4">
        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Grouped Trades</p>
          <p className="mt-2 text-2xl font-bold">
            {groupedTrades.length.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Initiated</p>
          <p className="mt-2 text-2xl font-bold">
            {initiatedCount.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Completed / Paid</p>
          <p className="mt-2 text-2xl font-bold">
            {completedCount.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-xl bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Money Received</p>
          <p className="mt-2 text-2xl font-bold">
            {money(totalMoneyReceived)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800 text-zinc-400">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Trader</th>
              <th className="p-3 text-left">Completed With Trader</th>
              <th className="p-3 text-left">Trade Name</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Items Sent</th>
              <th className="p-3 text-left">Money Received</th>
              <th className="p-3 text-left">Avg Price / Item</th>
            </tr>
          </thead>

          <tbody>
            {groupedTrades.map((trade) => {
              const traderDisplayName = resolvePlayerName(
                trade.traderId,
                trade.traderName,
                playerNameMap
              );

              const traderKey =
                trade.traderId ?? trade.traderName ?? traderDisplayName;

              const averagePricePerItem = getAveragePricePerItem(trade);

              return (
                <tr
                  key={trade.groupKey}
                  className="border-t border-zinc-800 align-top"
                >
                  <td className="p-3">{cleanDate(trade.lastDate)}</td>

                  <td className="p-3">{traderDisplayName}</td>

                  <td className="p-3">
                    {(completedPerTrader.get(traderKey) ?? 0).toLocaleString(
                      "en-US"
                    )}
                  </td>

                  <td className="p-3">
                    {trade.tradeName ?? trade.description ?? trade.tradeId ?? "-"}
                  </td>

                  <td className="p-3">{statusLabel(trade)}</td>

                  <td className="max-w-sm p-3 text-zinc-300">
                    {renderItems(trade.itemsOutgoing)}
                  </td>

                  <td className="p-3 text-emerald-400">
                    {trade.moneyReceived > 0 ? money(trade.moneyReceived) : "-"}
                  </td>

                  <td className="p-3">
                    {averagePricePerItem !== null
                      ? money(averagePricePerItem)
                      : "-"}
                  </td>
                </tr>
              );
            })}

            {groupedTrades.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-zinc-400">
                  No grouped trades found for this player/date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}