# ADR-0013: Create Project Dialog — Frontend Component Design

**Status:** Accepted
**Date:** 2026-04-23
**Deciders:** Architect
**Related:** ADR-0007 (Frontend Stack), ADR-0004 (Database Schema)
**Task:** 01KPXJWW56SY0WZPZZ599R7NEE

---

## Context

Users need the ability to create new projects from the UI. The backend API (`POST /api/projects`) and shared types (`NewProject`, `Project`, `ProjectConfig`) already exist and are fully functional. This ADR covers the frontend component design only.

The existing `CreateTaskDialog` component (inline mutation, self-contained dialog with trigger button) establishes the UI pattern. The `useProjects` query hook exists in `src/api/queries/projects.ts` but has no create mutation.

## Decision

### 1. New Component: `CreateProjectDialog`

**Location:** `packages/frontend/src/components/board/CreateProjectDialog.tsx`

Follows the `CreateTaskDialog` pattern — a self-contained dialog component that owns its own `open` state, form field state, and mutation.

**Form fields:**

| Field | Type | Required | UI Element | Notes |
|-------|------|----------|------------|-------|
| `name` | string | Yes | `<Input>` | Project display name |
| `path` | string | Yes | `<Input>` | Absolute path to target repo on disk |
| `config` | string | No | `<textarea>` | JSON-serialised `ProjectConfig` |

**Validation rules:**
- `name` and `path` must be non-empty after trimming.
- `config`, if provided, must be valid JSON. Parse with `JSON.parse()` in a try/catch before submission. Display inline error text below the textarea on parse failure. Do NOT submit until valid.
- No schema validation of the parsed config beyond valid JSON — the backend handles `ProjectConfig` shape validation.

**Mutation behavior:**
- Calls `apiClient.post<Project>('/api/projects', { name, path, config })`.
- On success: invalidates `["projects"]` query key, resets form state, closes dialog, auto-selects the newly created project via `useUIStore.setSelectedProject(newProject.id)`.
- On error: display error message from API response below the form (same pattern as `CreateTaskDialog` — the dialog stays open so the user can correct and retry).

### 2. Mutation Hook: `useCreateProject`

**Location:** `packages/frontend/src/api/queries/projects.ts` (added to existing file)

Follows the extracted-hook pattern used by `useMoveTask` in `tasks.ts`. This keeps the mutation reusable and the query file as the single source of truth for project data operations.

```typescript
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; path: string; config?: string }) =>
      apiClient.post<Project>('/api/projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

The dialog component calls `useCreateProject()` and handles UI-specific side effects (close dialog, reset form, select project) in its own `onSuccess` via the mutation's `mutate(data, { onSuccess })` overload.

### 3. Header Integration

**Location:** `packages/frontend/src/components/layout/Header.tsx`

Place `<CreateProjectDialog />` immediately after the project `<select>` dropdown and before `<CreateTaskDialog />`. This groups project management controls together (select project → create project → create task within project).

```
[Agentic Dev] [Board] [Stats] [Project ▼] [+ New Project] [+ New Task]    [badges] [icons]
```

The "New Project" button is always enabled (unlike "New Task" which requires a selected project).

### 4. Config Field — JSON Validation Strategy

The `config` field is optional and accepts a JSON string representing `ProjectConfig`. The risk identified in the product handoff is invalid JSON reaching the API.

**Client-side:** Parse with `JSON.parse()` before submission. On failure, show an inline validation error: "Invalid JSON — please check syntax." The submit button remains enabled but the `onSubmit` handler short-circuits.

**Server-side:** The backend route already validates and returns 400 on malformed JSON. This is the authoritative check; the client-side validation is a UX convenience only.

No client-side schema validation of the parsed object against `ProjectConfig` — the backend is authoritative for shape, and the config structure is intentionally flexible (all fields optional with runtime defaults).

## Consequences

### Positive
- Consistent UX: follows the established dialog-with-trigger pattern.
- Minimal footprint: one new component, one new hook, one import in Header.
- Reusable hook: `useCreateProject` can be called from other contexts if needed.
- Auto-selection of new project reduces friction.

### Negative
- The `path` field requires the user to know the absolute filesystem path. This is acceptable for the current power-user audience but may need a file picker in the future.
- JSON textarea for config is error-prone for complex configurations. A structured form could be added later as an enhancement.

## Files Changed

| File | Change |
|------|--------|
| `packages/frontend/src/components/board/CreateProjectDialog.tsx` | **New** — dialog component |
| `packages/frontend/src/api/queries/projects.ts` | **Modified** — add `useCreateProject` hook |
| `packages/frontend/src/components/layout/Header.tsx` | **Modified** — import and render `<CreateProjectDialog />` |

## Component Diagram

```
Header.tsx
├── <select> (project switcher)
├── <CreateProjectDialog />          ← NEW
│   ├── Dialog trigger: [+ New Project] button
│   ├── Form: name, path, config
│   ├── JSON validation (client-side)
│   └── useCreateProject() mutation
│       └── POST /api/projects
│           └── invalidates ["projects"]
│               └── auto-selects new project
└── <CreateTaskDialog />
```

## Data Flow

```
User fills form → onSubmit
  → validate name/path non-empty
  → if config provided, JSON.parse() — fail → show error, stop
  → useCreateProject.mutate({ name, path, config })
  → POST /api/projects (backend generates id, createdAt, updatedAt)
  → 201 Created → invalidate ["projects"] query
  → dialog onSuccess: close, reset, setSelectedProject(newId)
  → Header re-renders with new project in <select>
```
