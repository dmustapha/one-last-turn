import { describe, expect, it } from "vitest";

import { resolveAvfoundationScreenInput } from "../../../scripts/resolve-avfoundation-screen-input";

describe("resolveAvfoundationScreenInput", () => {
  it("resolves the current screen input", () => {
    expect(resolveAvfoundationScreenInput('[AVFoundation indev @ 0x1] [0] Capture screen 0')).toBe("0:none");
  });

  it("handles extra devices and a multi-digit screen index", () => {
    const inventory = [
      "AVFoundation video devices:",
      "[0] FaceTime HD Camera",
      "[12] Capture screen 0",
      "AVFoundation audio devices:",
      "[0] MacBook Microphone",
    ].join("\n");

    expect(resolveAvfoundationScreenInput(inventory)).toBe("12:none");
  });

  it("rejects an inventory without a screen input", () => {
    expect(() => resolveAvfoundationScreenInput("[0] FaceTime HD Camera")).toThrow(
      "No AVFoundation screen input found",
    );
  });
});
