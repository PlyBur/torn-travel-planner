import { prisma } from "@/lib/prisma";
import { getOrCreateSyncState } from "@/lib/current-user";

const LOG_TYPE_TRAVEL_PURCHASE = 4201;

const LOG_TYPE_TRADE_INITIATE_OUTGOING = 4400;
const LOG_TYPE_TRADE_COMPLETED = 4430;
const LOG_TYPE_TRADE_ACCEPTED = 4431;
const LOG_TYPE_TRADE_MONEY_INCOMING = 4441;
const LOG_TYPE_TRADE_ITEMS_OUTGOING = 4445;
const LOG_TYPE_TRADE_ITEMS_INCOMING = 4446;

const TARGET_LOG_TYPES = [
  LOG_TYPE_TRAVEL_PURCHASE,
  LOG_TYPE_TRADE_INITIATE_OUTGOING,
  LOG_TYPE_TRADE_COMPLETED,
  LOG_TYPE_TRADE_ACCEPTED,
  LOG_TYPE_TRADE_MONEY_INCOMING,
  LOG_TYPE_TRADE_ITEMS_OUTGOING,
  LOG_TYPE_TRADE_ITEMS_INCOMING,
];

type TornLog = {
  log?: number | string;
  timestamp?: number;
  title?: string;
  category?: string;
  data?: any;
};

type SyncUserOptions = {
  userId: string;
  apiKey: string;
};

export function serialize(data: any): any {
  if (typeof data === "bigint") return Number(data);
  if (data instanceof Date) return data.toISOString();
  if (Array.isArray(data)) return data.map(serialize);

  if (data && typeof data === "object") {
    const obj: any = {};
    for (const key in data) obj[key] = serialize(data[key]);
    return obj;
  }

  return data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getISODate(timestamp?: number) {
  if (!timestamp) return new Date().toISOString();
  return new Date(timestamp * 1000).toISOString();
}

function getSourceLogKey(key: string, logType: number) {
  return `${logType}-${key}`;
}

function getCountryFromArea(area: number | string | undefined) {
  const map: Record<string, string> = {
    "2": "Mexico",
    "3": "Cayman Islands",
    "4": "Canada",
    "5": "Hawaii",
    "6": "United Kingdom",
    "7": "Argentina",
    "8": "Switzerland",
    "9": "Japan",
    "10": "China",
    "11": "UAE",
    "12": "South Africa",
  };

  if (area === undefined || area === null) return null;
  return map[String(area)] ?? `Area ${area}`;
}

function getTradeStatus(logType: number) {
  if (logType === LOG_TYPE_TRADE_INITIATE_OUTGOING) return "INITIATED";
  if (logType === LOG_TYPE_TRADE_COMPLETED) return "COMPLETED";
  if (logType === LOG_TYPE_TRADE_ACCEPTED) return "ACCEPTED";
  if (logType === LOG_TYPE_TRADE_MONEY_INCOMING) return "MONEY_INCOMING";
  if (logType === LOG_TYPE_TRADE_ITEMS_OUTGOING) return "ITEMS_OUTGOING";
  if (logType === LOG_TYPE_TRADE_ITEMS_INCOMING) return "ITEMS_INCOMING";
  return "UNKNOWN";
}

function getTradeDirection(logType: number) {
  if (logType === LOG_TYPE_TRADE_INITIATE_OUTGOING) return "OUTGOING";
  if (logType === LOG_TYPE_TRADE_MONEY_INCOMING) return "INCOMING";
  if (logType === LOG_TYPE_TRADE_ITEMS_OUTGOING) return "OUTGOING";
  if (logType === LOG_TYPE_TRADE_ITEMS_INCOMING) return "INCOMING";
  return null;
}

function extractAmount(log: TornLog) {
  const data = log.data ?? {};

  const amount = Number(
    data.money ??
      data.cash ??
      data.amount ??
      data.value ??
      data.total ??
      data.cost_total ??
      0
  );

  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.trunc(amount);
}

function extractTraderId(log: TornLog) {
  const data = log.data ?? {};

  const possible =
    data.user ??
    data.user_id ??
    data.trader ??
    data.trader_id ??
    data.target ??
    data.target_id ??
    data.sender ??
    data.sender_id ??
    data.receiver ??
    data.receiver_id ??
    data.other_user_id ??
    data.player_id ??
    null;

  return possible === null || possible === undefined ? null : String(possible);
}

function extractTraderName(log: TornLog) {
  const data = log.data ?? {};

  const possible =
    data.user_name ??
    data.username ??
    data.trader_name ??
    data.name ??
    data.target_name ??
    data.sender_name ??
    data.receiver_name ??
    data.other_user_name ??
    data.player_name ??
    null;

  return possible === null || possible === undefined ? null : String(possible);
}

function extractTradeId(key: string, log: TornLog) {
  const data = log.data ?? {};

  const possible =
    data.trade ??
    data.trade_id ??
    data.tradeId ??
    data.tradeID ??
    data.id ??
    data.trade_key ??
    key ??
    null;

  return possible === null || possible === undefined ? null : String(possible);
}

function extractTradeDescription(log: TornLog) {
  const data = log.data ?? {};

  const possible =
    data.description ??
    data.trade_description ??
    data.trade_name ??
    data.name ??
    data.title ??
    data.message ??
    log.title ??
    null;

  return possible === null || possible === undefined ? null : String(possible);
}

async function fetchFilteredLogs(apiKey: string, logType: number, from: number) {
  const params = new URLSearchParams({
    selections: "log",
    key: apiKey,
    log: String(logType),
    from: String(from),
  });

  const url = `https://api.torn.com/user/?${params.toString()}`;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Torn API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.error?.code === 5) {
      await sleep(6500 * attempt);
      continue;
    }

    if (data.error) {
      throw new Error(JSON.stringify(data.error));
    }

    return data.log ?? {};
  }

  throw new Error(`Torn rate limit persisted for log type ${logType}`);
}

