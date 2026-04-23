import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useUIStore } from "@/stores/ui-store";
import { Plus } from "lucide-react";
import type { Task, Priority, TaskType } from "@/api/types";

interface CreateTaskPayload {
  title: string;
  description?: string;
  priority: Priority;
  type: TaskType;
}

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("P2");
  const [type, setType] = useState<TaskType>("task" as TaskType);

  const selectedProject = useUIStore((s) => s.selectedProject);
  const queryClient = useQueryClient();

  // Fall back to first project if "All Projects" is selected
  const [projects, setProjects] = useState<Array<{id: string}>>([]);
  const effectiveProject = selectedProject || projects[0]?.id || null;

  useEffect(() => {
    apiClient.get<Array<{id: string}>>("/api/projects").then(setProjects).catch(() => {});
  }, []);

  const createTask = useMutation({
    mutationFn: (payload: CreateTaskPayload) =>
      apiClient.post<Task>(`/api/projects/${effectiveProject}/tasks`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setPriority("P2");
      setType("task" as TaskType);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !effectiveProject) return;
    createTask.mutate({ title: title.trim(), description: description.trim() || undefined, priority, type });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!effectiveProject}
          title={!effectiveProject ? "No projects available" : "Create new task"}
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="P0">P0 — Critical</option>
                <option value="P1">P1 — High</option>
                <option value="P2">P2 — Medium</option>
                <option value="P3">P3 — Low</option>
                <option value="P4">P4 — Backlog</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TaskType)}
                className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="feature">Feature</option>
                <option value="bug">Bug</option>
                <option value="task">Task</option>
                <option value="chore">Chore</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || createTask.isPending}
            >
              {createTask.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
