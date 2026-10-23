import { afterEach, expect, it, vi } from "vitest";
import {
  hasGatewayWorkMetricsListeners,
  publishGatewayWorkMetrics,
} from "../infra/gateway-work-metrics.js";
import { createPluginRuntimeCapabilityLease } from "./capability-lease.js";
import { createPluginServiceDiagnostics } from "./service-diagnostics.js";

afterEach(() => publishGatewayWorkMetrics(undefined));

it("runs every retained cleanup when an earlier cleanup throws during revoke", () => {
  const lease = createPluginRuntimeCapabilityLease("diagnostics-prometheus");
  const diagnostics = createPluginServiceDiagnostics(
    {
      id: "diagnostics-prometheus",
      pluginId: "diagnostics-prometheus",
      origin: "bundled",
      source: "test",
      service: { id: "diagnostics-prometheus", start() {} },
    },
    lease,
  )!;
  const failure = new Error("first cleanup failed");
  lease.retain(() => {
    throw failure;
  });
  diagnostics.onGatewayWorkMetrics!(vi.fn());
  expect(hasGatewayWorkMetricsListeners()).toBe(true);

  // The failure is still reported, but only after the real subscription is released.
  expect(() => lease.revoke()).toThrow(failure);
  expect(lease.isActive()).toBe(false);
  expect(hasGatewayWorkMetricsListeners()).toBe(false);
  expect(() => lease.revoke()).not.toThrow();
});

it("reports every cleanup failure from one revoke and never reruns a cleanup", () => {
  const lease = createPluginRuntimeCapabilityLease("owner");
  const first = new Error("first");
  const second = new Error("second");
  const healthy = vi.fn();
  lease.retain(() => {
    throw first;
  });
  lease.retain(healthy);
  lease.retain(() => {
    throw second;
  });

  let thrown: unknown;
  try {
    lease.revoke();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AggregateError);
  expect((thrown as AggregateError).errors).toEqual([first, second]);
  expect(healthy).toHaveBeenCalledOnce();
  lease.revoke();
  expect(healthy).toHaveBeenCalledOnce();
});

it("keeps one-shot release and inactive fencing", () => {
  const lease = createPluginRuntimeCapabilityLease("owner");
  const cleanup = vi.fn();
  const release = lease.retain(cleanup);
  release();
  release();
  lease.revoke();
  expect(cleanup).toHaveBeenCalledOnce();

  const late = vi.fn();
  expect(() => lease.retain(late)).toThrow("owner capability lease is no longer active");
  expect(late).toHaveBeenCalledOnce();
});
