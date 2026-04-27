type TornItem = {
  name?: string;
};

type TornItemsResponse = {
  items?: Record<string, TornItem>;
  error?: unknown;
};

type TornPlayerResponse = {
  name?: string;
  error?: unknown;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type TornLookupGlobalCache = {
  itemMaps: Map<string, CacheEntry<Map<string, string>>>;
  playerNames: Map<string, CacheEntry<string>>;
};

const ITEM_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PLAYER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const globalForTornLookups = globalThis as typeof globalThis & {
  __tornLookupCache?: TornLookupGlobalCache;
};

const cache =
  globalForTornLookups.__tornLookupCache ??
  (globalForTornLookups.__tornLookupCache = {
    itemMaps: new Map<string, CacheEntry<Map<string, string>>>(),
    playerNames: new Map<string, CacheEntry<string>>(),
  });

function now() {
  return Date.now();
}

function isFresh<T>(entry: CacheEntry<T> | undefined) {
  return Boolean(entry && entry.expiresAt > now());
}

function apiKeyCacheKey(apiKey: string) {
  return apiKey;
}

function playerCacheKey(apiKey: string, playerId: string) {
  return `${apiKey}:${playerId}`;
}

export async function getItemNameMap(apiKey?: string | null) {
  const map = new Map<string, string>();

  if (!apiKey) return map;

  const cacheKey = apiKeyCacheKey(apiKey);
  const cached = cache.itemMaps.get(cacheKey);

  if (isFresh(cached)) {
    return new Map(cached!.value);
  }

  try {
    const response = await fetch(
      `https://api.torn.com/torn/?selections=items&key=${apiKey}`,
      { cache: "no-store" }
    );

    if (!response.ok) return map;

    const data = (await response.json()) as TornItemsResponse;

    if (data.error || !data.items) return map;

    for (const [id, item] of Object.entries(data.items)) {
      map.set(String(id), item.name ?? `Item ${id}`);
    }

    cache.itemMaps.set(cacheKey, {
      value: new Map(map),
      expiresAt: now() + ITEM_CACHE_TTL_MS,
    });

    return map;
  } catch {
    return map;
  }
}

export async function getPlayerNameMap(
  apiKey: string | null | undefined,
  playerIds: Array<string | null | undefined>
) {
  const map = new Map<string, string>();

  if (!apiKey) return map;

  const uniqueIds = Array.from(
    new Set(
      playerIds
        .filter(Boolean)
        .map((id) => String(id))
        .filter((id) => id.trim().length > 0)
    )
  );

  const missingIds: string[] = [];

  for (const playerId of uniqueIds) {
    const cached = cache.playerNames.get(playerCacheKey(apiKey, playerId));

    if (isFresh(cached)) {
      map.set(playerId, cached!.value);
    } else {
      missingIds.push(playerId);
    }
  }

  for (const playerId of missingIds) {
    try {
      const response = await fetch(
        `https://api.torn.com/user/${playerId}?selections=basic&key=${apiKey}`,
        { cache: "no-store" }
      );

      if (!response.ok) continue;

      const data = (await response.json()) as TornPlayerResponse;

      if (data.error) continue;

      if (data.name) {
        const playerName = String(data.name);

        map.set(playerId, playerName);

        cache.playerNames.set(playerCacheKey(apiKey, playerId), {
          value: playerName,
          expiresAt: now() + PLAYER_CACHE_TTL_MS,
        });
      }
    } catch {
      continue;
    }
  }

  return map;
}

export function resolveItemName(
  itemId: string | number | null | undefined,
  storedName: string | null | undefined,
  itemNameMap: Map<string, string>
) {
  if (storedName) return storedName;

  if (itemId === null || itemId === undefined) return "Unknown Item";

  const key = String(itemId);

  return itemNameMap.get(key) ?? `Item ${key}`;
}

export function resolvePlayerName(
  playerId: string | number | null | undefined,
  storedName: string | null | undefined,
  playerNameMap: Map<string, string>
) {
  if (storedName) return storedName;

  if (playerId === null || playerId === undefined) return "Unknown Trader";

  const key = String(playerId);

  return playerNameMap.get(key) ?? `Trader ${key}`;
}