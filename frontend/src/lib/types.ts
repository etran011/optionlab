export type OptionType = "call" | "put";

export interface OptionInputs {
  S: number;
  K: number;
  T: number;
  r: number;
  option_type: OptionType;
}

export interface PricingRequest extends OptionInputs {
  sigma: number;
}

export interface ImpliedVolatilityRequest extends OptionInputs {
  market_price: number;
}

export interface PriceResponse {
  price: number;
}

export interface GreeksResponse {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export interface ImpliedVolatilityResponse {
  implied_volatility: number;
}
