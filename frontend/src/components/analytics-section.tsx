"use client";

import dynamic from "next/dynamic";
import { money, percentage } from "@/lib/format";
import type { PricingRequest, SensitivityResponse } from "@/lib/types";
import { ErrorMessage } from "./form-controls";

const SensitivityCharts = dynamic(() => import("./sensitivity-charts"), {
  ssr: false,
  loading: () => <p className="analytics-placeholder" role="status">Preparing charts…</p>,
});

interface AnalyticsSectionProps {
  data: SensitivityResponse | null;
  inputs: PricingRequest | null;
  loading: boolean;
  error: string | null;
  refreshDisabled: boolean;
  onRefresh: () => void;
}

export function AnalyticsSection({ data, inputs, loading, error, refreshDisabled, onRefresh }: AnalyticsSectionProps) {
  return (
    <section id="analytics" className="workspace-section analytics-section" aria-labelledby="analytics-heading" aria-busy={loading}>
      <div className="section-heading">
        <div><span className="section-index">02 /</span><h2 id="analytics-heading">Analytics / Sensitivity</h2></div>
        <span className="section-caption">One input changes. Other assumptions stay fixed.</span>
      </div>
      <div className="analytics-toolbar">
        <p role="status">{loading ? "Calculating sensitivity curves…" : error ? "Sensitivity analysis unavailable." : data ? "Curves reflect your last calculation." : "Calculate a valuation to explore its sensitivities."}</p>
        <button type="button" className="analytics-refresh" disabled={refreshDisabled} onClick={onRefresh}>
          {loading && <span className="spinner" aria-hidden="true" />}
          {error ? "Retry analytics" : "Refresh analytics"}
        </button>
      </div>
      {inputs && <p className="analytics-context">
        {inputs.option_type === "call" ? "Call" : "Put"} · S {money.format(inputs.S)} · K {money.format(inputs.K)} · {inputs.T} {inputs.T === 1 ? "year" : "years"} · r {percentage.format(inputs.r)} · σ {percentage.format(inputs.sigma)}
      </p>}
      <ErrorMessage messages={error ? [`Sensitivity analysis: ${error}`] : []} />
      {loading ? (
        <div className="analytics-placeholder"><span className="skeleton" aria-hidden="true" /><p>Repricing the underlying, volatility and time scenarios.</p></div>
      ) : data && inputs ? (
        <SensitivityCharts data={data} inputs={inputs} />
      ) : !error ? (
        <div className="analytics-empty">
          <div><span>01 / UNDERLYING</span><p>Option value, Delta & Gamma</p></div>
          <div><span>02 / VOLATILITY</span><p>Option value across annualized volatility</p></div>
          <div><span>03 / TIME</span><p>Option value across remaining days</p></div>
        </div>
      ) : null}
      <p className="analytics-note">Updates on Calculate or Refresh analytics. Values are per share. Time uses a 365-day year; the shortest maturity is always above zero.</p>
    </section>
  );
}
