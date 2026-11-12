// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { App } from "../../src/web/App.js";
import { api } from "../../src/web/api.js";
import { demoCase } from "../helpers.js";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});
it("keyboard skip moves focus to the desk while preserving the case route and local reply", async () => {
  const d = demoCase("case-c");
  history.replaceState(null, "", "#case/case-c");
  vi.spyOn(api, "getCase").mockResolvedValue(d);
  vi.spyOn(api, "getStatus").mockResolvedValue({
    mode: "fixture",
    analysis: "unavailable",
    merchant: "Synthetic studio",
    sandboxConfigured: false,
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<App />);
  const editor = await screen.findByLabelText("Reply text");
  fireEvent.change(editor, { target: { value: "Retain this unsaved reply" } });
  const skip = screen.getByRole("link", { name: "Skip to desk" });
  skip.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(screen.getByRole("main")).toHaveFocus();
  expect(location.hash).toBe("#case/case-c");
  expect(editor).toHaveValue("Retain this unsaved reply");
  expect(confirm).not.toHaveBeenCalled();
});
