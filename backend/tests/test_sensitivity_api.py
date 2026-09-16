"""HTTP validation, serialization, and error handling for POST /sensitivity."""

from math import isfinite

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pricing.black_scholes import black_scholes_price
from app.pricing.greeks import black_scholes_greeks


BASE = dict(S=100.0, K=100.0, T=0.5, r=0.03, sigma=0.2, option_type="call")


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("option_type", ["call", "put"])
@pytest.mark.parametrize(
    "variable, metric",
    [("S", "price"), ("S", "delta"), ("S", "gamma"), ("sigma", "price"), ("T", "price")],
    ids=["price-vs-spot", "delta-vs-spot", "gamma-vs-spot", "price-vs-volatility", "price-vs-time"],
)
def test_valid_sweeps_return_ordered_finite_model_values(client, option_type, variable, metric):
    inputs = {**BASE, "option_type": option_type}
    response = client.post("/sensitivity", json={**inputs, "variables": [variable], "num_points": 21})

    assert response.status_code == 200
    sweeps = response.json()["sweeps"]
    assert len(sweeps) == 1
    sweep = sweeps[0]
    assert sweep["variable"] == variable
    assert sweep["base_value"] == inputs[variable]
    points = sweep["points"]
    assert len(points) == (21 if variable == "S" else 22)
    xs = [point["x"] for point in points]
    assert xs[0] > 0
    assert xs == sorted(set(xs))
    assert sweep["base_value"] in xs
    for point in points:
        assert set(point) == {"x", "price", "delta", "gamma", "vega", "theta", "rho"}
        assert all(isinstance(value, (int, float)) and isfinite(value) for value in point.values())
    for point in (points[0], next(p for p in points if p["x"] == inputs[variable]), points[-1]):
        scenario = {**inputs, variable: point["x"]}
        expected = black_scholes_price(**scenario) if metric == "price" else black_scholes_greeks(**scenario)[metric]
        assert point[metric] == pytest.approx(expected, rel=1e-12, abs=1e-12)


def test_batch_preserves_requested_variables_and_default_count(client):
    response = client.post("/sensitivity", json={**BASE, "variables": ["T", "S", "sigma"]})

    assert response.status_code == 200
    sweeps = response.json()["sweeps"]
    assert [sweep["variable"] for sweep in sweeps] == ["T", "S", "sigma"]
    assert [len(sweep["points"]) for sweep in sweeps] == [82, 81, 82]


@pytest.mark.parametrize("num_points", [21, 201])
def test_sample_count_boundaries_are_accepted(client, num_points):
    response = client.post("/sensitivity", json={**BASE, "variables": ["S"], "num_points": num_points})

    assert response.status_code == 200
    assert len(response.json()["sweeps"][0]["points"]) == num_points


@pytest.mark.parametrize("variables", [["K"], ["r"], ["delta"], ["S", "unsupported"], [], ["S", "S"], ["S", "sigma", "T", "S"]])
def test_unsupported_empty_duplicate_or_excess_variables_are_rejected(client, variables):
    response = client.post("/sensitivity", json={**BASE, "variables": variables})

    assert response.status_code == 422
    assert any(issue["loc"][:2] == ["body", "variables"] for issue in response.json()["detail"])


@pytest.mark.parametrize("num_points", [-1, 0, 1, 20, 202, 1_000_000, 21.5, "81", True, None])
def test_invalid_sample_counts_are_rejected(client, num_points):
    response = client.post("/sensitivity", json={**BASE, "variables": ["S"], "num_points": num_points})

    assert response.status_code == 422
    assert any(issue["loc"] == ["body", "num_points"] for issue in response.json()["detail"])


@pytest.mark.parametrize("field", ["S", "K", "T", "sigma"])
@pytest.mark.parametrize("value", [0, -0.1, "NaN", "Infinity"])
def test_invalid_base_inputs_cannot_create_a_sweep_range(client, field, value):
    response = client.post("/sensitivity", json={**BASE, field: value, "variables": ["S", "sigma", "T"]})

    assert response.status_code == 422
    assert any(issue["loc"] == ["body", field] for issue in response.json()["detail"])


@pytest.mark.parametrize("variable, value", [("S", 1.7e308), ("sigma", 1e308), ("T", 1e308), ("T", 5e-324)])
def test_unrepresentable_ranges_return_readable_422_errors(client, variable, value):
    # Ranges are derived from the base inputs; there are no custom min/max fields.
    response = client.post("/sensitivity", json={**BASE, variable: value, "variables": [variable]})

    assert response.status_code == 422
    assert "supported numerical range" in response.json()["detail"]


def test_engine_overflow_is_reported_as_422_instead_of_server_error(client):
    response = client.post("/sensitivity", json={**BASE, "r": -2000, "variables": ["S"]})

    assert response.status_code == 422
    assert "supported numerical range" in response.json()["detail"]
