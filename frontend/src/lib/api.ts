import type {
  GreeksResponse,
  ImpliedVolatilityRequest,
  ImpliedVolatilityResponse,
  PriceResponse,
  PricingRequest,
} from "./types";

const fieldLabels: Record<string, string> = {
  S: "Stock price",
  K: "Strike price",
  T: "Time to expiration",
  r: "Risk-free rate",
  sigma: "Volatility",
  market_price: "Market option price",
  option_type: "Option type",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorDetail(body: unknown, status: number): string {
  const fallback = `The request failed (HTTP ${status}). Please try again.`;
  if (!isRecord(body)) return fallback;
  if (typeof body.detail === "string") return body.detail;
  // FastAPI/Pydantic validation errors contain a list of locations and messages.
  if (Array.isArray(body.detail)) {
    const messages = body.detail.flatMap((issue: unknown) => {
      if (!isRecord(issue) || typeof issue.msg !== "string") return [];
      const location = Array.isArray(issue.loc)
        ? issue.loc.filter((part) => part !== "body").map(String)
        : [];
      const field = location.map((part) => fieldLabels[part] ?? part).join(" · ");
      return [field ? `${field}: ${issue.msg}` : issue.msg];
    });
    if (messages.length) return messages.join("\n");
  }
  return fallback;
}

async function post<T>(
  endpoint: string,
  payload: PricingRequest | ImpliedVolatilityRequest,
  keys: readonly string[],
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new Error("The request timed out. Please try again.");
    }
    throw new Error("Unable to reach the application. Check your connection and try again.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorDetail(body, response.status));
  if (!isRecord(body) || !keys.every((key) => typeof body[key] === "number" && Number.isFinite(body[key]))) {
    throw new Error("The pricing service returned an invalid response. Please try again.");
  }
  // Runtime shape validation above guards the typed API boundary. Values stay raw.
  return body as T;
}

export const getPrice = (payload: PricingRequest) =>
  post<PriceResponse>("price", payload, ["price"]);

export const getGreeks = (payload: PricingRequest) =>
  post<GreeksResponse>("greeks", payload, ["delta", "gamma", "vega", "theta", "rho"]);

export const getImpliedVolatility = (payload: ImpliedVolatilityRequest) =>
  post<ImpliedVolatilityResponse>("implied-volatility", payload, ["implied_volatility"]);

export function requestError(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
}
