import { expect, it, vi } from "vitest";
import { getSensitivity } from "@/lib/api";
import type { SensitivityRequest, SensitivityResponse } from "@/lib/types";
import { baseInputs, sensitivityResponse } from "./sensitivity-fixtures";

const request: SensitivityRequest = {
  ...baseInputs, variables: ["S", "sigma", "T"], num_points: 81,
};

function respondWith(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
}

it("preserves full response precision and accepts additional exact anchor samples", async () => {
  const response = sensitivityResponse();
  const spot = response.sweeps[0];
  spot.points[0].price = 1.2345678912345;
  spot.points.splice(1, 0, { ...spot.points[0], x: 50.1 });
  spot.points.splice(2, 0, { ...spot.points[0], x: 50.2 });
  respondWith(response);

  expect(await getSensitivity(request)).toEqual(response);
});

it.each<{ name: string; invalidate: (data: SensitivityResponse) => void }>([
  { name: "missing sweep", invalidate: (data) => { data.sweeps.pop(); } },
  { name: "duplicate sweep", invalidate: (data) => { data.sweeps[1] = data.sweeps[0]; } },
  { name: "wrong base input", invalidate: (data) => { data.sweeps[0].base_value = 99; } },
  { name: "missing base anchor", invalidate: (data) => { data.sweeps[0].points[40].x = 100.1; } },
  { name: "too few samples", invalidate: (data) => { data.sweeps[0].points.pop(); } },
  { name: "too many samples", invalidate: (data) => {
    const points = data.sweeps[0].points;
    for (const x of [151, 152, 153]) points.push({ ...points[0], x });
  } },
  { name: "unordered samples", invalidate: (data) => { data.sweeps[0].points.reverse(); } },
  { name: "duplicate x values", invalidate: (data) => { data.sweeps[0].points[1].x = data.sweeps[0].points[0].x; } },
  { name: "zero maturity", invalidate: (data) => { data.sweeps[2].points[0].x = 0; } },
  // JSON serializes nonfinite numbers to null; neither is valid chart data.
  { name: "nonfinite price", invalidate: (data) => { data.sweeps[0].points[0].price = Infinity; } },
  { name: "nonfinite Greek", invalidate: (data) => { data.sweeps[0].points[0].gamma = NaN; } },
])("rejects $name before the response can reach the charts", async ({ invalidate }) => {
  const response = sensitivityResponse();
  invalidate(response);
  respondWith(response);

  await expect(getSensitivity(request)).rejects.toThrow(
    "The pricing service returned an invalid response. Please try again.",
  );
});
