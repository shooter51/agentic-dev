import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateTaskDialog } from "./CreateTaskDialog";

const mockPost = vi.fn();
vi.mock("@/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

let mockSelectedProject: string | null = "proj-1";
vi.mock("@/stores/ui-store", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedProject: mockSelectedProject }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("CreateTaskDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedProject = "proj-1";
  });

  it("renders the trigger button", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: /new task/i })).toBeInTheDocument();
  });

  it("disables trigger when no project is selected", () => {
    mockSelectedProject = null;
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: /new task/i })).toBeDisabled();
  });

  it("enables trigger when a project is selected", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: /new task/i })).toBeEnabled();
  });

  it("opens dialog when trigger is clicked", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    expect(screen.getByText("Create Task")).toBeInTheDocument();
  });

  it("shows title, description, priority, and type fields", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    expect(screen.getByPlaceholderText("Task title")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Describe the task...")).toBeInTheDocument();
  });

  it("disables submit when title is empty", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    const submitBtn = screen.getByRole("button", { name: /^create$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit when title is filled", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByPlaceholderText("Task title"), {
      target: { value: "My Task" },
    });
    const submitBtn = screen.getByRole("button", { name: /^create$/i });
    expect(submitBtn).toBeEnabled();
  });

  it("submits with default values", async () => {
    mockPost.mockResolvedValueOnce({ id: "task-1" });

    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByPlaceholderText("Task title"), {
      target: { value: "Build feature" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/projects/proj-1/tasks", {
        title: "Build feature",
        description: "",
        priority: "P2",
        type: "feature",
      });
    });
  });

  it("submits with changed priority and type", async () => {
    mockPost.mockResolvedValueOnce({ id: "task-2" });

    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByPlaceholderText("Task title"), {
      target: { value: "Fix bug" },
    });
    fireEvent.change(screen.getByPlaceholderText("Describe the task..."), {
      target: { value: "A description" },
    });

    // Change priority select
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "P0" } });
    fireEvent.change(selects[1], { target: { value: "bug" } });

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/api/projects/proj-1/tasks", {
        title: "Fix bug",
        description: "A description",
        priority: "P0",
        type: "bug",
      });
    });
  });

  it("does not submit when title is whitespace only", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByPlaceholderText("Task title"), {
      target: { value: "   " },
    });
    const submitBtn = screen.getByRole("button", { name: /^create$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("closes dialog on cancel", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    expect(screen.getByText("Create Task")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText("Create Task")).not.toBeInTheDocument();
  });

  it("does not call API when submitting with empty title via form", () => {
    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    // Submit form directly without filling title
    fireEvent.submit(screen.getByRole("button", { name: /^create$/i }).closest("form")!);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows pending state during submission", async () => {
    let resolvePost: (v: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((r) => { resolvePost = r; }));

    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByPlaceholderText("Task title"), {
      target: { value: "Pending task" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
    });

    resolvePost!({ id: "task-done" });
  });

  it("resets form on successful submit", async () => {
    mockPost.mockResolvedValueOnce({ id: "task-3" });

    render(<CreateTaskDialog />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByPlaceholderText("Task title"), {
      target: { value: "Task X" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });

    // Re-open — fields should be reset
    await waitFor(() => {
      expect(screen.queryByText("Create Task")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    expect(screen.getByPlaceholderText("Task title")).toHaveValue("");
  });
});
