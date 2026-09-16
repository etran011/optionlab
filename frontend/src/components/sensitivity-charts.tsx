"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, percentage, sensitivity } from "@/lib/format";
import type { PricingRequest, SensitivityResponse, SensitivitySweep } from "@/lib/types";

type Metric = "price" | "delta" | "gamma";
const axisNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, notation: "compact" });
const days = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const scientific = new Intl.NumberFormat("en-US", { notation: "scientific", maximumFractionDigits: 2 });
const axisPercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function compact(value: number): string {
  return value !== 0 && Math.abs(value) < 0.001 ? scientific.format(value) : axisNumber.format(value);
}

function metricValue(value: number, metric: Metric): string {
  if (value !== 0 && Math.abs(value) < (metric === "price" ? 0.0001 : 0.000001)) {
    return `${metric === "price" ? "$" : ""}${scientific.format(value)}`;
  }
  return (metric === "price" ? money : sensitivity).format(value);
}

function SweepChart({ sweep, metric, title, description, inputs, featured = false }: {
  sweep: SensitivitySweep;
  metric: Metric;
  title: string;
  description: string;
  inputs: PricingRequest;
  featured?: boolean;
}) {
  const { variable, base_value, points } = sweep;
  // Display conversion only. The model and API always use years for T.
  const displayX = (x: number) => variable === "T" ? x * 365 : x;
  const data = points.map((point) => ({ ...point, displayX: displayX(point.x) }));
  const basePoint = points.find((point) => point.x === base_value)!;
  const start = points[0].x;
  const end = points[points.length - 1].x;
  const showStrike = variable === "S" && inputs.K >= start && inputs.K <= end;
  const sameStrike = variable === "S" && inputs.K === base_value;
  const metricLabel = metric === "price" ? "Option value" : metric === "delta" ? "Delta" : "Gamma";
  const yLabel = metric === "price" ? "Option value · USD / share" : metric === "delta" ? "Delta · value change / $1 move" : "Gamma · Delta change / $1 move";
  const xLabel = variable === "S" ? "Underlying price (USD)" : variable === "sigma" ? "Annualized volatility (%)" : "Time remaining (days)";
  const formatX = (value: number) => {
    if (variable === "S") return metricValue(value, "price");
    if (variable === "sigma") return value < 0.000001 ? `${scientific.format(value * 100)}%` : percentage.format(value);
    return `${value !== 0 && value < 0.001 ? scientific.format(value) : days.format(value)} ${value === 1 ? "day" : "days"}`;
  };
  const tickX = (value: number) => variable === "sigma" ? (value < 0.0001 ? `${compact(value * 100)}%` : axisPercent.format(value)) : compact(value);
  const headingId = `chart-${variable}-${metric}`;

  return (
    <article className={`sensitivity-chart${featured ? " sensitivity-chart-featured" : ""}`} aria-labelledby={headingId}>
      <div className="chart-heading">
        <div><h3 id={headingId}>{title}</h3><p>{description}</p></div>
        <div className="chart-current"><span>AT CURRENT INPUT</span><strong title={basePoint[metric].toString()}>{metricValue(basePoint[metric], metric)}</strong></div>
      </div>
      <p className="chart-axis-title">{yLabel}</p>
      <div className="chart-plot">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 12, right: 18, bottom: 22, left: 0 }} accessibilityLayer
            aria-label={`${title}. ${xLabel} from ${formatX(displayX(start))} to ${formatX(displayX(end))}. Use left and right arrow keys to explore.`}
            syncId={variable === "S" ? "underlying-sensitivity" : undefined} syncMethod="value">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={0.6} />
            <XAxis dataKey="displayX" type="number" domain={["dataMin", "dataMax"]} tickCount={featured ? 7 : 5}
              tickFormatter={tickX} minTickGap={24} tickLine={false} axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted)", fontSize: 10 }} tickMargin={10}
              label={{ value: xLabel, position: "insideBottom", offset: -16, fill: "var(--muted)", fontSize: 10 }} />
            <YAxis domain={metric === "delta" ? (inputs.option_type === "call" ? [0, 1] : [-1, 0]) : [0, "auto"]}
              width={58} tickCount={5} tickFormatter={compact} tickLine={false} axisLine={false}
              tick={{ fill: "var(--muted)", fontSize: 10 }} tickMargin={8} />
            <Tooltip isAnimationActive={false} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof data)[number];
                return <div className="chart-tooltip">
                  <p>{xLabel}</p><strong>{formatX(point.displayX)}</strong>
                  <dl><dt>{metricLabel}</dt><dd title={point[metric].toString()}>{metricValue(point[metric], metric)}</dd></dl>
                </div>;
              }} />
            <ReferenceLine x={displayX(base_value)} stroke="var(--ink)" strokeDasharray="5 4" strokeWidth={1} />
            {showStrike && !sameStrike && <ReferenceLine x={inputs.K} stroke="var(--border-strong)" strokeDasharray="2 3" strokeWidth={1} />}
            <Line type="linear" dataKey={metric} name={metricLabel} stroke="var(--accent)" strokeWidth={1.8} dot={false}
              activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
            <ReferenceDot x={displayX(base_value)} y={basePoint[metric]} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend">
        <span><i className="legend-current" aria-hidden="true" />{sameStrike ? "Current S = strike K" : variable === "S" ? "Current S" : "Current"} {formatX(displayX(base_value))}</span>
        {variable === "S" && !sameStrike && <span>{showStrike && <i className="legend-strike" aria-hidden="true" />}Strike K {money.format(inputs.K)}{!showStrike && " · outside plotted range"}</span>}
        <span className="chart-sample-count">{points.length} scenarios</span>
      </div>
    </article>
  );
}

export default function SensitivityCharts({ data, inputs }: { data: SensitivityResponse; inputs: PricingRequest }) {
  // The API boundary validates the requested variables and all numeric points.
  const spot = data.sweeps.find((sweep) => sweep.variable === "S")!;
  const volatility = data.sweeps.find((sweep) => sweep.variable === "sigma")!;
  const time = data.sweeps.find((sweep) => sweep.variable === "T")!;
  return <>
    <div className="analytics-charts">
      <SweepChart sweep={spot} inputs={inputs} metric="price" title="Option value vs. underlying price" featured
        description="Revalues the option as the stock moves through the strike." />
      <SweepChart sweep={spot} inputs={inputs} metric="delta" title="Delta vs. underlying price"
        description="Directional exposure across moneyness: 0 to 1 for calls, −1 to 0 for puts." />
      <SweepChart sweep={spot} inputs={inputs} metric="gamma" title="Gamma vs. underlying price"
        description="How quickly Delta changes; typically strongest near the at-the-money region." />
      <SweepChart sweep={volatility} inputs={inputs} metric="price" title="Option value vs. volatility"
        description="The effect of annualized volatility on the option’s theoretical premium." />
      <SweepChart sweep={time} inputs={inputs} metric="price" title="Option value vs. time to expiration"
        description="Remaining time increases to the right. Value need not increase for every option." />
    </div>
    <p className="analytics-note">Hover, touch or use the arrow keys on a focused chart to inspect scenarios. Underlying charts share a cursor. Lines connect calculated points; very narrow peaks may need finer sampling.</p>
  </>;
}
