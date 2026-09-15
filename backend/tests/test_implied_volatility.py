"""Recovery and input-domain checks for European implied volatility."""

from math import exp

import pytest

from app.pricing.black_scholes import black_scholes_price
from app.pricing.implied_volatility import _MAX_VOLATILITY, implied_volatility


BASE_INPUTS = dict(S=100.0, K=100.0, T=1.0, r=0.05)
# Tolerances are in decimal annualized volatility, not option-price dollars.
REL_TOL = 1e-8
ABS_TOL = 1e-10
POSITIVE_LOWER_BOUND_CASES = [
    pytest.param("call", 120.0, id="call"),
    pytest.param("put", 80.0, id="put"),
]


@pytest.mark.parametrize("option_type", ["call", "put"])
@pytest.mark.parametrize("sigma", [0.25, 0.10, 0.30, 0.75])
def test_round_trip_recovers_known_volatility(option_type, sigma):
    # Inverting a price generated at sigma should recover that same sigma.
    market_price = black_scholes_price(
        **BASE_INPUTS, sigma=sigma, option_type=option_type
    )

    recovered = implied_volatility(
        **BASE_INPUTS, market_price=market_price, option_type=option_type
    )

    assert recovered == pytest.approx(sigma, rel=REL_TOL, abs=ABS_TOL)


@pytest.mark.parametrize("option_type", ["call", "put"])
def test_round_trip_with_negative_risk_free_rate(option_type):
    # Negative rates increase the discounted strike but still allow inversion.
    inputs = {**BASE_INPUTS, "r": -0.05}
    sigma = 0.25
    market_price = black_scholes_price(
        **inputs, sigma=sigma, option_type=option_type
    )

    recovered = implied_volatility(
        **inputs, market_price=market_price, option_type=option_type
    )

    assert recovered == pytest.approx(sigma, rel=REL_TOL, abs=ABS_TOL)


@pytest.mark.parametrize("option_type", ["call", "put"])
@pytest.mark.parametrize("parameter", ["S", "K", "T", "market_price"])
@pytest.mark.parametrize("value", [0.0, -1.0, -1e-12])
def test_nonpositive_inputs_are_rejected(option_type, parameter, value):
    inputs = {**BASE_INPUTS, "market_price": 10.0, parameter: value}

    with pytest.raises(ValueError, match=rf"^{parameter} must be positive and finite$"):
        implied_volatility(**inputs, option_type=option_type)


@pytest.mark.parametrize(
    "option_type", ["", "invalid", "CALL", "PUT", "Call", "Put", " call", "put ", None, 1]
)
def test_invalid_option_types_are_rejected(option_type):
    with pytest.raises(
        ValueError, match='^option_type must be either "call" or "put"$'
    ):
        implied_volatility(**BASE_INPUTS, market_price=10.0, option_type=option_type)


@pytest.mark.parametrize("option_type, S", POSITIVE_LOWER_BOUND_CASES)
@pytest.mark.parametrize("r", [0.05, -0.05])
def test_prices_below_no_arbitrage_lower_bound_are_rejected(option_type, S, r):
    inputs = {**BASE_INPUTS, "S": S, "r": r}
    discounted_strike = inputs["K"] * exp(-r * inputs["T"])
    lower_bound = S - discounted_strike if option_type == "call" else discounted_strike - S
    market_price = lower_bound / 2
    # Keep the price positive so rejection specifically tests the financial
    # lower bound, rather than the general positive-input validation.
    assert 0 < market_price < lower_bound

    with pytest.raises(ValueError, match=rf"market_price violates {option_type} no-arbitrage bounds"):
        implied_volatility(**inputs, market_price=market_price, option_type=option_type)


