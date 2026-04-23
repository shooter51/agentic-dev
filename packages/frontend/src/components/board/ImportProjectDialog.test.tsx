import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImportProjectDialog } from "./ImportProjectDialog";

const mockPost = vi.fn();
vi.mock("@/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

const mockSetSelectedProject = vi.fn();
vi.mock("@/stores/ui-store", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setSelectedProject: mockSetSelectedProject }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ImportProjectDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trigger button", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
  });

  it("opens dialog when trigger is clicked", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.getByText("Import Directory")).toBeInTheDocument();
  });

  it("shows path and name fields", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.getByPlaceholderText("/path/to/existing/project")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Auto-detected from directory")).toBeInTheDocument();
  });

  it("disables submit when path is empty", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    const submitBtn = screen.getByRole("button", { name: /^import$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit when path is filled", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "/home/user/project" },
    });
    const submitBtn = screen.getByRole("button", { name: /^import$/i });
    expect(submitBtn).toBeEnabled();
  });

  it("submits with path only (no name) for auto-detection", async () => {
    const created = { id: "proj-1", name: "my-project", path: "/home/user/my-project", config: null, createdAt: "", updatedAt: "" };
    mockPost.mockResolvedValueOnce(created);

    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "/home/user/my-project" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/projects/import", {
        path: "/home/user/my-project",
      });
    });

    await waitFor(() => {
      expect(mockSetSelectedProject).toHaveBeenCalledWith("proj-1");
    });
  });

  it("submits with both path and name when name is provided", async () => {
    const created = { id: "proj-2", name: "Custom Name", path: "/some/dir", config: null, createdAt: "", updatedAt: "" };
    mockPost.mockResolvedValueOnce(created);

    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "/some/dir" },
    });
    fireEvent.change(screen.getByPlaceholderText("Auto-detected from directory"), {
      target: { value: "Custom Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/projects/import", {
        path: "/some/dir",
        name: "Custom Name",
      });
    });
  });

  it("displays API error when import fails", async () => {
    mockPost.mockRejectedValueOnce(new Error("Path does not exist"));

    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "/nonexistent" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText("Path does not exist")).toBeInTheDocument();
    });
  });

  it("shows pending state during import", async () => {
    let resolvePost: (v: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((r) => { resolvePost = r; }));

    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "/some/dir" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /importing/i })).toBeDisabled();
    });

    resolvePost!({ id: "proj-pending", name: "dir", path: "/some/dir", config: null, createdAt: "", updatedAt: "" });
  });

  it("clears error when dialog is closed and reopened", async () => {
    mockPost.mockRejectedValueOnce(new Error("Path does not exist"));

    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "/nonexistent" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText("Path does not exist")).toBeInTheDocument();
    });

    // Close and reopen
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.queryByText("Path does not exist")).not.toBeInTheDocument();
  });

  it("resets form on close via cancel", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "/some/path" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // Re-open — fields should be empty
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.getByPlaceholderText("/path/to/existing/project")).toHaveValue("");
  });

  it("does not submit when path is only whitespace", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.change(screen.getByPlaceholderText("/path/to/existing/project"), {
      target: { value: "   " },
    });
    const submitBtn = screen.getByRole("button", { name: /^import$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("shows helper text for directory path", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.getByText("Absolute path to an existing project directory")).toBeInTheDocument();
  });

  it("shows helper text for name auto-detection", () => {
    render(<ImportProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.getByText("Leave blank to auto-detect from package.json or directory name")).toBeInTheDocument();
  });
});
