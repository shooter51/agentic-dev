import { useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import { useImportProject } from "@/api/queries/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderInput } from "lucide-react";

export function ImportProjectDialog() {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);
  const importProject = useImportProject();

  function resetForm() {
    setPath("");
    setName("");
    importProject.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim()) return;

    importProject.mutate(
      {
        path: path.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
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
        <Button size="sm" variant="outline" className="gap-1.5" title="Import directory">
          <FolderInput className="w-4 h-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Directory</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4 mt-2" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Directory Path
            </label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/existing/project"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              Absolute path to an existing project directory
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Name (optional)
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-detected from directory"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave blank to auto-detect from package.json or directory name
            </p>
          </div>
          {importProject.isError && (
            <p className="text-xs text-red-600">
              {importProject.error?.message ?? "Failed to import project"}
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
              disabled={!path.trim() || importProject.isPending}
            >
              {importProject.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
