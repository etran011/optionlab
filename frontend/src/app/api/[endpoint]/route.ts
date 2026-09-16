import { NextRequest, NextResponse } from "next/server";

const endpoints = new Set(["price", "greeks", "implied-volatility", "sensitivity"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ endpoint: string }> },
) {
  const { endpoint } = await context.params;
  if (!endpoints.has(endpoint)) {
    return NextResponse.json({ detail: "Unknown pricing endpoint." }, { status: 404 });
  }

  const baseUrl = process.env.API_BASE_URL?.trim();
  if (!baseUrl) {
    return NextResponse.json(
      { detail: "The pricing service is not configured. Set API_BASE_URL in frontend/.env.local and restart the frontend." },
      { status: 503 },
    );
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(`${baseUrl.replace(/\/+$/, "")}/${endpoint}`);
    if (!["http:", "https:"].includes(upstreamUrl.protocol) || upstreamUrl.search || upstreamUrl.hash) {
      throw new Error("Invalid URL");
    }
  } catch {
    return NextResponse.json(
      { detail: "API_BASE_URL must be an HTTP or HTTPS base URL without a query or fragment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "The request body must be valid JSON." }, { status: 400 });
  }

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    const rawBody = await response.text();
    try {
      JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { detail: `The pricing service returned an unreadable response (HTTP ${response.status}). Check the backend logs and try again.` },
        { status: 502 },
      );
    }
    // Preserve the FastAPI JSON and status, including its validation details.
    return new Response(rawBody, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    return NextResponse.json(
      { detail: timedOut
        ? "The pricing service timed out. Please try again."
        : "Unable to reach the pricing service. Make sure FastAPI is running and API_BASE_URL is correct." },
      { status: timedOut ? 504 : 502 },
    );
  }
}
