# ADR-0007: Frontend Stack — React + Zustand + shadcn/ui + dnd-kit

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

The frontend is a React + TypeScript Kanban board with 11 columns, real-time updates, task detail views, agent communication feeds, agent memory viewer, and a help widget. We need to choose state management, UI component library, drag-and-drop library, and build tooling.

## Decision

### Build Tool: Vite

Standard choice for React + TypeScript. Fast HMR, ESBuild-powered, minimal config.

### State Management: Zustand + TanStack Query

- **Zustand** for client-side UI state: drag operations, optimistic updates, UI preferences, active filters.
- **TanStack Query** for server state: tasks, agents, messages, memories. Handles caching, background refetching, and stale-while-revalidate.
- SSE events invalidate TanStack Query caches, triggering automatic re-renders.

### UI Components: shadcn/ui

- Built on Radix primitives + Tailwind CSS.
- Copy-owned components (no library lock-in).
- Accessible out of the box (keyboard nav, ARIA, focus management).
- Pre-built: Dialog, Sheet, Tabs, Command, Badge, Card, Avatar, ScrollArea — all needed for Kanban, task detail, and agent panels.

### Drag-and-Drop: dnd-kit

- Actively maintained with first-class TypeScript support.
- Handles 12-column Kanban with sortable items within and across columns.
- Custom drag overlays for task card previews.
- Keyboard-accessible drag-and-drop.

### 12-Column Kanban UX

12 columns will not fit on most screens without horizontal scrolling. Mitigations:

- **Horizontal scroll with snap:** The board scrolls horizontally with column-snap behavior. Left/right keyboard navigation.
- **Collapsible columns:** Empty columns auto-collapse to a thin vertical strip showing only the column name and task count. Click to expand.
- **Compact mode toggle:** Switch between full cards (title, agent, priority, time-in-stage) and compact rows (title + badge only).
- **Column grouping:** Visually group related columns (e.g., Development + Tech Lead Review under a "Build" header) with subtle separators.
- **Focus view:** Click an agent or stage to filter the board to only show relevant columns and tasks.

### Optimistic Updates and SSE Conflict Resolution

When the operator drags a task card (optimistic update) while an SSE event arrives moving the same task:

1. **Server wins.** SSE events represent the ground truth from the orchestrator.
2. During an active drag operation, incoming SSE `task-updated` events for the dragged task are **queued** (not applied) until the drag completes.
3. On drag completion, the REST API mutation fires. If it succeeds, the optimistic state is confirmed. If it fails (e.g., task already moved by an agent), the UI reverts and applies the queued SSE events.
4. A brief toast notification informs the operator: "Task was moved by [agent] while you were dragging."

### Test Runner

- **Vitest** for unit and component tests (consistent with the operator's existing projects).
- **React Testing Library** for component interaction tests.
- **Playwright** for E2E UI tests if needed.

### CSS: Tailwind CSS v4

- Utility-first, consistent with shadcn/ui.
- Design tokens for brand colors, spacing, and typography.

## Alternatives Considered

### State Management
1. **Redux Toolkit** — Powerful but verbose for this scale. Zustand achieves the same with less boilerplate. Rejected.
2. **TanStack Query alone** — Excellent for server state but insufficient for client-side drag state and UI preferences. Used alongside Zustand.

### UI Components
1. **Headless UI** — Thinner than shadcn but requires more manual styling work. Rejected — shadcn provides the same flexibility with less effort.
2. **Radix + custom styles** — Rebuilding what shadcn already provides. Rejected.

### Drag-and-Drop
1. **react-beautiful-dnd** — Archived by Atlassian. Unmaintained. Rejected.
2. **@hello-pangea/dnd** — Community fork of rbd. Buys time but carries the same architectural constraints. Rejected.

## Consequences

- **Positive:** Type-safe throughout. Accessible components out of the box. Zustand + TanStack Query is a lightweight but powerful combination. dnd-kit handles complex multi-column Kanban layouts.
- **Negative:** shadcn components are copy-owned — updates require manual re-application. Mitigated by the `npx shadcn` CLI for diffing updates.
- **Risk:** dnd-kit has a learning curve for complex sortable configurations. Mitigated by strong documentation and examples.
