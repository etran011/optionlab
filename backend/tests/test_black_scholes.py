"""Tests for the Black-Scholes pricing engine."""

from math import exp, isfinite

import pytest

from app.pricing.black_scholes import black_scholes_price


# Dollar-valued tolerances: allow floating-point rounding without hiding
# meaningful pricing errors. Near-zero values use the absolute tolerance.
REL_TOL = 1e-10
ABS_TOL = 1e-10
BASE_INPUTS = dict(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.2)

# Cover moneyness, negative/zero/positive rates, and numerical edge cases.
SCENARIOS = [
    pytest.param(100, 100, 1, 0.05, 0.2, id="at-the-money"),
    pytest.param(120, 100, 2, 0.03, 0.35, id="above-strike"),
    pytest.param(80, 100, 0.5, 0.03, 0.35, id="below-strike"),
    pytest.param(100, 100, 1, -0.05, 0.2, id="negative-rate"),
    pytest.param(100, 100, 1, 0, 0.2, id="zero-rate"),
    pytest.param(1000, 100, 1, 0.05, 0.2, id="deep-call-itm"),
    pytest.param(10, 100, 1, 0.05, 0.2, id="deep-put-itm"),
    pytest.param(100, 100, 1e-8, 0.05, 0.2, id="short-expiration"),
    pytest.param(100, 100, 1, 0.05, 1e-8, id="low-volatility"),
]


@pytest.mark.parametrize(
    "option_type, expected",
    [("call", 10.450583572185565), ("put", 5.573526022256968)],
)
def test_known_european_prices(option_type, expected):
    # Independently verified by quadrature of the discounted lognormal payoff:
    # exp(-r*T) * integral(max(sign*(S*exp((r-sigma**2/2)*T
    # + sigma*sqrt(T)*z)-K), 0) * exp(-z*z/2)/sqrt(2*pi), dz).
    # Integrate each payoff from/to its exercise threshold, truncating at +/-12;
    # scipy.integrate.quad estimated error < 3e-13 (omitted tails < 1e-29).
    # No pricing function or normal CDF was used to obtain these constants.
    price = black_scholes_price(**BASE_INPUTS, option_type=option_type)
    assert price == pytest.approx(expected, rel=REL_TOL, abs=ABS_TOL)


@pytest.mark.parametrize("S, K, T, r, sigma", SCENARIOS)
def test_put_call_parity(S, K, T, r, sigma):
    call = black_scholes_price(S, K, T, r, sigma, "call")
    put = black_scholes_price(S, K, T, r, sigma, "put")
    assert call - put == pytest.approx(
        S - K * exp(-r * T), rel=REL_TOL, abs=ABS_TOL
    )


@pytest.mark.parametrize("S, K, T, r, sigma", SCENARIOS)
@pytest.mark.parametrize("option_type", ["call", "put"])
def test_no_arbitrage_bounds(S, K, T, r, sigma, option_type):
    price = black_scholes_price(S, K, T, r, sigma, option_type)
    discounted_strike = K * exp(-r * T)
    if option_type == "call":
        lower, upper = max(0, S - discounted_strike), S
    else:
        lower, upper = max(0, discounted_strike - S), discounted_strike

    assert isfinite(price)
    assert price >= 0
    assert price >= lower or price == pytest.approx(lower, rel=REL_TOL, abs=ABS_TOL)
    assert price <= upper or price == pytest.approx(upper, rel=REL_TOL, abs=ABS_TOL)


@pytest.mark.parametrize("parameter", ["S", "K", "T", "sigma"])
@pytest.mark.parametrize("value", [0.0, -1.0, -1e-12])
@pytest.mark.parametrize("option_type", ["call", "put"])
def test_nonpositive_inputs_are_rejected(parameter, value, option_type):
    inputs = {**BASE_INPUTS, parameter: value}
    with pytest.raises(ValueError, match=rf"^{parameter} must be positive$"):
        black_scholes_price(**inputs, option_type=option_type)


@pytest.mark.parametrize(
    "option_type", ["", "invalid", "CALL", "PUT", "Call", "Put", " call", "put ", None, 1]
)
def test_invalid_option_types_are_rejected(option_type):
    # The public contract explicitly requires exact lowercase option types.
    with pytest.raises(
        ValueError, match='^option_type must be either "call" or "put"$'
    ):
        black_scholes_price(**BASE_INPUTS, option_type=option_type)


def test_negative_rate_lowers_call_and_raises_put():
    negative_rate_inputs = {**BASE_INPUTS, "r": -0.05}
    zero_rate_inputs = {**BASE_INPUTS, "r": 0.0}
    for option_type in ("call", "put"):
        negative_price = black_scholes_price(**negative_rate_inputs, option_type=option_type)
        zero_price = black_scholes_price(**zero_rate_inputs, option_type=option_type)
        assert isfinite(negative_price)
        assert negative_price > 0
        if option_type == "call":
            assert negative_price < zero_price
        else:
            assert negative_price > zero_price


@pytest.mark.parametrize("S, option_type", [(1000, "call"), (10, "put")])
def test_deep_in_the_money_approaches_discounted_intrinsic(S, option_type):
    price = black_scholes_price(**{**BASE_INPUTS, "S": S}, option_type=option_type)
    difference = S - BASE_INPUTS["K"] * exp(-BASE_INPUTS["r"] * BASE_INPUTS["T"])
    expected = difference if option_type == "call" else -difference
    assert price == pytest.approx(expected, rel=REL_TOL, abs=ABS_TOL)


@pytest.mark.parametrize("S, option_type", [(10, "call"), (1000, "put")])
def test_deep_out_of_the_money_approaches_zero(S, option_type):
    price = black_scholes_price(**{**BASE_INPUTS, "S": S}, option_type=option_type)
    assert price >= 0
    assert price == pytest.approx(0, rel=0, abs=ABS_TOL)


@pytest.mark.parametrize("S", [80, 100, 120])
@pytest.mark.parametrize("option_type", ["call", "put"])
def test_short_positive_expiration_approaches_intrinsic(S, option_type):
    price = black_scholes_price(**{**BASE_INPUTS, "S": S, "T": 1e-8}, option_type=option_type)
    intrinsic = max(0, S - 100) if option_type == "call" else max(0, 100 - S)
    assert isfinite(price)
    assert price >= 0
    # At the money, remaining time value is approximately
    # S*sigma*sqrt(T)/sqrt(2*pi) = 0.000798, so allow $0.001.
    assert price == pytest.approx(intrinsic, rel=0, abs=1e-3)
    if S == 100:
        assert price > 0  # Positive time must retain time value.


@pytest.mark.parametrize("r", [-0.05, 0.0, 0.05])
@pytest.mark.parametrize("option_type", ["call", "put"])
def test_low_positive_volatility_approaches_deterministic_payoff(r, option_type):
    price = black_scholes_price(
        **{**BASE_INPUTS, "r": r, "sigma": 1e-8}, option_type=option_type
    )
    difference = 100 - 100 * exp(-r)
    expected = max(0, difference) if option_type == "call" else max(0, -difference)
    assert isfinite(price)
    assert price >= 0
    # With r=0, residual ATM time value is about $3.99e-7.
    assert price == pytest.approx(expected, rel=0, abs=5e-7)
    if r == 0:
        assert price > 0  # Positive volatility must retain time value.