async function saveTravelPurchase(userId: string, key: string, log: TornLog) {
    const data = log.data ?? {};

    console.log("TRAVEL PURCHASE DEBUG", {
        key,
        timestamp: log.timestamp,
        title: log.title,
        category: log.category,
        data,
        area: data.area,
        travelArea: data.travel_area,
        country: data.country,
        location: data.location,
        mappedFromArea: getCountryFromArea(data.area),
    });

  const itemId = String(data.item ?? "");
  const quantity = Number(data.quantity ?? 0);
  const unitPrice = Number(data.cost_each ?? 0);
  const totalCost = Number(data.cost_total ?? 0);

  if (!itemId || quantity <= 0 || totalCost <= 0) return null;

  const sourceLogKey = getSourceLogKey(key, LOG_TYPE_TRAVEL_PURCHASE);

  return prisma.travelPurchase.upsert({
    where: { userId_sourceLogKey: { userId, sourceLogKey } },
    update: {
      purchaseDate: getISODate(log.timestamp),
      country: getCountryFromArea(data.area),
      itemId,
      quantity,
      unitPrice,
      totalCost,
    },
    create: {
      user: { connect: { id: userId } },
      purchaseDate: getISODate(log.timestamp),
      tripLabel: null,
      country: getCountryFromArea(data.area),
      itemId,
      itemName: null,
      quantity,
      unitPrice,
      totalCost,
      source: "API_LOG",
      sourceLogKey,
      notes: null,
    },
  });
}

async function saveTradeIncome(userId: string, key: string, log: TornLog) {
  const amount = extractAmount(log);
  if (!amount) return null;

  const sourceLogKey = getSourceLogKey(key, LOG_TYPE_TRADE_MONEY_INCOMING);

  return prisma.tradeIncome.upsert({
    where: { userId_sourceLogKey: { userId, sourceLogKey } },
    update: {
      incomeDate: getISODate(log.timestamp),
      amount,
      description: extractTradeDescription(log),
    },
    create: {
      user: { connect: { id: userId } },
      incomeDate: getISODate(log.timestamp),
      amount,
      source: "API_LOG",
      sourceLogKey,
      description: extractTradeDescription(log),
    },
  });
}

