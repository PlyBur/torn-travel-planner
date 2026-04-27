import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/current-user";

async function getTornProfile(apiKey: string) {
  const url = `https://api.torn.com/user/?selections=basic&key=${apiKey}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to validate Torn API key.");
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(
      typeof data.error === "string" ? data.error : JSON.stringify(data.error)
    );
  }

  return {
    tornPlayerId: Number(data.player_id ?? data.user_id ?? data.id),
    playerName: String(data.name ?? "Unknown Player"),
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const submittedApiKey = String(formData.get("apiKey") ?? "").trim();

    const defaultBackfillDays = Number(formData.get("defaultBackfillDays") ?? 30);
    const defaultBackfillPages = Number(formData.get("defaultBackfillPages") ?? 25);
    const defaultDelayMs = Number(formData.get("defaultDelayMs") ?? 2500);

    const currentUser = await getCurrentAppUser();

    const apiKey = submittedApiKey || currentUser?.apiKey;

    if (!apiKey) {
      throw new Error("Please enter a Torn API key.");
    }

    const profile = await getTornProfile(apiKey);

    const user = await prisma.appUser.upsert({
      where: {
        tornPlayerId: profile.tornPlayerId,
      },
      update: {
        playerName: profile.playerName,
        apiKey,
        defaultBackfillDays,
        defaultBackfillPages,
        defaultDelayMs,
      },
      create: {
        tornPlayerId: profile.tornPlayerId,
        playerName: profile.playerName,
        apiKey,
        defaultBackfillDays,
        defaultBackfillPages,
        defaultDelayMs,
      },
    });

    await prisma.syncState.upsert({
      where: {
        userId: user.id,
      },
      update: {},
      create: {
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    });

    const response = NextResponse.redirect(new URL("/settings", request.url));

    response.cookies.set("torn_app_user_id", user.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error: any) {
    const url = new URL("/settings", request.url);
    url.searchParams.set("error", error?.message ?? "Failed to save settings.");

    return NextResponse.redirect(url);
  }
}