import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serialize, syncUserLatest } from "@/lib/torn-sync";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expected = process.env.CRON_SECRET;

    if (!expected || authHeader !== `Bearer ${expected}`) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const users = await prisma.appUser.findMany({
      where: {
        apiKey: {
          not: null,
        },
      },
      select: {
        id: true,
        playerName: true,
        tornPlayerId: true,
        apiKey: true,
      },
    });

    const results = [];

    for (const user of users) {
      if (!user.apiKey) continue;

      try {
        const result = await syncUserLatest({
          userId: user.id,
          apiKey: user.apiKey,
        });

        results.push({
          userId: user.id,
          playerName: user.playerName,
          tornPlayerId: user.tornPlayerId,
          success: true,
          scannedLogs: result.scannedLogs,
          savedRecords: result.savedRecords,
        });
      } catch (error: any) {
        results.push({
          userId: user.id,
          playerName: user.playerName,
          tornPlayerId: user.tornPlayerId,
          success: false,
          error: error?.message ?? "Unknown error",
        });
      }
    }

    return NextResponse.json(
      serialize({
        success: true,
        mode: "cron-sync-all-users",
        usersProcessed: users.length,
        results,
      })
    );
  } catch (error: any) {
    console.error("cron sync error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}