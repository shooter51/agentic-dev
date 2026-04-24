# Changelog

## 1.0.0 (2026-04-24)

Initial public release.

### Features

- 12-stage SDLC pipeline (Todo through Done) with quality gates
- 10 specialized AI agents (Product Manager, Architect, Tech Lead, 3 Developers, DevOps, Manual QA, Automation, Documentation)
- Kanban board UI with real-time updates via SSE
- Multi-project support with per-project agent memory
- Dual CLI backend support (Claude Code and OpenCode)
- Self-healing error recovery with exponential backoff and agent failover
- Self-repair: Opus-powered automated diagnosis after repeated failures
- Watchdog for detecting and recovering stuck tasks
- Inter-agent messaging (clarifications and rejections)
- Cost tracking per agent and per task
- Task history audit log with stage transitions and quality gate results
- Drag-and-drop task management
- Docker support with pre-installed CLI tools
- 43 Playwright E2E tests
- 11 Architecture Decision Records
- 9 Low-Level Design documents
