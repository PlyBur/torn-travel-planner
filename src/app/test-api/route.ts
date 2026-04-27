import { NextResponse } from "next/server";
import { requireCurrentAppUser } from "@/lib/current-user";
import { serialize, syncUserLatest } from "@/lib/torn-sync";

export async function GET() {
  try {
    const user = await requireCurrentAppUser();

    const result = await syncUserLatest({
      userId: user.id,
      apiKey: user.apiKey!,
    });

    return NextResponse.json(
      serialize({
        ...result,
        player: {
          playerName: user.playerName,
          tornPlayerId: user.tornPlayerId,
        },
      })
    );
  } catch (error: any) {
    console.error("test-api error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}