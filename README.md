# OptionLab

OptionLab is a web workspace for pricing European call and put options on a non-dividend-paying stock. It combines a Next.js/React interface with a Python/FastAPI backend that performs Black–Scholes pricing, Greek calculations, implied-volatility solving, and sensitivity sweeps.

## Features

- Calculate theoretical option value and Delta, Gamma, Vega, Theta, and Rho.
- Recover implied volatility from an entered market price using SciPy's Brent solver.
- Explore five sensitivity charts: value, Delta, and Gamma versus underlying price; value versus volatility; and value versus time to expiration.
- Refresh analytics independently, with loading states, input validation, and service errors displayed in the interface.
- Switch between persistent light and dark themes in a responsive layout.

The model assumes European exercise, no dividends, constant annualized volatility, and a continuously compounded risk-free rate. Inputs are entered manually; the app has no live market-data feed, accounts, or database. It does not implement American exercise or alternative pricing models.

## Prerequisites

- Python **3.12** (the backend specifies `>=3.12,<3.13`).
- Node.js **20.9 or newer** and npm, as specified by the frontend package.
- Git to clone the repository.

The commands below use a POSIX shell (macOS/Linux). On Windows, use the equivalent virtual-environment executable under `.venv\Scripts`.

## Setup

```bash
git clone https://github.com/etran011/optionlab.git
cd optionlab

cd backend
python3.12 -m venv .venv
./.venv/bin/python -m pip install -e '.[test]'

cd ../frontend
npm ci
cp -n .env.example .env.local
```

The copy preserves an existing `.env.local`. Set its backend address as needed:

```dotenv
API_BASE_URL=http://127.0.0.1:8000
```

`API_BASE_URL` is read by the Next.js server. Do not prefix it with `NEXT_PUBLIC_`. Restart Next.js after changing it. In a deployed environment, the address must be reachable from the Next.js server.

## Run locally

Start both services in separate terminals, beginning at the repository root.

Backend:

```bash
cd backend
./.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [the app](http://127.0.0.1:3000). FastAPI provides [interactive API docs](http://127.0.0.1:8000/docs) and a [health endpoint](http://127.0.0.1:8000/health). Stop each service with Ctrl+C. If pricing cannot connect, check that FastAPI is running and `API_BASE_URL` matches its address.

## Commands and checks

Run backend tests from `backend/` after installing the `test` extra above:

```bash
./.venv/bin/python -m pytest -q
```

Run frontend commands from `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm test` | Run Vitest tests once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Generate Next.js route types and run TypeScript checks |
| `npm run build` | Build the production frontend |
| `npm start` | Serve the production build (run `build` first) |

Backend tests cover pricing, Greeks, implied volatility, sensitivity calculations, and API behavior. Frontend tests cover sensitivity response handling, dashboard requests, and chart mapping using Vitest, React Testing Library, and jsdom. They do not require running services.

A production frontend still needs the FastAPI service and `API_BASE_URL`. The Next.js API proxy requires a server runtime; this is not a static export. There is no lint script in the current package.

## Architecture and API

```text
frontend/     Next.js App Router, React, TypeScript, Recharts, CSS
backend/      FastAPI, Pydantic schemas, SciPy pricing engine, pytest tests

Browser → Next.js /api/{endpoint} → FastAPI → Python pricing engine
```

The browser uses same-origin requests. The Next.js route allows only the four calculation endpoints below and forwards requests to FastAPI; quantitative calculations remain in Python.

| FastAPI route | Result |
| --- | --- |
| `GET /health` | Service status |
| `POST /price` | Black–Scholes price |
| `POST /greeks` | Delta, Gamma, Vega, Theta, Rho |
| `POST /implied-volatility` | Annualized implied volatility as a decimal |
| `POST /sensitivity` | Independent sweeps of underlying price, volatility, or remaining time |

See `/docs` for request and response schemas. Pricing inputs are `S`, `K`, `T`, `r`, `sigma`, and `option_type` (`call` or `put`). Implied volatility replaces `sigma` with `market_price`. Sensitivity adds `variables` (a subset of `S`, `sigma`, `T`) and optional `num_points` (21–201, default 81). Exact base values and an in-range strike can add points beyond that sample count.

The UI requests all three sweeps when calculating and plots five charts from them. Each sweep varies one input while holding the others fixed. Curves are sampled model outputs, not market observations.

## Units and model limits

- The UI labels prices as USD per share, without a contract multiplier; the backend requires consistent currency units.
- Time to expiration is entered and sent in years and must be positive.
- The UI accepts rate and volatility percentages (for example, `5` and `20`); the API accepts decimals (`0.05` and `0.20`). Rates may be zero or negative; volatility must be positive.
- Vega and Rho are per one percentage-point change. Theta is per calendar day using a 365-day year. Delta is per unit of underlying price; Gamma is the change in Delta per unit of underlying price.
- Implied volatility is returned as a decimal and displayed as both a decimal and percentage. The solver searches the fixed decimal-volatility interval `[1e-8, 5.0]` and rejects prices on or outside the no-arbitrage bounds or without a solution in that interval.
