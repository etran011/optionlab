"""Black-Scholes Greeks for non-dividend-paying European call and put options.

Inputs use years for time and decimals for volatility and interest rates.
Outputs are local sensitivities, with other inputs held fixed, per underlying
share (no contract multiplier). Vega and rho are per percentage point; theta
is per calendar day using a 365-day year. They approximate finite price changes
rather than repricing the option after a full percentage-point or one-day move.
"""

from math import sqrt
from typing import Literal

from scipy.stats import norm

from .black_scholes import _black_scholes_terms


def black_scholes_greeks(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: Literal["call", "put"],
) -> dict[str, float]:
    """Calculate Delta, Gamma, Vega, Theta, and Rho with market display units.

    Args:
        S: Current stock price. Must be positive.
        K: Option strike price. Must be positive.
        T: Time to expiration in years. Must be positive.
        r: Continuously compounded risk-free interest rate, as a decimal.
            May be negative; for example, -0.01 means -1%.
        sigma: Annualized volatility, as a decimal. Must be positive;
            for example, 0.20 means 20%.
        option_type: Must be exactly ``"call"`` or ``"put"``, including for
            Gamma and Vega, whose values are the same for both option types.

    Returns:
        A dictionary of Python floats with the following keys:
            delta: Option-price change per $1 increase in the underlying.
            gamma: Delta change per $1 increase in the underlying.
            vega: Option-price change per 1 percentage-point increase in
                volatility (e.g. 20% to 21%), equal to dV/dsigma divided by 100.
            theta: Option-price change per calendar day passing, equal to
                -dV/dT divided by 365 because remaining time decreases.
            rho: Option-price change per 1 percentage-point increase in the
                risk-free rate (e.g. 5% to 6%), equal to dV/dr divided by 100.

    Raises:
        ValueError: If a required positive input is not positive or if the
            option type is invalid. Uses the pricing function's validation.
    """
    d1, d2, discounted_strike = _black_scholes_terms(S, K, T, r, sigma, option_type)
    sqrt_T = sqrt(T)
    pdf_d1 = norm.pdf(d1)

    # Gamma and Vega are identical for calls and puts with the same inputs.
    gamma = pdf_d1 / (S * sigma * sqrt_T)
    vega = S * pdf_d1 * sqrt_T / 100.0
    common_theta = -S * pdf_d1 * sigma / (2.0 * sqrt_T)

    if option_type == "call":
        cdf_d2 = norm.cdf(d2)
        delta = norm.cdf(d1)
        annual_theta = common_theta - r * discounted_strike * cdf_d2
        rho = T * discounted_strike * cdf_d2 / 100.0
    else:
        cdf_minus_d2 = norm.cdf(-d2)
        delta = -norm.cdf(-d1)  # Equivalent to N(d1) - 1.
        annual_theta = common_theta + r * discounted_strike * cdf_minus_d2
        rho = -T * discounted_strike * cdf_minus_d2 / 100.0

    return {
        "delta": float(delta),
        "gamma": float(gamma),
        "vega": float(vega),
        "theta": float(annual_theta / 365.0),
        "rho": float(rho),
    }
