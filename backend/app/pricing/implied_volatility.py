"""Implied volatility for non-dividend-paying European call and put options."""

from math import exp, isfinite
from typing import Literal

from scipy.optimize import brentq

from .black_scholes import black_scholes_price


_MIN_VOLATILITY = 1e-8
_MAX_VOLATILITY = 5.0


def implied_volatility(
    S: float,
    K: float,
    T: float,
    r: float,
    market_price: float,
    option_type: Literal["call", "put"],
) -> float:
    """Find annualized volatility that reproduces an observed option price.

    Solve black_scholes_price(S, K, T, r, sigma, option_type) - market_price
    = 0 using Brent's method on the fixed, inclusive interval [1e-8, 5.0].
    These decimal volatilities represent 0.000001% and 500% annually. The
    positive lower endpoint avoids division by zero in the existing pricer;
    the upper endpoint is a practical search cap, not a theoretical maximum.
    The interval is not expanded if the required volatility lies outside it.

    Prices must lie strictly inside the no-arbitrage bounds: the lower bound
    is the zero-volatility limit, and the upper bound is approached as
    volatility tends to infinity. Prices rounded onto either bound are also
    rejected because a positive finite volatility cannot be resolved there.

    Args:
        S: Current stock price. Must be positive and finite.
        K: Option strike price. Must be positive and finite.
        T: Time to expiration in years. Must be positive and finite.
        r: Continuously compounded risk-free rate, as a decimal. Must be
            finite and may be negative; -0.01 means -1%.
        market_price: Observed option price per share, in the same currency
            as S and K. Must be positive and finite.
        option_type: Must be exactly ``"call"`` or ``"put"``.

    Returns:
        Annualized volatility as a Python float; 0.25 means 25%. The solver
        uses absolute and relative volatility tolerances of 1e-12 and allows
        at most 100 iterations. These are not option-price tolerances.

    Raises:
        ValueError: If inputs are invalid, the price is outside or on a
            no-arbitrage bound, no root exists in the search interval,
            numerical evaluation fails, or the solver does not converge.
    """
    for name, value in (("S", S), ("K", K), ("T", T), ("market_price", market_price)):
        if not isfinite(value) or value <= 0:
            raise ValueError(f"{name} must be positive and finite")

    if not isfinite(r):
        raise ValueError("r must be finite")

    if option_type not in ("call", "put"):
        raise ValueError('option_type must be either "call" or "put"')

    try:
        discounted_strike = K * exp(-r * T)
    except OverflowError as exc:
        raise ValueError("Discounted strike is outside the numerical range") from exc
    if not isfinite(discounted_strike) or discounted_strike <= 0:
        raise ValueError("Discounted strike must be positive and finite")

    if option_type == "call":
        lower_price, upper_price = max(0.0, S - discounted_strike), S
    else:
        lower_price, upper_price = max(0.0, discounted_strike - S), discounted_strike

    if market_price < lower_price or market_price > upper_price:
        raise ValueError(
            f"market_price violates {option_type} no-arbitrage bounds "
            f"[{lower_price}, {upper_price}]"
        )
    if market_price == lower_price or market_price == upper_price:
        raise ValueError(
            "No positive finite implied volatility can be resolved for a "
            "market_price exactly on a no-arbitrage bound"
        )

    def price_error(sigma: float) -> float:
        try:
            model_price = black_scholes_price(S, K, T, r, sigma, option_type)
        except (OverflowError, ZeroDivisionError, ValueError) as exc:
            raise ValueError("Black-Scholes price could not be evaluated numerically") from exc
        if not isfinite(model_price):
            raise ValueError("Black-Scholes price must be finite")
        return model_price - market_price

    lower_error = price_error(_MIN_VOLATILITY)
    upper_error = price_error(_MAX_VOLATILITY)
    # Both call and put prices increase with volatility, so these signs
    # identify prices that cannot be matched anywhere in the search interval.
    if lower_error > 0 or upper_error < 0:
        raise ValueError(
            "No implied volatility exists within the volatility search "
            f"interval [{_MIN_VOLATILITY}, {_MAX_VOLATILITY}] for this market_price"
        )

    try:
        return float(
            brentq(
                price_error,
                _MIN_VOLATILITY,
                _MAX_VOLATILITY,
                xtol=1e-12,
                rtol=1e-12,
                maxiter=100,
            )
        )
    except RuntimeError as exc:
        raise ValueError(
            "Implied volatility solver did not converge within the volatility "
            f"search interval [{_MIN_VOLATILITY}, {_MAX_VOLATILITY}]"
        ) from exc
