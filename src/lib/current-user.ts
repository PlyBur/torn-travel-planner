import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getCurrentAppUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("torn_app_user_id")?.value;

  if (userId) {
    const user = await prisma.appUser.findUnique({
      where: { id: userId },
    });

    if (user?.apiKey) return user;
  }

  const firstUser = await prisma.appUser.findFirst({
    where: {
      apiKey: {
        not: null,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return firstUser;
}

export async function requireCurrentAppUser() {
  const user = await getCurrentAppUser();

  if (!user?.apiKey) {
    throw new Error("No Torn API key configured. Please complete Settings first.");
  }

  return user;
}

export async function getOrCreateSyncState(userId: string) {
  const existing = await prisma.syncState.findUnique({
    where: { userId },
  });

  if (existing) return existing;

  return prisma.syncState.create({
    data: {
      user: {
        connect: {
          id: userId,
        },
      },
    },
  });
}