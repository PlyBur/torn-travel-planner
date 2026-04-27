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

function buildPurchaseDateWhere(
  userId: string,
  start?: string | null,
  end?: string | null
) {
  const where: any = { userId };

  if (start || end) {
    where.purchaseDate = {};
    if (start) where.purchaseDate.gte = `${start}T00:00:00.000Z`;
    if (end) where.purchaseDate.lte = `${end}T23:59:59.999Z`;
  }

  return where;
}

function buildIncomeDateWhere(
  userId: string,
  start?: string | null,
  end?: string | null
) {
  const where: any = { userId };

  if (start || end) {
    where.incomeDate = {};
    if (start) where.incomeDate.gte = `${start}T00:00:00.000Z`;
    if (end) where.incomeDate.lte = `${end}T23:59:59.999Z`;
  }

  return where;
}

function buildActivityDateWhere(
  userId: string,
  start?: string | null,
  end?: string | null
) {
  const where: any = { userId };

  if (start || end) {
    where.activityDate = {};
    if (start) where.activityDate.gte = `${start}T00:00:00.000Z`;
    if (end) where.activityDate.lte = `${end}T23:59:59.999Z`;
  }

  return where;
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
        error: "No Torn API key configured. Please complete Settings first.",
      });
    }

    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    const purchases = await prisma.travelPurchase.findMany({
      where: buildPurchaseDateWhere(user.id, start, end),
      orderBy: { purchaseDate: "desc" },
    });

    const tradeIncomes = await prisma.tradeIncome.findMany({
      where: buildIncomeDateWhere(user.id, start, end),
      orderBy: { incomeDate: "desc" },
    });

    const tradeActivities = await prisma.tradeActivity.findMany({
      where: buildActivityDateWhere(user.id, start, end),
      orderBy: { activityDate: "desc" },
    });

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
      (sum, purchase) => sum + Number(purchase.totalCost ?? 0),
      0
    );

    const tradeIncome = tradeIncomes.reduce(
      (sum, income) => sum + Number(income.amount ?? 0),
      0
    );

    const travelNet = tradeIncome - travelCost;

    return NextResponse.json(
      serialize({
        success: true,
        player: {
          id: user.id,
          playerName: user.playerName,
          tornPlayerId: user.tornPlayerId,
        },
        dateRange: { start, end },
        syncState,
        currentNetworth,
        purchases: purchases.slice(0, 10),
        tradeActivities: tradeActivities.slice(0, 10),
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