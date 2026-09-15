import type { OptionInputs, OptionType } from "./types";

export interface SharedFields {
  S: string;
  K: string;
  T: string;
  r: string;
  option_type: OptionType;
}

export const defaultFields: SharedFields = {
  S: "100",
  K: "100",
  T: "1",
  r: "5",
  option_type: "call",
};

export function numberError(value: string, positive = true): string | undefined {
  if (!value.trim()) return "Enter a value.";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Enter a finite number.";
  if (positive && number <= 0) return "Must be greater than zero.";
  return undefined;
}

export function sharedFieldsValid(fields: SharedFields): boolean {
  return !numberError(fields.S) && !numberError(fields.K) &&
    !numberError(fields.T) && !numberError(fields.r, false);
}

export function toOptionInputs(fields: SharedFields): OptionInputs {
  return {
    S: Number(fields.S),
    K: Number(fields.K),
    T: Number(fields.T),
    r: Number(fields.r) / 100,
    option_type: fields.option_type,
  };
}
