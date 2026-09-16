import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SensitivityCharts from "@/components/sensitivity-charts";
import type { SensitivityPoint } from "@/lib/types";
import { baseInputs, sensitivityResponse } from "./sensitivity-fixtures";

// These stubs expose only the props our components hand to Recharts. No SVG,
// layout, animation, responsiveness, or chart-library interactions are tested.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  LineChart: ({ children, data, "aria-label": label }: {
    children: ReactNode; data: unknown[]; "aria-label": string;
  }) => <div data-testid="chart-data" data-points={JSON.stringify(data)} aria-label={label}>{children}</div>,
  Line: ({ dataKey }: { dataKey: string }) => <span data-testid="chart-line" data-key={dataKey} />,
  XAxis: ({ dataKey, tickFormatter, label }: {
    dataKey: string; tickFormatter: (value: number) => string; label: { value: string };
  }) => <span data-testid="x-axis" data-key={dataKey} aria-label={label.value}>{tickFormatter(0.2)}</span>,
  YAxis: ({ domain }: { domain: unknown[] }) => <span data-testid="y-axis" data-domain={JSON.stringify(domain)} />,
  ReferenceDot: ({ x, y }: { x: number; y: number }) => <span data-testid="base-marker" data-x={x} data-y={y} />,
  ReferenceLine: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function chart(title: string) {
  return screen.getByRole("article", { name: title });
}

function plottedPoints(article: HTMLElement): (SensitivityPoint & { displayX: number })[] {
  return JSON.parse(within(article).getByTestId("chart-data").getAttribute("data-points")!);
}

describe("sensitivity visualization mapping", () => {
  it.each([
    ["Option value vs. underlying price", "S", "price"],
    ["Delta vs. underlying price", "S", "delta"],
    ["Gamma vs. underlying price", "S", "gamma"],
    ["Option value vs. volatility", "sigma", "price"],
    ["Option value vs. time to expiration", "T", "price"],
  ] as const)("passes the correct sweep and metric to %s", (title, variable, metric) => {
    const data = sensitivityResponse(baseInputs, 3);
    const original = structuredClone(data);
    render(<SensitivityCharts data={data} inputs={baseInputs} />);

    const article = chart(title);
    const sweep = data.sweeps.find((item) => item.variable === variable)!;
    expect(plottedPoints(article)).toEqual(sweep.points.map((point) => ({
      ...point, displayX: variable === "T" ? point.x * 365 : point.x,
    })));
    expect(within(article).getByTestId("chart-line")).toHaveAttribute("data-key", metric);
    expect(within(article).getByTestId("x-axis")).toHaveAttribute("data-key", "displayX");
    const basePoint = sweep.points.find((point) => point.x === sweep.base_value)!;
    expect(within(article).getByTestId("base-marker")).toHaveAttribute("data-y", String(basePoint[metric]));
    expect(article).toHaveTextContent("3 scenarios");
    expect(data).toEqual(original);
  });

  it("converts years to days for the time axis and current marker without changing raw inputs", () => {
    const data = sensitivityResponse(baseInputs, 3);
    render(<SensitivityCharts data={data} inputs={baseInputs} />);
    const article = chart("Option value vs. time to expiration");

    expect(plottedPoints(article).map(({ x, displayX }) => [x, displayX])).toEqual([
      [0.25, 91.25], [0.5, 182.5], [0.75, 273.75],
    ]);
    expect(within(article).getByTestId("base-marker")).toHaveAttribute("data-x", "182.5");
    expect(within(article).getByTestId("chart-data")).toHaveAccessibleName(
      "Option value vs. time to expiration. Time remaining (days) from 91.25 days to 273.75 days. Use left and right arrow keys to explore.",
    );
    expect(article).toHaveTextContent("Current 182.5 days");
    expect(baseInputs.T).toBe(0.5);
    expect(data.sweeps.find((sweep) => sweep.variable === "T")!.base_value).toBe(0.5);
  });

  it("formats decimal volatility as percentages while leaving plot values in decimal units", () => {
    render(<SensitivityCharts data={sensitivityResponse(baseInputs, 3)} inputs={baseInputs} />);
    const article = chart("Option value vs. volatility");

    expect(plottedPoints(article).map((point) => point.displayX)).toEqual([0.1, 0.2, 0.2 * 1.5]);
    expect(within(article).getByTestId("x-axis")).toHaveTextContent("20%");
    expect(within(article).getByTestId("base-marker")).toHaveAttribute("data-x", "0.2");
    expect(within(article).getByTestId("chart-data")).toHaveAccessibleName(
      "Option value vs. volatility. Annualized volatility (%) from 10.00% to 30.00%. Use left and right arrow keys to explore.",
    );
    expect(article).toHaveTextContent("Current 20.00%");
  });

  it.each([
    ["call", [0, 1]], ["put", [-1, 0]],
  ] as const)("uses the %s Delta display range", (optionType, domain) => {
    const inputs = { ...baseInputs, option_type: optionType };
    render(<SensitivityCharts data={sensitivityResponse(inputs, 3)} inputs={inputs} />);

    expect(within(chart("Delta vs. underlying price")).getByTestId("y-axis"))
      .toHaveAttribute("data-domain", JSON.stringify(domain));
  });
});
