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

  const titles = new Set<string>();
  const categories = new Set<string>();

  const tradeExamples: any[] = [];

  for (const key in logs) {
    const entry = logs[key];

    if (entry.title) titles.add(entry.title);
    if (entry.category) categories.add(entry.category);

    const title = entry.title?.toLowerCase() || "";
    const category = entry.category?.toLowerCase() || "";

    // Capture anything that smells like a trade
    if (
      title.includes("trade") ||
      category.includes("trade")
    ) {
      tradeExamples.push({
        title: entry.title,
        category: entry.category,
        data: entry.data,
      });
    }
  }

  return Response.json({
    totalLogs: Object.keys(logs).length,
    uniqueTitles: Array.from(titles),
    uniqueCategories: Array.from(categories),
    tradeExamples,
  });
}