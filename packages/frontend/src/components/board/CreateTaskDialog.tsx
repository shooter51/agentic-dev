import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useUIStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export function CreateTaskDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("P2");
  const [type, setType] = useState("feature");
  const selectedProject = useUIStore((s) => s.selectedProject);
  const queryClient = useQueryClient();

  const createTask = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      priority: string;
      type: string;
    }) =>
      apiClient.post(`/api/projects/${selectedProject}/tasks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setPriority("P2");
      setType("feature");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!selectedProject}
          title={!selectedProject ? "Select a project first" : "Create task"}
        >
          <Plus className="w-4 h-4" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            createTask.mutate({ title, description, priority, type });
          }}
        >
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Description
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Priority
              </label>
              <select
                className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm bg-white"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="P0">P0 — Critical</option>
                <option value="P1">P1 — High</option>
                <option value="P2">P2 — Medium</option>
                <option value="P3">P3 — Low</option>
                <option value="P4">P4 — Backlog</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Type
              </label>
              <select
                className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm bg-white"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="feature">Feature</option>
                <option value="bug">Bug</option>
                <option value="task">Task</option>
                <option value="chore">Chore</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || createTask.isPending}
            >
              {createTask.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
