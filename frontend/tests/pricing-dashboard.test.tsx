import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingRequest, SensitivityResponse } from "@/lib/types";
import { PricingDashboard } from "@/components/pricing-dashboard";
import { deferred, sensitivityResponse } from "./sensitivity-fixtures";

const { charts } = vi.hoisted(() => ({ charts: vi.fn() }));

// Preserve the lazy component boundary without involving Next's bundler.
vi.mock("next/dynamic", async () => {
  const { lazy, Suspense } = await import("react");
  return {
    default: (loader: Parameters<typeof lazy>[0]) => {
      const Component = lazy(loader);
      return function DynamicComponent(props: Record<string, unknown>) {
        return <Suspense fallback={null}><Component {...props} /></Suspense>;
      };
    },
  };
});

vi.mock("@/components/sensitivity-charts", () => ({
  default: (props: { data: SensitivityResponse; inputs: PricingRequest }) => {
    charts(props);
    return <div data-testid="sensitivity-visualization">Sensitivity visualization</div>;
  },
}));

const defaultInputs: PricingRequest = {
  S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, option_type: "call",
};

function mockRequests(analytics: Promise<Response>) {
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/sensitivity") return analytics;
    if (url === "/api/price") return Promise.resolve(Response.json({ price: 10.45 }));
    if (url === "/api/greeks") return Promise.resolve(Response.json({
      delta: 0.64, gamma: 0.02, vega: 0.38, theta: -0.02, rho: 0.53,
    }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function analyticsSection() {
  return screen.getByRole("region", { name: "Analytics / Sensitivity" });
}

beforeEach(() => { charts.mockClear(); });

describe("sensitivity form integration", () => {
  it.each(["call", "put"] as const)("submits %s base parameters with decimal percentages and unchanged years", async (optionType) => {
    const user = userEvent.setup();
    const inputs: PricingRequest = {
      S: 123.45, K: 115.5, T: 0.375, r: -0.0125, sigma: 0.275, option_type: optionType,
    };
    const response = sensitivityResponse(inputs);
    const fetchMock = mockRequests(Promise.resolve(Response.json(response)));
    render(<PricingDashboard />);

    for (const [label, value] of [
      [/Underlying Price/, "123.45"], [/Strike Price/, "115.5"],
      [/Time to Expiration/, "0.375"], [/Risk-Free Rate/, "-1.25"], [/Volatility/, "27.5"],
    ] as const) {
      const input = screen.getByRole("spinbutton", { name: label });
      await user.clear(input);
      await user.type(input, value);
    }
    await user.click(screen.getByRole("radio", { name: optionType === "call" ? "Call" : "Put" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    await screen.findByTestId("sensitivity-visualization");
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/sensitivity");
    expect(calls).toHaveLength(1);
    const options = calls[0][1]!;
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body as string)).toEqual({
      ...inputs, variables: ["S", "sigma", "T"], num_points: 81,
    });
    expect(charts).toHaveBeenLastCalledWith({ data: response, inputs });
    expect(analyticsSection()).toHaveTextContent("0.375 years · r -1.25% · σ 27.50%");
  });

  it("shows sensitivity loading independently until the pending request completes", async () => {
    const pending = deferred<Response>();
    mockRequests(pending.promise);
    const user = userEvent.setup();
    render(<PricingDashboard />);
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    await screen.findByText("Calculation complete");
    expect(analyticsSection()).toHaveAttribute("aria-busy", "true");
    expect(within(analyticsSection()).getByRole("status")).toHaveTextContent("Calculating sensitivity curves…");
    expect(screen.getByRole("button", { name: "Refresh analytics" })).toBeDisabled();
    expect(charts).not.toHaveBeenCalled();

    const data = sensitivityResponse(defaultInputs);
    await act(async () => { pending.resolve(Response.json(data)); });
    await screen.findByTestId("sensitivity-visualization");
    expect(analyticsSection()).toHaveAttribute("aria-busy", "false");
    expect(within(analyticsSection()).getByRole("status")).toHaveTextContent("Curves reflect your last calculation.");
    expect(screen.getByRole("button", { name: "Refresh analytics" })).toBeEnabled();
    expect(charts).toHaveBeenLastCalledWith({ data, inputs: defaultInputs });
  });

  it.each([
    { name: "backend error", body: { detail: "These inputs exceed the supported numerical range." }, expected: "These inputs exceed the supported numerical range." },
    { name: "validation error", body: { detail: [{ loc: ["body", "num_points"], msg: "Input should be less than or equal to 201" }] }, expected: "Number of samples: Input should be less than or equal to 201" },
    { name: "malformed success", body: { sweeps: [] }, expected: "The pricing service returned an invalid response. Please try again." },
  ])("displays a clear $name and allows analytics-only retry", async ({ name, body, expected }) => {
    const fetchMock = mockRequests(Promise.resolve(Response.json(body, { status: name === "malformed success" ? 200 : 422 })));
    const user = userEvent.setup();
    render(<PricingDashboard />);
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    const alert = await within(analyticsSection()).findByRole("alert");
    expect(alert).toHaveTextContent(`Sensitivity analysis: ${expected}`);
    expect(analyticsSection()).toHaveAttribute("aria-busy", "false");
    expect(charts).not.toHaveBeenCalled();
    await screen.findByText("Calculation complete");

    fetchMock.mockResolvedValueOnce(Response.json(sensitivityResponse(defaultInputs)));
    await user.click(screen.getByRole("button", { name: "Retry analytics" }));
    await screen.findByTestId("sensitivity-visualization");
    expect(within(analyticsSection()).queryByRole("alert")).not.toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.filter(([url]) => url === "/api/price")).toHaveLength(1);
    expect(calls.filter(([url]) => url === "/api/greeks")).toHaveLength(1);
    const analyticsCalls = calls.filter(([url]) => url === "/api/sensitivity");
    expect(analyticsCalls).toHaveLength(2);
    expect(analyticsCalls[1][1]?.body).toBe(analyticsCalls[0][1]?.body);
  });

  it("displays connection failures as an actionable error", async () => {
    const pending = deferred<Response>();
    mockRequests(pending.promise);
    const user = userEvent.setup();
    render(<PricingDashboard />);
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await act(async () => { pending.reject(new TypeError("Failed to fetch")); });

    expect(await within(analyticsSection()).findByRole("alert")).toHaveTextContent(
      "Sensitivity analysis: Unable to reach the application. Check your connection and try again.",
    );
  });

  it("cancels and ignores stale sensitivity data when a base input changes", async () => {
    const pending = deferred<Response>();
    mockRequests(pending.promise);
    const user = userEvent.setup();
    render(<PricingDashboard />);
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByText("Calculation complete");
    const signal = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/sensitivity")![1]!.signal!;

    await user.clear(screen.getByRole("spinbutton", { name: /Underlying Price/ }));
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(Response.json(sensitivityResponse(defaultInputs))); });
    expect(charts).not.toHaveBeenCalled();
    expect(analyticsSection()).toHaveAttribute("aria-busy", "false");
    expect(within(analyticsSection()).getByRole("status")).toHaveTextContent("Calculate a valuation to explore its sensitivities.");
    expect(screen.getByRole("button", { name: "Refresh analytics" })).toBeDisabled();
  });

  it("does not submit an invalid form", async () => {
    const fetchMock = mockRequests(Promise.resolve(Response.json(sensitivityResponse(defaultInputs))));
    const user = userEvent.setup();
    render(<PricingDashboard />);
    await user.clear(screen.getByRole("spinbutton", { name: /Volatility/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Volatility/ }), "0");

    const calculate = screen.getByRole("button", { name: "Calculate" });
    expect(calculate).toBeDisabled();
    await user.click(calculate);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
