import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useUIStore } from "@/stores/ui-store";
import { FolderInput } from "lucide-react";

export function ImportProjectDialog() {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const queryClient = useQueryClient();
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);

  const importProject = useMutation({
    mutationFn: (data: { path: string }) =>
      apiClient.post<{ id: string }>("/api/projects/import", data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      setSelectedProject(project.id);
      setOpen(false);
      setPath("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-8 px-2">
          <FolderInput className="w-3.5 h-3.5" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Project</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          Import an existing project directory. The name will be auto-detected from package.json if available.
        </p>
        <form
          className="space-y-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!path.trim()) return;
            importProject.mutate({ path: path.trim() });
          }}
        >
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Directory Path</label>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/you/Source/existing-project" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!path.trim() || importProject.isPending}>
              {importProject.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
