import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser, getOrCreateSyncState } from "@/lib/current-user";

function serialize(data: any): any {
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

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoString(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function getDefaultRange() {
  return {
    start: todayString(),
    end: todayString(),
  };
}

function buildDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) {
    return getDefaultRange();
  }

  return {
    start: start ?? todayString(),
    end: end ?? todayString(),
  };
}

function buildWhere(userId: string, field: string, start: string, end: string) {
  return {
    userId,
    [field]: {
      gte: `${start}T00:00:00.000Z`,
      lte: `${end}T23:59:59.999Z`,
    },
  };
}

async function getCurrentNetworth(apiKey: string) {
  const url = `https://api.torn.com/user/?selections=networth&key=${apiKey}`;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return 0;

  const data = await response.json();
  if (data.error) return 0;

  return Number(data.networth?.total ?? data.total ?? 0);
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentAppUser();

    if (!user?.apiKey) {
      return NextResponse.json({
        success: false,
        needsSettings: true,
        error: "No Torn API key configured.",
      });
    }

    const { searchParams } = new URL(request.url);

    const rawStart = searchParams.get("start");
    const rawEnd = searchParams.get("end");

    const { start, end } = buildDateRange(rawStart, rawEnd);

    const [purchases, tradeIncomes, tradeActivities] = await Promise.all([
      prisma.travelPurchase.findMany({
        where: buildWhere(user.id, "purchaseDate", start, end),
      }),
      prisma.tradeIncome.findMany({
        where: buildWhere(user.id, "incomeDate", start, end),
      }),
      prisma.tradeActivity.findMany({
        where: buildWhere(user.id, "activityDate", start, end),
      }),
    ]);

    let syncState = await getOrCreateSyncState(user.id);

    const currentNetworth = await getCurrentNetworth(user.apiKey);

    syncState = await prisma.syncState.update({
      where: { userId: user.id },
      data: {
        currentNetworth,
        lastNetworthAt: new Date(),
      },
    });

    const travelCost = purchases.reduce(
      (sum, p) => sum + Number(p.totalCost ?? 0),
      0
    );

    const tradeIncome = tradeIncomes.reduce(
      (sum, i) => sum + Number(i.amount ?? 0),
      0
    );

    const travelNet = tradeIncome - travelCost;

    return NextResponse.json(
      serialize({
        success: true,
        player: {
          id: user.id,
          playerName: user.playerName,
        },
        dateRange: { start, end },
        syncState,
        currentNetworth,
        financials: {
          travelCost,
          tradeIncome,
          travelNet,
        },
        counts: {
          travelPurchases: purchases.length,
          tradeIncomes: tradeIncomes.length,
          tradeActivities: tradeActivities.length,
        },
      })
    );
  } catch (error: any) {
    console.error("dashboard-data error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}