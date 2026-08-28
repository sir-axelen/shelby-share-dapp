import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const authHeader = req.headers.get("Authorization");
    
    let apiKey = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.split(" ")[1];
    } else if (process.env.NEXT_PUBLIC_SHELBY_API_KEY) {
      apiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY;
    }

    const indexerUrl = process.env.NEXT_PUBLIC_SHELBY_INDEXER || "https://api.shelbynet.aptoslabs.com/v1/graphql";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(indexerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: responseText || `Indexer returned HTTP ${response.status}` };
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Shelby indexer proxy error:", error);
    return NextResponse.json({ error: error?.message || "Proxy failed" }, { status: 500 });
  }
}
