"""Scenario sampling that delegates every valuation to the existing engine."""

from math import isfinite

from ..schemas import SensitivityPoint, SensitivityRequest, SensitivityResponse, SensitivitySweep
from .black_scholes import black_scholes_price
from .greeks import black_scholes_greeks


def calculate_sensitivity(request: SensitivityRequest) -> SensitivityResponse:
    """Sweep one input at a time; never round inputs or calculated outputs.

    Use 50–150% of spot, 25–200% of volatility, and near-expiry to twice
    the base maturity. Time stays in years, with a strictly positive lower
    bound (one day, or 1% of maturity for short-dated options).
    """
    base = request.model_dump(exclude={"variables", "num_points"})
    ranges = {
        "S": (request.S * 0.5, request.S * 1.5),
        "sigma": (request.sigma * 0.25, request.sigma * 2),
        "T": (min(1 / 365, request.T * 0.01), request.T * 2),
    }
    sweeps = []
    for variable in request.variables:
        low, high = ranges[variable]
        if not (isfinite(low) and isfinite(high) and 0 < low < high):
            raise ValueError("These inputs exceed the supported numerical range for sensitivity analysis.")
        values = {
            low + (high - low) * (index / (request.num_points - 1))
            for index in range(request.num_points)
        }
        # Exact anchors make the current valuation and ATM scenario inspectable.
        values.add(base[variable])
        if variable == "S" and low <= request.K <= high:
            values.add(request.K)

        points = []
        for value in sorted(values):
            scenario = {**base, variable: value}
            try:
                price = black_scholes_price(**scenario)
                greeks = black_scholes_greeks(**scenario)
            except (ArithmeticError, ValueError) as exc:
                raise ValueError(
                    "These inputs exceed the supported numerical range for sensitivity analysis."
                ) from exc
            if not all(isfinite(output) for output in (price, *greeks.values())):
                raise ValueError("Sensitivity analysis produced a non-finite result. Review the model inputs.")
            points.append(SensitivityPoint(x=value, price=price, **greeks))
        sweeps.append(SensitivitySweep(variable=variable, base_value=base[variable], points=points))
    return SensitivityResponse(sweeps=sweeps)
