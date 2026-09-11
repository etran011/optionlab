"""Reference, financial-identity, and numerical checks for European Greeks."""

from math import exp, isfinite

import pytest

from app.pricing.black_scholes import black_scholes_price
from app.pricing.greeks import black_scholes_greeks


BASE_INPUTS = dict(S=100.0, K=100.0, T=1.0, r=0.05, sigma=0.2)
GREEKS = ("delta", "gamma", "vega", "theta", "rho")
REL_TOL = 1e-10
ABS_TOL = 1e-12

# Independently verified using 65-digit Decimal arithmetic, a normal-CDF
# power series, and centered derivatives of the price (step 1e-10).
# Gamma uses the second price difference. Vega/Rho are scaled by 0.01 and
# Theta by -1/365. Neither app functions nor SciPy supplied these constants;
# expected values are fixed here, not recalculated by the code under test.
REFERENCE_VALUES = [
    pytest.param(
        "call",
        {
            "delta": 0.636830651175619071,
            "gamma": 0.018762017345846894,
            "vega": 0.375240346916937878,
            "theta": -0.017572678209419715,
            "rho": 0.532324815453763403,
        },
        id="call",
    ),
    pytest.param(
        "put",
        {
            "delta": -0.363169348824380929,
            "gamma": 0.018762017345846894,
            "vega": 0.375240346916937878,
            "theta": -0.004542138147766098,
            "rho": -0.418904609046950606,
        },
        id="put",
    ),
]

# Price differences use moderate cases to avoid subtracting nearly identical
# deep-ITM prices to estimate a vanishing Gamma. Analytical relationships also
# cover extreme cases below, where finite differences are poorly conditioned.
SCENARIOS = [
    pytest.param(BASE_INPUTS, id="at-the-money"),
    pytest.param(
        dict(S=120.0, K=100.0, T=2.0, r=0.03, sigma=0.35), id="above-strike"
    ),
    pytest.param(
        dict(S=80.0, K=100.0, T=0.5, r=0.03, sigma=0.35), id="below-strike"
    ),
    pytest.param({**BASE_INPUTS, "r": -0.05}, id="negative-rate"),
    pytest.param({**BASE_INPUTS, "r": 0.0}, id="zero-rate"),
    pytest.param({**BASE_INPUTS, "T": 1 / 365}, id="one-day-to-expiration"),
    pytest.param({**BASE_INPUTS, "r": 0.0, "sigma": 0.01}, id="low-volatility"),
]
ALL_SCENARIOS = SCENARIOS + [
    pytest.param({**BASE_INPUTS, "S": 1000.0}, id="deep-call-itm"),
    pytest.param({**BASE_INPUTS, "S": 10.0}, id="deep-put-itm"),
    pytest.param({**BASE_INPUTS, "T": 1e-8}, id="near-expiration"),
    pytest.param({**BASE_INPUTS, "sigma": 1e-8}, id="near-zero-volatility"),
]


@pytest.mark.parametrize("option_type, expected", REFERENCE_VALUES)
@pytest.mark.parametrize("greek", GREEKS)
def test_known_reference_values(option_type, expected, greek):
    actual = black_scholes_greeks(**BASE_INPUTS, option_type=option_type)
    assert actual[greek] == pytest.approx(expected[greek], rel=REL_TOL, abs=ABS_TOL)


@pytest.mark.parametrize("inputs", ALL_SCENARIOS)
@pytest.mark.parametrize("option_type", ["call", "put"])
def test_greek_signs_and_ranges(inputs, option_type):
    greeks = black_scholes_greeks(**inputs, option_type=option_type)
    assert set(greeks) == set(GREEKS)
    assert all(isinstance(value, float) and isfinite(value) for value in greeks.values())

    # Long options have nonnegative convexity and volatility sensitivity.
    assert greeks["gamma"] >= 0
    assert greeks["vega"] >= 0
    rho_bound = inputs["K"] * inputs["T"] * exp(-inputs["r"] * inputs["T"]) / 100
    if option_type == "call":
        assert 0 <= greeks["delta"] <= 1
        assert 0 <= greeks["rho"] <= rho_bound
    else:
        assert -1 <= greeks["delta"] <= 0
        assert -rho_bound <= greeks["rho"] <= 0
    # Theta has no universal sign; explicit cases are checked separately.


@pytest.mark.parametrize("inputs", ALL_SCENARIOS)
@pytest.mark.parametrize("greek", ["gamma", "vega"])
def test_call_put_gamma_and_vega_are_equal(inputs, greek):
    call = black_scholes_greeks(**inputs, option_type="call")
    put = black_scholes_greeks(**inputs, option_type="put")
    assert call[greek] == pytest.approx(put[greek], rel=REL_TOL, abs=ABS_TOL)


