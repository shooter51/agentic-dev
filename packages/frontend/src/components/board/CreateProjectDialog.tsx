import { useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import { useCreateProject } from "@/api/queries/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderPlus } from "lucide-react";

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [config, setConfig] = useState("");
  const [configError, setConfigError] = useState("");
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);
  const createProject = useCreateProject();

  function resetForm() {
    setName("");
    setPath("");
    setConfig("");
    setConfigError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !path.trim()) return;

    const trimmedConfig = config.trim();
    if (trimmedConfig) {
      try {
        JSON.parse(trimmedConfig);
      } catch {
        setConfigError("Invalid JSON");
        return;
      }
    }
    setConfigError("");

    createProject.mutate(
      {
        name: name.trim(),
        path: path.trim(),
        ...(trimmedConfig ? { config: trimmedConfig } : {}),
      },
      {
        onSuccess: (project) => {
          setSelectedProject(project.id);
          setOpen(false);
          resetForm();
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" title="Create project">
          <FolderPlus className="w-4 h-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 mt-2" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Path
            </label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/project"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Config (optional JSON)
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px] font-mono"
              value={config}
              onChange={(e) => {
                setConfig(e.target.value);
                if (configError) setConfigError("");
              }}
              placeholder='{"key": "value"}'
            />
            {configError && (
              <p className="text-xs text-red-600 mt-1">{configError}</p>
            )}
          </div>
          {createProject.isError && (
            <p className="text-xs text-red-600">
              {createProject.error?.message ?? "Failed to create project"}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !path.trim() || createProject.isPending}
            >
              {createProject.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
