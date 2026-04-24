import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import type { Task, Priority, TaskType } from "@/api/types";

interface TaskEditorProps {
  task: Task;
}

export function TaskEditor({ task }: TaskEditorProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [type, setType] = useState(task.type);
  const queryClient = useQueryClient();

  const canEdit = task.stage === "todo" || task.stage === "product";

  const update = useMutation({
    mutationFn: (data: { title?: string; description?: string; priority?: string; type?: string }) =>
      apiClient.patch<Task>(`/api/tasks/${task.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", task.id] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      setEditing(false);
    },
  });

  if (!canEdit) return null;

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1 text-xs"
        onClick={() => setEditing(true)}
      >
        <Pencil className="w-3 h-3" />
        Edit
      </Button>
    );
  }

  return (
    <div className="space-y-3 border border-blue-200 bg-blue-50/50 rounded-lg p-3">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
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
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="task">Task</option>
            <option value="chore">Chore</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        <Button
          size="sm"
          disabled={!title.trim() || update.isPending}
          onClick={() => update.mutate({
            title: title.trim(),
            description: description.trim() || undefined,
            priority,
          })}
        >
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
