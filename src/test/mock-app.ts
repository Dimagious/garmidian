// Shared setup for the UI tests that run on obsidian-test-mocks (the `dom` project).
import { vi } from "vitest";
import { App } from "obsidian-test-mocks/obsidian";
import type { App as ObsidianApp, PluginManifest } from "obsidian";
import GarmyPlugin, { type GarmySettings } from "../main";
import type { GarminClient } from "../api/client";

const MANIFEST: PluginManifest = { id: "garmidian", name: "Garmy", version: "0.0.0", minAppVersion: "1.13.0", author: "test", description: "test" };

export interface Harness {
  /** The mock, for its in-memory vault and the `Mock-only` helpers. */
  mock: App;
  app: ObsidianApp;
  plugin: GarmyPlugin;
}

/**
 * A real GarmyPlugin on a mock app. The mocks throw on a property they do not model, and Garmy reads an
 * undocumented one (`internalPlugins`), so it is given a value first.
 */
export async function makeHarness(files: Record<string, string> = {}, settings: Partial<GarmySettings> = {}): Promise<Harness> {
  const mock = App.createConfigured__({ files });
  Object.assign(mock, { internalPlugins: undefined });
  const app = mock.asOriginalType__();
  const plugin = new GarmyPlugin(app, MANIFEST);
  await plugin.onload();
  Object.assign(plugin.settings, settings);
  return { mock, app, plugin };
}

/** A GarminClient that never reaches the network: only the two methods the wizard calls. */
export function fakeClient(impl: Partial<Pick<GarminClient, "verify" | "backfill">>): GarminClient {
  return { verify: vi.fn(() => Promise.resolve()), backfill: vi.fn(), ...impl } as unknown as GarminClient;
}
