import { NextResponse } from "next/server";

const TORN_API_KEY = process.env.TORN_API_KEY!;

function searchObject(obj: any, terms: string[]) {
  const matches: any[] = [];

  function walk(value: any, path: string[] = []) {
    if (value === null || value === undefined) return;

    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).toLowerCase();

      if (terms.some((term) => text.includes(term.toLowerCase()))) {
        matches.push({
          path: path.join("."),
          value,
        });
      }

      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }

    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(child, [...path, key]);
      }
    }
  }

  walk(obj);

  return matches;
}

async function fetchTornSelection(selection: string) {
  const url = `https://api.torn.com/torn/?selections=${selection}&key=${TORN_API_KEY}`;

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Torn API request failed for ${selection}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }

  return data;
}

export async function GET() {
  try {
    if (!TORN_API_KEY) {
      return NextResponse.json(
        { success: false, error: "TORN_API_KEY is missing from .env" },
        { status: 500 }
      );
    }

    const [logCategories, logTypes] = await Promise.all([
      fetchTornSelection("logcategories"),
      fetchTornSelection("logtypes"),
    ]);

    const searchTerms = [
      "travel",
      "trade",
      "abroad",
      "item abroad",
      "item abroad buy",
      "money",
      "receive",
      "received",
      "trader",
    ];

    return NextResponse.json({
      success: true,
      note: "Use these IDs to filter user logs with cat=<categoryId> and/or log=<logTypeId>.",
      filteredMatches: {
        categories: searchObject(logCategories, searchTerms),
        types: searchObject(logTypes, searchTerms),
      },
      raw: {
        logCategories,
        logTypes,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}