import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextResponse } from "next/server";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

export async function POST(request: Request) {
  const formData = await request.formData();

  const id = String(formData.get("id") || "");
  const unitPrice = Number(formData.get("unitPrice") || 0);
  const tripLabel = String(formData.get("tripLabel") || "");
  const country = String(formData.get("country") || "");
  const notes = String(formData.get("notes") || "");

  if (!id) {
    return NextResponse.json({ error: "Missing purchase ID" }, { status: 400 });
  }

  const purchase = await prisma.travelPurchase.findUnique({
    where: { id },
  });

  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  const totalCost = purchase.quantity * unitPrice;

  await prisma.travelPurchase.update({
    where: { id },
    data: {
      unitPrice,
      totalCost,
      tripLabel,
      country,
      notes,
    },
  });

  return NextResponse.redirect(new URL("/logbook", request.url));
}