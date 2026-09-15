"use client";

import { useState, type FormEvent } from "react";
import { getImpliedVolatility, requestError } from "@/lib/api";
import { defaultFields, numberError, sharedFieldsValid, toOptionInputs } from "@/lib/form";
import { decimal, money, percentage } from "@/lib/format";
import type { ImpliedVolatilityRequest, ImpliedVolatilityResponse } from "@/lib/types";
import { ErrorMessage, NumberInput, OptionTypeInput, SharedInputs, SubmitButton } from "./form-controls";

export function ImpliedVolatility() {
  const [fields, setFields] = useState({ ...defaultFields, market_price: "10.45" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImpliedVolatilityResponse | null>(null);
  const [submitted, setSubmitted] = useState<ImpliedVolatilityRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = sharedFieldsValid(fields) && !numberError(fields.market_price);

  function update(name: keyof typeof fields, value: string) {
    setFields((previous) => ({ ...previous, [name]: value }));
    setResult(null);
    setSubmitted(null);
    setError(null);
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || loading) return;
    const payload = { ...toOptionInputs(fields), market_price: Number(fields.market_price) };
    setLoading(true);
    setResult(null);
    setError(null);
    setSubmitted(payload);
    try {
      setResult(await getImpliedVolatility(payload));
    } catch (error) {
      setError(requestError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="implied-volatility" aria-labelledby="iv-heading" className="workspace-section iv-section">
      <div className="section-heading">
        <div><span className="section-index">02 /</span><h2 id="iv-heading">Implied volatility</h2></div>
        <span className="section-caption">Infer volatility from an observed option price.</span>
      </div>
      <div className="iv-panel">
        <form onSubmit={calculate} noValidate>
          <fieldset className="form-fields" disabled={loading}>
            <legend className="sr-only">Implied volatility assumptions</legend>
            <div className="fields-grid iv-fields">
              <SharedInputs prefix="iv" fields={fields} onChange={update} />
              <NumberInput id="iv-market-price" label="Market Option Price" unit="$" hint="Observed premium · USD per share" value={fields.market_price} onChange={(value) => update("market_price", value)} />
              <OptionTypeInput id="iv-option-type" value={fields.option_type} onChange={(value) => update("option_type", value)} />
            </div>
            <SubmitButton loading={loading} disabled={!valid} loadingLabel="Solving volatility…">Calculate implied volatility</SubmitButton>
          </fieldset>
          {!valid && <p className="form-note validation-note">Complete all fields with valid numbers. Prices and time must be greater than zero.</p>}
          <ErrorMessage messages={error ? [error] : []} />
        </form>
        <div className="iv-result" aria-busy={loading}>
          <h3 className="tool-heading">Implied volatility</h3>
          <p className="iv-amount" title={result?.implied_volatility.toString()}>{loading ? <span className="skeleton" /> : result ? percentage.format(result.implied_volatility) : <span className="iv-empty">—<span>%</span></span>}</p>
          <p className="iv-annualized">Annualized volatility</p>
          <dl className="decimal-result"><dt>Decimal value</dt><dd title={result?.implied_volatility.toString()}>{result ? decimal.format(result.implied_volatility) : "—"}</dd></dl>
          <p className="iv-status" role="status">{loading ? "Finding the volatility that matches your price…" : error ? "Unable to solve. Review the error and try again." : result && submitted ? `Solved for a ${submitted.option_type} at ${money.format(submitted.market_price)} per share.` : "Your result will appear here after you calculate."}</p>
          <p className="iv-explanation">The annualized volatility that matches the market option price under Black–Scholes.</p>
        </div>
      </div>
    </section>
  );
}
