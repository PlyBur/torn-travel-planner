import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

export async function GET() {
  const user = await prisma.appUser.findFirst();

  if (!user || !user.apiKey) {
    return Response.json({ error: "No API key found" });
  }

  const res = await fetch(
    `https://api.torn.com/user/?selections=log&key=${user.apiKey}`
  );

  const data = await res.json();

  if (data.error) {
    return Response.json(data);
  }

  const logs = data.log || {};
  const abroadExamples: any[] = [];

  for (const key in logs) {
    const entry = logs[key];
    const title = entry.title?.toLowerCase() || "";

    if (title.includes("item abroad buy")) {
      abroadExamples.push({
        key,
        title: entry.title,
        category: entry.category,
        timestamp: entry.timestamp,
        data: entry.data,
        fullEntry: entry,
      });
    }
  }

  return Response.json({
    found: abroadExamples.length,
    examples: abroadExamples.slice(0, 10),
  });
}