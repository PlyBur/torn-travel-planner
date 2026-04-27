export async function getItemNameMap(apiKey?: string | null) {
  const map = new Map<string, string>();

  if (!apiKey) return map;

  try {
    const response = await fetch(
      `https://api.torn.com/torn/?selections=items&key=${apiKey}`,
      { cache: "no-store" }
    );

    if (!response.ok) return map;

    const data = await response.json();

    if (data.error || !data.items) return map;

    for (const [id, item] of Object.entries<any>(data.items)) {
      map.set(String(id), item.name ?? `Item ${id}`);
    }

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

  for (const playerId of uniqueIds) {
    try {
      const response = await fetch(
        `https://api.torn.com/user/${playerId}?selections=basic&key=${apiKey}`,
        { cache: "no-store" }
      );

      if (!response.ok) continue;

      const data = await response.json();

      if (data.error) continue;

      if (data.name) {
        map.set(playerId, String(data.name));
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