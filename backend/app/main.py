"""FastAPI application and HTTP endpoints for the existing pricing engine."""

from fastapi import FastAPI, HTTPException, status

from .pricing.black_scholes import black_scholes_price
from .pricing.greeks import black_scholes_greeks
from .pricing.implied_volatility import implied_volatility
from .schemas import (
    GreeksResponse,
    HealthResponse,
    ImpliedVolatilityRequest,
    ImpliedVolatilityResponse,
    OptionPricingRequest,
    PriceResponse,
)


app = FastAPI(title="Option Pricing API")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Confirm that the backend is running."""
    return HealthResponse(status="ok")


@app.post("/price", response_model=PriceResponse)
def price(request: OptionPricingRequest) -> PriceResponse:
    """Return the theoretical Black-Scholes option price."""
    try:
        result = black_scholes_price(**request.model_dump())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return PriceResponse(price=result)


@app.post("/greeks", response_model=GreeksResponse)
def greeks(request: OptionPricingRequest) -> GreeksResponse:
    """Return Delta, Gamma, Vega, Theta, and Rho in the engine's units."""
    try:
        result = black_scholes_greeks(**request.model_dump())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return GreeksResponse(**result)


@app.post("/implied-volatility", response_model=ImpliedVolatilityResponse)
def calculate_implied_volatility(
    request: ImpliedVolatilityRequest,
) -> ImpliedVolatilityResponse:
    """Return annualized implied volatility as a decimal."""
    try:
        result = implied_volatility(**request.model_dump())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return ImpliedVolatilityResponse(implied_volatility=result)
