"use client";

import { useState } from "react";
import { numberError, type SharedFields } from "@/lib/form";
import type { OptionType } from "@/lib/types";

interface NumberInputProps {
  id: string;
  label: string;
  symbol?: string;
  unit: string;
  hint: string;
  value: string;
  positive?: boolean;
  onChange: (value: string) => void;
}

export function NumberInput({
  id, label, symbol, unit, hint, value, positive = true, onChange,
}: NumberInputProps) {
  const [touched, setTouched] = useState(false);
  const error = touched ? numberError(value, positive) : undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}{symbol && <span className="field-symbol">{symbol}</span>}</label>
      <div className={`input-wrap${error ? " input-invalid" : ""}`}>
        <input
          id={id}
          name={id}
          type="number"
          inputMode="decimal"
          step="any"
          required
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        <span className="input-unit" aria-hidden="true">{unit}</span>
      </div>
      <p className="field-hint" id={`${id}-hint`}>{hint}</p>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function OptionTypeInput({
  id, value, onChange,
}: { id: string; value: OptionType; onChange: (value: OptionType) => void }) {
  return (
    <fieldset className="option-field">
      <legend>Option Type</legend>
      <div className="option-switch">
        {(["call", "put"] as const).map((type) => (
          <label key={type}>
            <input
              type="radio"
              name={id}
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
            />
            <span>{type === "call" ? "Call" : "Put"}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SharedInputs({
  prefix, fields, onChange,
}: {
  prefix: string;
  fields: SharedFields;
  onChange: (name: "S" | "K" | "T" | "r", value: string) => void;
}) {
  return (
    <>
      <NumberInput id={`${prefix}-S`} label="Underlying Price" symbol="S" unit="$" hint="USD per share" value={fields.S} onChange={(value) => onChange("S", value)} />
      <NumberInput id={`${prefix}-K`} label="Strike Price" symbol="K" unit="$" hint="USD per share" value={fields.K} onChange={(value) => onChange("K", value)} />
      <NumberInput id={`${prefix}-T`} label="Time to Expiration" symbol="T" unit="yrs" hint="Years · 0.5 = 6 months" value={fields.T} onChange={(value) => onChange("T", value)} />
      <NumberInput id={`${prefix}-r`} label="Risk-Free Rate" symbol="r" unit="%" hint="Annual % · continuous compounding" value={fields.r} positive={false} onChange={(value) => onChange("r", value)} />
    </>
  );
}

export function SubmitButton({
  loading, disabled, children, loadingLabel,
}: { loading: boolean; disabled: boolean; children: React.ReactNode; loadingLabel: string }) {
  return (
    <button className="submit-button" type="submit" disabled={disabled || loading}>
      {loading ? <><span className="spinner" aria-hidden="true" />{loadingLabel}</> : <>{children}<ArrowIcon /></>}
    </button>
  );
}

export function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ErrorMessage({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div className="error-message" role="alert">
      <strong>Calculation could not be completed</strong>
      {messages.map((message, index) => <p key={index}>{message}</p>)}
    </div>
  );
}