@pytest.mark.parametrize("inputs", ALL_SCENARIOS)
@pytest.mark.parametrize("greek", ["delta", "theta", "rho"])
def test_greeks_obey_differentiated_put_call_parity(inputs, greek):
    call = black_scholes_greeks(**inputs, option_type="call")
    put = black_scholes_greeks(**inputs, option_type="put")
    discounted_strike = inputs["K"] * exp(-inputs["r"] * inputs["T"])
    # Differentiate C - P = S - K*exp(-r*T), using the output display units.
    expected_difference = {
        "delta": 1.0,
        "theta": -inputs["r"] * discounted_strike / 365,
        "rho": inputs["T"] * discounted_strike / 100,
    }[greek]
    assert call[greek] - put[greek] == pytest.approx(
        expected_difference, rel=REL_TOL, abs=ABS_TOL
    )


@pytest.mark.parametrize(
    "option_type, overrides, expected_sign",
    [
        pytest.param("call", {}, -1, id="atm-call-decay"),
        pytest.param("put", {}, -1, id="atm-put-decay"),
        pytest.param("call", {"r": 0.0}, -1, id="zero-rate-call-decay"),
        pytest.param("put", {"r": 0.0}, -1, id="zero-rate-put-decay"),
        pytest.param("put", {"S": 50.0}, 1, id="itm-put-positive-theta"),
        pytest.param(
            "call", {"S": 200.0, "r": -0.05}, 1, id="negative-rate-itm-call-positive-theta"
        ),
    ],
)
def test_theta_sign_depends_on_carry_and_moneyness(option_type, overrides, expected_sign):
    greeks = black_scholes_greeks(**{**BASE_INPUTS, **overrides}, option_type=option_type)
    assert expected_sign * greeks["theta"] > 0


@pytest.mark.parametrize("inputs", SCENARIOS)
@pytest.mark.parametrize("option_type", ["call", "put"])
@pytest.mark.parametrize(
    "greek, parameter, step, scale",
    [
        pytest.param("delta", "S", 1e-5, 1.0, id="delta-dprice-dS"),
        pytest.param("gamma", "S", 1e-5, 1.0, id="gamma-d2price-dS2"),
        pytest.param("vega", "sigma", 1e-4, 0.01, id="vega-per-percentage-point"),
        pytest.param("theta", "T", 1e-4, -1 / 365, id="theta-per-calendar-day"),
        pytest.param("rho", "r", 1e-5, 0.01, id="rho-per-percentage-point"),
    ],
)
def test_greeks_match_price_finite_differences(
    inputs, option_type, greek, parameter, step, scale
):
    # Relative bumps keep positive inputs positive even near expiration.
    # Rates use an absolute bump, which also works at zero and negative rates.
    h = step if parameter == "r" else inputs[parameter] * step
    plus = black_scholes_price(
        **{**inputs, parameter: inputs[parameter] + h}, option_type=option_type
    )
    minus = black_scholes_price(
        **{**inputs, parameter: inputs[parameter] - h}, option_type=option_type
    )
    if greek == "gamma":
        center = black_scholes_price(**inputs, option_type=option_type)
        numerical = (plus - 2 * center + minus) / h**2
        # A second difference amplifies cancellation by 1/h**2.
        rel_tol, abs_tol = 2e-6, 2e-8
    else:
        numerical = (plus - minus) / (2 * h) * scale
        # Centered differences have O(h**2) truncation error, plus roundoff.
        rel_tol, abs_tol = 1e-6, 1e-9

    actual = black_scholes_greeks(**inputs, option_type=option_type)[greek]
    assert actual == pytest.approx(numerical, rel=rel_tol, abs=abs_tol)


@pytest.mark.parametrize("parameter", ["S", "K", "T", "sigma"])
@pytest.mark.parametrize("value", [0.0, -1.0, -1e-12])
@pytest.mark.parametrize("option_type", ["call", "put"])
def test_nonpositive_inputs_match_pricing_validation(parameter, value, option_type):
    inputs = {**BASE_INPUTS, parameter: value}
    for function in (black_scholes_price, black_scholes_greeks):
        with pytest.raises(ValueError, match=rf"^{parameter} must be positive$"):
            function(**inputs, option_type=option_type)


@pytest.mark.parametrize(
    "option_type", ["", "invalid", "CALL", "PUT", "Call", "Put", " call", "put ", None, 1]
)
def test_invalid_option_types_match_pricing_validation(option_type):
    for function in (black_scholes_price, black_scholes_greeks):
        with pytest.raises(
            ValueError, match='^option_type must be either "call" or "put"$'
        ):
            function(**BASE_INPUTS, option_type=option_type)
