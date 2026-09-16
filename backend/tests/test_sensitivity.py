"""Scenario-layer contracts; the existing pricing engine remains the oracle."""

from math import isfinite
from unittest.mock import patch

import pytest

from app.pricing import sensitivity
from app.pricing.black_scholes import black_scholes_price
from app.pricing.greeks import black_scholes_greeks
from app.schemas import SensitivityRequest


BASE = dict(S=100.0, K=103.0, T=0.75, r=0.025, sigma=0.28, option_type="call")
OUTPUTS = ("price", "delta", "gamma", "vega", "theta", "rho")


@pytest.mark.parametrize("option_type", ["call", "put"])
def test_each_scenario_matches_the_existing_engine(option_type):
    inputs = {**BASE, "option_type": option_type}
    request = SensitivityRequest(**inputs, variables=["S", "sigma", "T"], num_points=21)
    original = request.model_dump()
    response = sensitivity.calculate_sensitivity(request)

    assert [sweep.variable for sweep in response.sweeps] == request.variables
    assert request.model_dump() == original
    for sweep in response.sweeps:
        assert sweep.base_value == inputs[sweep.variable]
        assert any(point.x == sweep.base_value for point in sweep.points)
        xs = [point.x for point in sweep.points]
        assert all(0 < left < right for left, right in zip(xs, xs[1:]))
        for point in sweep.points:
            # Only the swept input changes. Compare every output without copying
            # any financial formulas, including the engine's Greek units.
            scenario = {**inputs, sweep.variable: point.x}
            expected = {
                "price": black_scholes_price(**scenario),
                **black_scholes_greeks(**scenario),
            }
            assert isfinite(point.x)
            assert all(isfinite(getattr(point, field)) for field in OUTPUTS)
            assert {field: getattr(point, field) for field in OUTPUTS} == pytest.approx(
                expected, rel=1e-12, abs=1e-12
            )


@pytest.mark.parametrize("num_points", [21, 81, 201])
def test_requested_count_is_exact_when_anchors_are_on_the_grid(num_points):
    request = SensitivityRequest(
        **{**BASE, "K": 100.0}, variables=["S"], num_points=num_points
    )
    sweep = sensitivity.calculate_sensitivity(request).sweeps[0]

    assert len(sweep.points) == num_points
    assert [point.x for point in sweep.points] == pytest.approx(
        [50 + index * 100 / (num_points - 1) for index in range(num_points)]
    )


@pytest.mark.parametrize(
    "num_points, strike, expected_count",
    [(21, 103.0, 22), (22, 103.0, 24), (22, 100.0, 23), (21, 200.0, 21)],
)
def test_exact_anchors_are_added_once_and_only_within_the_range(
    num_points, strike, expected_count
):
    request = SensitivityRequest(
        **{**BASE, "K": strike}, variables=["S"], num_points=num_points
    )
    xs = [point.x for point in sensitivity.calculate_sensitivity(request).sweeps[0].points]

    # num_points counts uniform samples; off-grid base/strike anchors are extra.
    assert len(xs) == expected_count
    assert xs == sorted(set(xs))
    assert xs.count(BASE["S"]) == 1
    assert xs.count(strike) == (1 if 50 <= strike <= 150 else 0)
    for index in range(num_points):
        expected_x = 50 + index * 100 / (num_points - 1)
        assert any(x == pytest.approx(expected_x, rel=1e-12) for x in xs)


@pytest.mark.parametrize("variable", ["sigma", "T"])
@pytest.mark.parametrize("num_points", [21, 81, 201])
def test_volatility_and_time_keep_requested_samples_plus_the_base(variable, num_points):
    request = SensitivityRequest(**BASE, variables=[variable], num_points=num_points)
    xs = [point.x for point in sensitivity.calculate_sensitivity(request).sweeps[0].points]
    low, high = (0.07, 0.56) if variable == "sigma" else (1 / 365, 1.5)

    # These grids do not include the base value, so exactly one anchor is added.
    assert len(xs) == num_points + 1
    assert xs[0] == pytest.approx(low)
    assert xs[-1] == pytest.approx(high)
    assert xs.count(BASE[variable]) == 1
    for index in range(num_points):
        expected_x = low + (high - low) * index / (num_points - 1)
        assert any(x == pytest.approx(expected_x, rel=1e-12) for x in xs)


