import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useUIStore } from "@/stores/ui-store";
import { FolderPlus } from "lucide-react";

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const queryClient = useQueryClient();
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);

  const create = useMutation({
    mutationFn: (data: { name: string; path: string }) =>
      apiClient.post<{ id: string }>("/api/projects", data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
      setSelectedProject(project.id);
      setOpen(false);
      setName("");
      setPath("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-8 px-2">
          <FolderPlus className="w-3.5 h-3.5" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !path.trim()) return;
            create.mutate({ name: name.trim(), path: path.trim() });
          }}
        >
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Path</label>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/you/Source/my-project" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!name.trim() || !path.trim() || create.isPending}>
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
