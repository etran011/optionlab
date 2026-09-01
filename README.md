# Option Pricing Web App (no working name)

## Minimum Viable Product Goals:

Build a web app which allows a user to input:

- Stock price
- Strike price
- Time to expiration
- Volatility
- Risk-free interest rate
- Call or put

Application will be able to calculate:

- Black-Scholes option price

## Potential future additions/features:

- Greeks
- Interactive charts
- Implied volatility
- Binomial pricing
- Monte Carlo simulation
- PostgreSQL pricing history

## Project structure

option-pricer-web-app/
├── README.md
├── .gitignore
└── backend/
    ├── pyproject.toml
    ├── app/
    │   ├── __init__.py
    │   ├── main.py
    │   ├── schemas.py
    │   └── pricing/
    │       ├── __init__.py
    │       └── black_scholes.py
    └── tests/
        ├── test_api.py
        └── test_black_scholes.py

- backend/
Keeps the Python backend separate from a future frontend. A sibling frontend/ folder can be added later without reorganizing the backend.

- backend/pyproject.toml
Defines the Python project, supported Python version, and dependencies such as FastAPI, Uvicorn, SciPy, and pytest. It can also hold configuration for formatting and testing tools, avoiding several separate config files.

- backend/app/
Contains the importable application code.

- backend/app/__init__.py
Marks app as a Python package. It can remain empty.

- backend/app/main.py
Creates the FastAPI application and defines the initial HTTP endpoints. At first, this might only contain a health endpoint; later it could expose something like POST /price.

- backend/app/schemas.py
Contains Pydantic request and response models. Eventually, these would validate inputs such as stock price, strike price, time to expiration, volatility, interest rate, and option type.

- backend/app/pricing/
Holds pricing-domain code independently of FastAPI. This separation is important: the pricing engine should accept ordinary Python values and return a result without knowing anything about HTTP or JSON.

- backend/app/pricing/__init__.py
Marks the pricing directory as a Python package. It can initially remain empty.

- backend/app/pricing/black_scholes.py
Eventually contains the Black–Scholes calculation and its input validation. Keeping it in a dedicated module leaves room for later additions such as binomial.py and monte_carlo.py.

- backend/tests/test_api.py
Tests FastAPI behavior: endpoint status codes, request validation, and response shape.

- backend/tests/test_black_scholes.py
Tests the pricing engine separately using known call and put values, boundary cases, and invalid inputs.