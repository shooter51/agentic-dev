import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateProjectDialog } from "./CreateProjectDialog";

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

describe("CreateProjectDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trigger button", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: /new project/i })).toBeInTheDocument();
  });

  it("opens dialog when trigger is clicked", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(screen.getByText("Create Project")).toBeInTheDocument();
  });

  it("shows name, path, and config fields", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(screen.getByPlaceholderText("Project name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("/path/to/project")).toBeInTheDocument();
    expect(screen.getByPlaceholderText('{"key": "value"}')).toBeInTheDocument();
  });

  it("disables submit when name is empty", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    const submitBtn = screen.getByRole("button", { name: /^create$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("disables submit when path is empty", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "My Project" },
    });
    const submitBtn = screen.getByRole("button", { name: /^create$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit when name and path are filled", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "My Project" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/home/proj" },
    });
    const submitBtn = screen.getByRole("button", { name: /^create$/i });
    expect(submitBtn).toBeEnabled();
  });

  it("shows inline error for invalid JSON config", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Proj" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/p" },
    });
    fireEvent.change(screen.getByPlaceholderText('{"key": "value"}'), {
      target: { value: "{bad json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("clears config error when user edits config field", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Proj" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/p" },
    });
    fireEvent.change(screen.getByPlaceholderText('{"key": "value"}'), {
      target: { value: "{bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(screen.getByText("Invalid JSON")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('{"key": "value"}'), {
      target: { value: '{"ok": true}' },
    });
    expect(screen.queryByText("Invalid JSON")).not.toBeInTheDocument();
  });

  it("submits with valid data and selects new project", async () => {
    const created = { id: "proj-1", name: "Proj", path: "/p", config: null, createdAt: "", updatedAt: "" };
    mockPost.mockResolvedValueOnce(created);

    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Proj" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/p" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/projects", {
        name: "Proj",
        path: "/p",
      });
    });

    await waitFor(() => {
      expect(mockSetSelectedProject).toHaveBeenCalledWith("proj-1");
    });
  });

  it("submits with valid JSON config", async () => {
    const created = { id: "proj-2", name: "X", path: "/x", config: '{"a":1}', createdAt: "", updatedAt: "" };
    mockPost.mockResolvedValueOnce(created);

    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/x" },
    });
    fireEvent.change(screen.getByPlaceholderText('{"key": "value"}'), {
      target: { value: '{"a":1}' },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/projects", {
        name: "X",
        path: "/x",
        config: '{"a":1}',
      });
    });
  });

  it("does not send config when config field is empty", async () => {
    const created = { id: "proj-3", name: "Y", path: "/y", config: null, createdAt: "", updatedAt: "" };
    mockPost.mockResolvedValueOnce(created);

    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Y" },
    });
    fireEvent.change(screen.getByPlaceholderText("/path/to/project"), {
      target: { value: "/y" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/projects", {
        name: "Y",
        path: "/y",
      });
    });
  });

  it("resets form on close via cancel", () => {
    render(<CreateProjectDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Something" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // Re-open — fields should be empty
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(screen.getByPlaceholderText("Project name")).toHaveValue("");
  });
});
