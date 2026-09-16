"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getGreeks, getPrice, getSensitivity, requestError } from "@/lib/api";
import { defaultFields, numberError, sharedFieldsValid, toOptionInputs } from "@/lib/form";
import { money, percentage } from "@/lib/format";
import type { GreeksResponse, PriceResponse, PricingRequest, SensitivityResponse } from "@/lib/types";
import { ErrorMessage, NumberInput, OptionTypeInput, SharedInputs, SubmitButton } from "./form-controls";
import { ResultCard } from "./result-card";
import { AnalyticsSection } from "./analytics-section";

const greekDefinitions: { key: keyof GreeksResponse; label: string; symbol: string; description: string }[] = [
  { key: "delta", label: "Delta", symbol: "Δ", description: "Price change / $1 stock increase" },
  { key: "gamma", label: "Gamma", symbol: "Γ", description: "Delta change / $1 stock increase" },
  { key: "vega", label: "Vega", symbol: "ν", description: "Price change / +1 pp volatility" },
  { key: "theta", label: "Theta", symbol: "Θ", description: "Price change / calendar day" },
  { key: "rho", label: "Rho", symbol: "ρ", description: "Price change / +1 pp risk-free rate" },
];

export function PricingDashboard() {
  const [fields, setFields] = useState({ ...defaultFields, sigma: "20" });
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [greeks, setGreeks] = useState<GreeksResponse | null>(null);
  const [submitted, setSubmitted] = useState<PricingRequest | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [greeksFailed, setGreeksFailed] = useState(false);
  const [analytics, setAnalytics] = useState<SensitivityResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const analyticsRequest = useRef<AbortController | null>(null);
  useEffect(() => () => analyticsRequest.current?.abort(), []);
  const valid = sharedFieldsValid(fields) && !numberError(fields.sigma) && Number(fields.sigma) / 100 > 0;

  function update(name: keyof typeof fields, value: string) {
    setFields((previous) => ({ ...previous, [name]: value }));
    setPrice(null);
    setGreeks(null);
    setSubmitted(null);
    setErrors([]);
    setGreeksFailed(false);
    analyticsRequest.current?.abort();
    analyticsRequest.current = null;
    setAnalytics(null);
    setAnalyticsLoading(false);
    setAnalyticsError(null);
  }

  async function refreshAnalytics(payload: PricingRequest) {
    analyticsRequest.current?.abort();
    const controller = new AbortController();
    analyticsRequest.current = controller;
    setAnalytics(null);
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const result = await getSensitivity({ ...payload, variables: ["S", "sigma", "T"], num_points: 81 }, controller.signal);
      if (analyticsRequest.current === controller) setAnalytics(result);
    } catch (error) {
      if (analyticsRequest.current === controller && !controller.signal.aborted) setAnalyticsError(requestError(error));
    } finally {
      if (analyticsRequest.current === controller) setAnalyticsLoading(false);
    }
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || loading) return;
    const payload: PricingRequest = { ...toOptionInputs(fields), sigma: Number(fields.sigma) / 100 };
    setLoading(true);
    setPrice(null);
    setGreeks(null);
    setErrors([]);
    setGreeksFailed(false);
    setSubmitted(payload);
    // Analytics shares the submitted inputs, but never delays the price or Greeks.
    void refreshAnalytics(payload);

    // Both endpoints use the same snapshot. Keep successful results if only one fails.
    const [priceResult, greeksResult] = await Promise.allSettled([getPrice(payload), getGreeks(payload)]);
    const failures: string[] = [];
    if (priceResult.status === "fulfilled") setPrice(priceResult.value);
    else failures.push(`Option price: ${requestError(priceResult.reason)}`);
    if (greeksResult.status === "fulfilled") setGreeks(greeksResult.value);
    else {
      failures.push(`Greeks: ${requestError(greeksResult.reason)}`);
      setGreeksFailed(true);
    }
    setErrors(failures);
    setLoading(false);
  }

  const resultStatus = loading ? "Calculating…" : errors.length ? "Calculation issue" : price && greeks ? "Calculation complete" : "Ready to calculate";

  return (
    <>
    <section id="pricing" aria-labelledby="pricing-heading" className="workspace-section">
      <div className="section-heading">
        <div><span className="section-index">01 /</span><h2 id="pricing-heading">Valuation</h2></div>
        <span className="section-caption">European options · Per share</span>
      </div>
      <div className="pricing-grid">
        <form className="input-panel" onSubmit={calculate} noValidate>
          <h3 className="tool-heading">Model inputs</h3>
          <fieldset className="form-fields" disabled={loading}>
            <legend className="sr-only">Pricing assumptions</legend>
            <div className="fields-grid">
              <SharedInputs prefix="pricing" fields={fields} onChange={update} />
              <NumberInput id="pricing-sigma" label="Volatility" symbol="σ" unit="%" hint="Annualized · 20 means 20%" value={fields.sigma} onChange={(value) => update("sigma", value)} />
              <OptionTypeInput id="pricing-option-type" value={fields.option_type} onChange={(value) => update("option_type", value)} />
            </div>
            <SubmitButton loading={loading} disabled={!valid} loadingLabel="Calculating…">Calculate</SubmitButton>
          </fieldset>
          <p className={`form-note${!valid ? " validation-note" : ""}`}>{valid ? "Returns theoretical value and all five Greeks." : "Complete all fields with valid numbers. Prices, time and volatility must be greater than zero."}</p>
          <ErrorMessage messages={errors} />
        </form>

        <div className="valuation-results" aria-busy={loading}>
          <div className="price-result">
            <div className="price-result-top">
              <h3 className="tool-heading">Theoretical value</h3>
              <span className="calculation-status" role="status"><span className={`status-dot${price && !errors.length && !loading ? " status-complete" : ""}`} />{resultStatus}</span>
            </div>
            <div className="price-amount" title={price?.price.toString()}>{loading ? <span className="skeleton price-skeleton" /> : price ? money.format(price.price) : <span className="empty-price">$<span>—</span></span>}</div>
            <div className="price-result-bottom">
              <span>USD / SHARE</span>
              <span>{fields.option_type === "call" ? "Call" : "Put"} option · Black–Scholes</span>
            </div>
          </div>
          <div className="sensitivities-heading" id="risk-sensitivities"><h3>Risk sensitivities</h3><span>THE GREEKS</span></div>
          <div className="greeks-grid" aria-label="Option Greeks">
            {greekDefinitions.map(({ key, ...greek }) => <ResultCard key={key} {...greek} value={greeks?.[key]} loading={loading} failed={greeksFailed} />)}
          </div>
          <p className="results-note">Sensitivities are per share. pp = percentage point. Theta uses a 365-day year.</p>
          {(price || greeks) && submitted && <p className="result-context">{submitted.option_type === "call" ? "Call" : "Put"} · S {money.format(submitted.S)} · K {money.format(submitted.K)} · {submitted.T} {submitted.T === 1 ? "year" : "years"} · r {percentage.format(submitted.r)} · σ {percentage.format(submitted.sigma)}</p>}
        </div>
      </div>
    </section>
    <AnalyticsSection
      data={analytics}
      inputs={submitted}
      loading={analyticsLoading}
      error={analyticsError}
      refreshDisabled={loading || analyticsLoading || !submitted}
      onRefresh={() => { if (submitted) void refreshAnalytics(submitted); }}
    />
    </>
  );
}
