"""Black-Scholes pricing for European call and put options."""

from math import exp, log, sqrt
from typing import Literal

from scipy.stats import norm


def _black_scholes_terms(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: Literal["call", "put"],
) -> tuple[float, float, float]:
    """Validate shared inputs and return d1, d2, and the discounted strike."""
    for name, value in (("S", S), ("K", K), ("T", T), ("sigma", sigma)):
        if value <= 0:
            raise ValueError(f"{name} must be positive")

    if option_type not in ("call", "put"):
        raise ValueError('option_type must be either "call" or "put"')

    d1 = (log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqrt(T))
    d2 = d1 - sigma * sqrt(T)
    discounted_strike = K * exp(-r * T)
    return d1, d2, discounted_strike


def black_scholes_price(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: Literal["call", "put"],
) -> float:
    """Calculate the Black-Scholes price of a European call or put option.

    Args:
        S: Current stock price. Must be positive.
        K: Option strike price. Must be positive.
        T: Time to expiration in years. Must be positive.
        r: Continuously compounded risk-free interest rate. May be negative.
        sigma: Annualized stock-price volatility. Must be positive.
        option_type: The option kind; must be exactly ``"call"`` or ``"put"``.

    Returns:
        The theoretical option price.

    Raises:
        ValueError: If a required positive input is not positive or if the
            option type is invalid.
    """
    d1, d2, discounted_strike = _black_scholes_terms(S, K, T, r, sigma, option_type)

    if option_type == "call":
        return float(S * norm.cdf(d1) - discounted_strike * norm.cdf(d2))
    else:
        return float(discounted_strike * norm.cdf(-d2) - S * norm.cdf(-d1))