def test_call_price_increases_with_underlying():
    request = SensitivityRequest(**BASE, variables=["S"], num_points=81)
    prices = [point.price for point in sensitivity.calculate_sensitivity(request).sweeps[0].points]

    assert prices[-1] > prices[0]
    assert all(right >= left - 1e-12 for left, right in zip(prices, prices[1:]))


@pytest.mark.parametrize("option_type, lower, upper", [("call", 0, 1), ("put", -1, 0)])
def test_delta_bounds_and_nonnegative_gamma(option_type, lower, upper):
    request = SensitivityRequest(
        **{**BASE, "option_type": option_type}, variables=["S", "sigma", "T"], num_points=21
    )
    for sweep in sensitivity.calculate_sensitivity(request).sweeps:
        for point in sweep.points:
            assert lower <= point.delta <= upper
            assert point.gamma >= 0


@pytest.mark.parametrize("option_type", ["call", "put"])
def test_option_value_increases_with_volatility(option_type):
    request = SensitivityRequest(
        **{**BASE, "option_type": option_type}, variables=["sigma"], num_points=81
    )
    prices = [point.price for point in sensitivity.calculate_sensitivity(request).sweeps[0].points]

    assert prices[-1] > prices[0]
    assert all(right >= left - 1e-12 for left, right in zip(prices, prices[1:]))


@pytest.mark.parametrize("maturity", [1.0, 1 / 365, 1e-8])
def test_time_sweeps_only_call_the_engine_with_positive_years(maturity):
    inputs = {**BASE, "T": maturity}
    request = SensitivityRequest(**inputs, variables=["T"], num_points=21)
    with (
        patch.object(sensitivity, "black_scholes_price", wraps=black_scholes_price) as price,
        patch.object(sensitivity, "black_scholes_greeks", wraps=black_scholes_greeks) as greeks,
    ):
        points = sensitivity.calculate_sensitivity(request).sweeps[0].points

    assert points[0].x == pytest.approx(min(1 / 365, maturity * 0.01), rel=1e-12, abs=0)
    assert points[-1].x == pytest.approx(2 * maturity, rel=1e-12, abs=0)
    for engine in (price, greeks):
        assert engine.call_count == len(points)
        for call, point in zip(engine.call_args_list, points):
            assert call.kwargs == {**inputs, "T": point.x}
            assert call.kwargs["T"] > 0


@pytest.mark.parametrize(
    "variable, value",
    [("S", 1.7e308), ("sigma", 1e308), ("T", 1e308),
     ("S", 5e-324), ("sigma", 5e-324), ("T", 5e-324)],
)
def test_overflowed_or_underflowed_ranges_are_rejected_before_valuation(variable, value):
    request = SensitivityRequest(**{**BASE, variable: value}, variables=[variable])
    with patch.object(sensitivity, "black_scholes_price") as price:
        with pytest.raises(ValueError, match="supported numerical range"):
            sensitivity.calculate_sensitivity(request)
    price.assert_not_called()


@pytest.mark.parametrize("engine", ["black_scholes_price", "black_scholes_greeks"])
@pytest.mark.parametrize("error", [OverflowError("overflow"), ValueError("invalid input")])
def test_engine_errors_become_readable_sensitivity_errors(engine, error):
    request = SensitivityRequest(**BASE, variables=["S"])
    with patch.object(sensitivity, engine, side_effect=error):
        with pytest.raises(ValueError, match="supported numerical range"):
            sensitivity.calculate_sensitivity(request)


@pytest.mark.parametrize("field", OUTPUTS)
@pytest.mark.parametrize("value", [float("inf"), float("nan")])
def test_nonfinite_engine_outputs_are_rejected(field, value):
    request = SensitivityRequest(**BASE, variables=["S"])
    engine = "black_scholes_price" if field == "price" else "black_scholes_greeks"
    result = value if field == "price" else {**black_scholes_greeks(**BASE), field: value}
    with patch.object(sensitivity, engine, return_value=result):
        with pytest.raises(ValueError, match="non-finite result"):
            sensitivity.calculate_sensitivity(request)
