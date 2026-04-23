import { AgentPanel } from "@/components/agents/AgentPanel";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  return (
    <aside
      className={cn(
        "border-l bg-white flex-shrink-0 transition-all duration-200",
        sidebarOpen ? "w-72 h-full overflow-y-auto" : "w-0 overflow-hidden border-0"
      )}
    >
      {sidebarOpen && <AgentPanel />}
    </aside>
  );
}
