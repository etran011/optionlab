"""Request and response schemas for the option pricing API."""

from typing import Literal

from pydantic import BaseModel, Field, FiniteFloat, field_validator


class OptionInputs(BaseModel):
    """Shared inputs for non-dividend-paying European call and put options."""

    S: FiniteFloat = Field(gt=0, description="Current stock price.")
    K: FiniteFloat = Field(gt=0, description="Option strike price.")
    T: FiniteFloat = Field(gt=0, description="Time to expiration in years.")
    r: FiniteFloat = Field(
        description="Continuously compounded risk-free rate as a decimal; may be negative."
    )
    option_type: Literal["call", "put"]


class OptionPricingRequest(OptionInputs):
    """Inputs shared by the price and Greeks endpoints."""

    sigma: FiniteFloat = Field(
        gt=0, description="Annualized volatility as a decimal; 0.20 means 20%."
    )


class ImpliedVolatilityRequest(OptionInputs):
    """Inputs for recovering volatility from an observed option price."""

    market_price: FiniteFloat = Field(
        gt=0, description="Observed option price per share, in the same currency as S and K."
    )


class HealthResponse(BaseModel):
    """Backend liveness status."""

    status: Literal["ok"]


class PriceResponse(BaseModel):
    """Theoretical option price returned by the pricing engine."""

    price: FiniteFloat = Field(description="Theoretical option price per share.")


class GreeksResponse(BaseModel):
    """Sensitivities in the existing pricing engine's units, per share."""

    delta: FiniteFloat = Field(description="Option-price change per $1 increase in stock price.")
    gamma: FiniteFloat = Field(description="Delta change per $1 increase in stock price.")
    vega: FiniteFloat = Field(
        description="Option-price change per 1 percentage-point increase in volatility."
    )
    theta: FiniteFloat = Field(
        description="Option-price change per calendar day passing, using a 365-day year."
    )
    rho: FiniteFloat = Field(
        description="Option-price change per 1 percentage-point increase in the risk-free rate."
    )


class ImpliedVolatilityResponse(BaseModel):
    """Annualized implied volatility returned by the existing solver."""

    implied_volatility: FiniteFloat = Field(
        gt=0, description="Annualized implied volatility as a decimal; 0.20 means 20%."
    )


SweepVariable = Literal["S", "sigma", "T"]


class SensitivityRequest(OptionPricingRequest):
    """Batch independent sweeps around one unchanged set of base inputs."""

    variables: list[SweepVariable] = Field(min_length=1, max_length=3)
    num_points: int = Field(
        default=81, ge=21, le=201, strict=True,
        description="Uniform samples per sweep; exact base and in-range strike may add points.",
    )

    @field_validator("variables")
    @classmethod
    def unique_variables(cls, value: list[SweepVariable]) -> list[SweepVariable]:
        if len(value) != len(set(value)):
            raise ValueError("Sweep variables must be unique.")
        return value


class SensitivityPoint(GreeksResponse):
    """Unrounded model outputs at a single scenario, in existing engine units."""

    x: FiniteFloat = Field(gt=0, description="Swept input: USD, decimal volatility, or years.")
    price: FiniteFloat


class SensitivitySweep(BaseModel):
    variable: SweepVariable
    base_value: FiniteFloat = Field(gt=0)
    points: list[SensitivityPoint]


class SensitivityResponse(BaseModel):
    sweeps: list[SensitivitySweep]
