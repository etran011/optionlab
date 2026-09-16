import type { PricingRequest, SensitivityResponse } from "@/lib/types";

export const baseInputs: PricingRequest = {
  S: 100, K: 105, T: 0.5, r: 0.025, sigma: 0.2, option_type: "call",
};

// Synthetic transport data, not a second financial model. Each sweep has
// distinct values so incorrect routing to a chart cannot pass unnoticed.
export function sensitivityResponse(inputs = baseInputs, numPoints = 81): SensitivityResponse {
  return {
    sweeps: (["S", "sigma", "T"] as const).map((variable, sweepIndex) => ({
      variable,
      base_value: inputs[variable],
      points: Array.from({ length: numPoints }, (_, index) => ({
        x: inputs[variable] * (0.5 + index / (numPoints - 1)),
        price: 10 + sweepIndex + index / 100,
        delta: inputs.option_type === "call" ? 0.6 : -0.4,
        gamma: 0.02 + index / 10000,
        vega: 0.3,
        theta: -0.02,
        rho: 0.2,
      })),
    })),
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