async function saveTradeActivity(
  userId: string,
  key: string,
  log: TornLog,
  logType: number
) {
  const sourceLogKey = getSourceLogKey(key, logType);
  const amount = extractAmount(log);

  return prisma.tradeActivity.upsert({
    where: { userId_sourceLogKey: { userId, sourceLogKey } },
    update: {
      activityDate: getISODate(log.timestamp),
      logType,
      tradeStatus: getTradeStatus(logType),
      direction: getTradeDirection(logType),
      description: extractTradeDescription(log),
      traderName: extractTraderName(log),
      traderId: extractTraderId(log),
      tradeId: extractTradeId(key, log),
      amount,
      rawData: log.data ?? {},
    },
    create: {
      user: { connect: { id: userId } },
      activityDate: getISODate(log.timestamp),
      logType,
      tradeStatus: getTradeStatus(logType),
      direction: getTradeDirection(logType),
      description: extractTradeDescription(log),
      traderName: extractTraderName(log),
      traderId: extractTraderId(log),
      tradeId: extractTradeId(key, log),
      amount,
      source: "API_LOG",
      sourceLogKey,
      rawData: log.data ?? {},
    },
  });
}

async function syncLogType(options: {
  apiKey: string;
  userId: string;
  logType: number;
  fromUnix: number;
  toUnix: number;
}) {
  const logs = await fetchFilteredLogs(
    options.apiKey,
    options.logType,
    options.fromUnix
  );

  const entries = Object.entries(logs) as [string, TornLog][];

  let scannedLogs = 0;
  let savedRecords = 0;

  for (const [key, log] of entries) {
    if (!log.timestamp) continue;
    if (log.timestamp < options.fromUnix) continue;
    if (log.timestamp > options.toUnix) continue;

    scannedLogs += 1;

    if (options.logType === LOG_TYPE_TRAVEL_PURCHASE) {
      const saved = await saveTravelPurchase(options.userId, key, log);
      if (saved) savedRecords += 1;
    } else {
      const activity = await saveTradeActivity(
        options.userId,
        key,
        log,
        options.logType
      );

      if (activity) savedRecords += 1;

      if (options.logType === LOG_TYPE_TRADE_MONEY_INCOMING) {
        await saveTradeIncome(options.userId, key, log);
      }
    }
  }

  return {
    logType: options.logType,
    scannedLogs,
    savedRecords,
  };
}

export async function syncUserLatest(options: SyncUserOptions) {
  const syncState = await getOrCreateSyncState(options.userId);

  const nowUnix = Math.floor(Date.now() / 1000);

  const lastUpdate =
    syncState.lastLatestUpdateAt ??
    syncState.lastBackfillAt ??
    syncState.backfillToDate ??
    new Date(Date.now() - 24 * 60 * 60 * 1000);

  const fromUnix = Math.floor(lastUpdate.getTime() / 1000) + 1;

  const results = [];

  for (const logType of TARGET_LOG_TYPES) {
    const result = await syncLogType({
      apiKey: options.apiKey,
      userId: options.userId,
      logType,
      fromUnix,
      toUnix: nowUnix,
    });

    results.push(result);
    await sleep(1200);
  }

  const totalScanned = results.reduce((sum, r) => sum + r.scannedLogs, 0);
  const totalSaved = results.reduce((sum, r) => sum + r.savedRecords, 0);

  await prisma.syncState.update({
    where: { userId: options.userId },
    data: {
      lastLatestUpdateAt: new Date(),
      latestScannedLogs: totalScanned,
    },
  });

  return {
    success: true,
    mode: "latest-sync",
    userId: options.userId,
    fromUnix,
    toUnix: nowUnix,
    scannedLogs: totalScanned,
    savedRecords: totalSaved,
    results,
  };
}