import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useAgents } from "@/api/queries/agents";
import { usePendingMessages } from "@/api/queries/messages";
import { Link, useLocation } from "react-router-dom";
import { LayoutList, BarChart2, PanelRightOpen, PanelRightClose, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECTS = [
  { id: "all", label: "All Projects" },
];

export function Header() {
  const location = useLocation();
  const selectedProject = useUIStore((s) => s.selectedProject);
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const compactMode = useUIStore((s) => s.compactMode);
  const toggleCompactMode = useUIStore((s) => s.toggleCompactMode);

  const { data: agents } = useAgents();
  const { data: pending } = usePendingMessages();

  const errorCount = agents?.filter((a) => a.status === "error").length ?? 0;
  const pendingCount = pending?.length ?? 0;

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b bg-white z-10 flex-shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-bold text-gray-900 text-base">Agentic Dev</span>

        <nav className="flex items-center gap-1">
          <Link to="/">
            <Button
              variant={location.pathname === "/" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <LayoutList className="w-4 h-4" />
              Board
            </Button>
          </Link>
          <Link to="/stats">
            <Button
              variant={location.pathname === "/stats" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
            >
              <BarChart2 className="w-4 h-4" />
              Stats
            </Button>
          </Link>
        </nav>

        <select
          className="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={selectedProject ?? "all"}
          onChange={(e) => setSelectedProject(e.target.value === "all" ? null : e.target.value)}
        >
          {PROJECTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        {errorCount > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
            {errorCount} agent error{errorCount > 1 ? "s" : ""}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
            {pendingCount} pending
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCompactMode}
          title={compactMode ? "Full card view" : "Compact view"}
          className={cn(compactMode && "text-blue-600")}
        >
          <Rows3 className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          title={sidebarOpen ? "Hide agent panel" : "Show agent panel"}
        >
          {sidebarOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
