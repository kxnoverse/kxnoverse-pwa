import { describe, expect, it, vi } from "vitest";
import {
  applyPwaUpdate,
  configurePwaUpdateHandler,
  notifyPwaUpdateAvailable,
  subscribeToPwaUpdate,
} from "./pwa-update-state";

describe("PWA update handoff", () => {
  it("notifies the UI and waits for an explicit reload request", async () => {
    const states: Array<{ available: boolean; failed: boolean }> = [];
    const unsubscribe = subscribeToPwaUpdate((state) => states.push(state));
    const handler = vi.fn(async (_reloadPage?: boolean) => {});
    configurePwaUpdateHandler(handler);

    notifyPwaUpdateAvailable();
    expect(states.at(-1)).toEqual({ available: true, failed: false });
    expect(handler).not.toHaveBeenCalled();

    await applyPwaUpdate();
    expect(handler).toHaveBeenCalledWith(true);
    unsubscribe();
  });
});
