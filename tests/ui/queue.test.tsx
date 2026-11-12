// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueuePage } from "../../src/web/features/queue/QueuePage.js";
import { api } from "../../src/web/api.js";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows a recoverable queue failure without claiming there are no cases", async () => {
  vi.spyOn(api, "getCases").mockRejectedValue(Error("Cannot load the queue"));
  render(<QueuePage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cannot load the queue",
  );
  expect(screen.queryByText("No open cases")).not.toBeInTheDocument();
});
