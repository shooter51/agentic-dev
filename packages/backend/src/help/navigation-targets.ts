export interface NavigationTarget {
  label: string;
  path: string;
}

export interface NavigationHint {
  key: string;
  label: string;
  path: string;
}

export const NAVIGATION_TARGETS: Record<string, NavigationTarget> = {
  board: { label: 'Kanban Board', path: '/' },
  add_project: { label: 'Add Project', path: '/projects/new' },
  agent_panel: { label: 'Agent Panel', path: '/?sidebar=agents' },
  stats: { label: 'Cost & Metrics', path: '/stats' },
  task_detail: { label: 'Task Detail', path: '/?selectedTask=:id' },
  settings: { label: 'Settings', path: '/settings' },
};
