import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import App from "./App";

// Heavyweight page components - mock to avoid deep dependency chains
vi.mock("./pages/BoardPage", () => ({
  BoardPage: () => <div data-testid="board-page">Board Page</div>,
}));

vi.mock("./pages/StatsPage", () => ({
  StatsPage: () => <div data-testid="stats-page">Stats Page</div>,
}));

vi.mock("./components/layout/Header", () => ({
  Header: () => <div data-testid="header">Header</div>,
}));

vi.mock("./components/layout/Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("./components/help/HelpWidget", () => ({
  HelpWidget: () => <div data-testid="help-widget">Help</div>,
}));

function wrapper(queryClient: QueryClient, path = "/") {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve("[]"),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders header, sidebar and help widget", () => {
    const qc = new QueryClient();
    render(<App />, { wrapper: wrapper(qc) });
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("help-widget")).toBeInTheDocument();
  });

  it("renders BoardPage on root path", () => {
    const qc = new QueryClient();
    render(<App />, { wrapper: wrapper(qc, "/") });
    expect(screen.getByTestId("board-page")).toBeInTheDocument();
  });

  it("renders StatsPage on /stats path", () => {
    const qc = new QueryClient();
    render(<App />, { wrapper: wrapper(qc, "/stats") });
    expect(screen.getByTestId("stats-page")).toBeInTheDocument();
  });
});