@pytest.mark.parametrize("option_type", ["call", "put"])
@pytest.mark.parametrize("r", [0.05, -0.05])
def test_prices_above_no_arbitrage_upper_bound_are_rejected(option_type, r):
    inputs = {**BASE_INPUTS, "r": r}
    discounted_strike = inputs["K"] * exp(-r * inputs["T"])
    # A call cannot exceed the stock; a put cannot exceed the present value
    # of its strike. Discounting matters for both positive and negative rates.
    upper_bound = inputs["S"] if option_type == "call" else discounted_strike

    with pytest.raises(ValueError, match=rf"market_price violates {option_type} no-arbitrage bounds"):
        implied_volatility(
            **inputs, market_price=upper_bound + 1.0, option_type=option_type
        )


@pytest.mark.parametrize("option_type, S", POSITIVE_LOWER_BOUND_CASES)
@pytest.mark.parametrize("r", [0.05, -0.05])
@pytest.mark.parametrize("bound", ["lower", "upper"])
def test_prices_exactly_on_positive_no_arbitrage_bounds_are_rejected(
    option_type, S, r, bound
):
    inputs = {**BASE_INPUTS, "S": S, "r": r}
    discounted_strike = inputs["K"] * exp(-r * inputs["T"])
    if option_type == "call":
        lower_bound, upper_bound = S - discounted_strike, S
    else:
        lower_bound, upper_bound = discounted_strike - S, discounted_strike
    assert 0 < lower_bound < upper_bound
    market_price = lower_bound if bound == "lower" else upper_bound

    # The lower bound is the zero-volatility limit; the upper bound is the
    # infinite-volatility limit. The solver rejects exact/rounded bound prices.
    with pytest.raises(ValueError, match="exactly on a no-arbitrage bound"):
        implied_volatility(**inputs, market_price=market_price, option_type=option_type)


@pytest.mark.parametrize("option_type, S", [("call", 80.0), ("put", 120.0)])
def test_prices_exactly_on_zero_lower_bound_are_rejected(option_type, S):
    inputs = {**BASE_INPUTS, "S": S}
    discounted_strike = inputs["K"] * exp(-inputs["r"] * inputs["T"])
    # These options have zero lower bounds; zero prices are rejected by the
    # positive-input check before reaching the no-arbitrage validation.
    assert S < discounted_strike if option_type == "call" else discounted_strike < S

    with pytest.raises(ValueError, match="^market_price must be positive and finite$"):
        implied_volatility(**inputs, market_price=0.0, option_type=option_type)


@pytest.mark.parametrize("option_type", ["call", "put"])
def test_volatility_above_search_interval_is_rejected(option_type):
    # A shorter maturity keeps this high-volatility price well below the
    # no-arbitrage upper bound, avoiding numerical saturation at that bound.
    inputs = {**BASE_INPUTS, "T": 0.25}
    market_price = black_scholes_price(
        **inputs, sigma=1.2 * _MAX_VOLATILITY, option_type=option_type
    )
    price_at_max = black_scholes_price(
        **inputs, sigma=_MAX_VOLATILITY, option_type=option_type
    )
    discounted_strike = inputs["K"] * exp(-inputs["r"] * inputs["T"])
    if option_type == "call":
        lower_bound, upper_bound = max(0.0, inputs["S"] - discounted_strike), inputs["S"]
    else:
        lower_bound, upper_bound = max(0.0, discounted_strike - inputs["S"]), discounted_strike
    # Prices increase with volatility: this price is financially admissible
    # but cannot be matched anywhere within the configured search interval.
    assert lower_bound < price_at_max < market_price < upper_bound

    with pytest.raises(
        ValueError,
        match="No implied volatility exists within the volatility search interval",
    ):
        implied_volatility(**inputs, market_price=market_price, option_type=option_type)


@pytest.mark.parametrize("option_type", ["call", "put"])
@pytest.mark.parametrize("parameter", ["S", "K", "T", "market_price", "r"])
@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_nonfinite_inputs_are_rejected(option_type, parameter, value):
    inputs = {**BASE_INPUTS, "market_price": 10.0, parameter: value}
    message = "r must be finite" if parameter == "r" else f"{parameter} must be positive and finite"

    with pytest.raises(ValueError, match=rf"^{message}$"):
        implied_volatility(**inputs, option_type=option_type)
