# Recommended Practices — Curated Subset

Filtered for relevance to your projects (TypeScript/React, Node, Go, Swift/iOS, AWS/Cloudflare).
Excluded anything already covered in the PRD (coverage thresholds, no stubs, no mocks, Beads, etc.).

---

## Developer Practices (38 selected from 105)

### Code Quality
1. **Single Responsibility Principle** — Every function, class, and module does exactly one thing.
2. **Max function length of 40 lines** — Decompose beyond this.
3. **No dead code** — Remove unused imports, unreachable branches, commented-out code.
4. **No magic numbers or strings** — Extract into named constants.
5. **Cyclomatic complexity cap of 10** — Refactor functions above this.
6. **Explicit return types** — All public functions declare return types.
7. **Prefer immutability** — Default to `const`, `readonly`; mutable only when required.

### Git Workflow
8. **Atomic commits** — Each commit is one logical change that compiles and passes tests.
9. **Conventional commit messages** — `type(scope): description` format.
10. **Branch lifetime under 3 days** — Break into smaller deliverables if longer.

### Code Review
12. **PR size limit of 400 lines** — Split larger PRs.
13. **PR description must include "why"** — Motivation, not just file changes.
14. **Require passing CI before review** — Fix the pipeline before requesting review.

### Testing
15. **Test naming: should_X_when_Y** — Descriptive test names.
16. **No test interdependence** — Each test runnable in isolation.
17. **Regression test for every bug fix** — Commit includes a test that fails without the fix.

### Security
18. **Input validation at every boundary** — All external input validated and sanitized.
19. **Parameterized queries only** — Never string concatenation for SQL.
20. **Output encoding for all user-generated content** — Escape to prevent XSS/log injection.
21. **Authentication and authorization on every endpoint** — No endpoint without auth checks unless intentionally public.

### Performance
22. **No N+1 queries** — Use eager loading, joins, or batching.
23. **Pagination for all list endpoints** — Default and maximum page size.
24. **Set timeouts on all external calls** — No indefinite waits.
25. **Database indexes for filtered/sorted columns** — Every WHERE/ORDER BY/JOIN column indexed.

### Error Handling & Logging
26. **No swallowed exceptions** — Every catch block handles, re-throws, or logs.
27. **Structured logging (JSON)** — Consistent fields: timestamp, level, service, request_id, message.
28. **No sensitive data in logs** — PII, credentials, tokens masked.
29. **Correlation IDs on all requests** — Unique ID propagated through downstream calls.
30. **Consistent error response schema** — Same structure across all endpoints.
31. **Retry with exponential backoff** — Transient failures retried with jitter.

### API Design
32. **Standard HTTP methods and status codes** — GET/POST/PUT/DELETE with correct status codes.
33. **Version all APIs** — URL path `/v1/` from day one.
34. **Request and response schemas validated** — Schema validation (Zod, JSON Schema) before processing.
35. **Rate limiting on all public endpoints** — 429 with Retry-After header.

### Database
36. **All schema changes via migrations** — Versioned, reversible migration files.
37. **Timestamps on every table** — `created_at` and `updated_at` on all tables.

### Frontend
38. **Form validation on both client and server** — Client for UX, server for security.

---

## QA Practices (32 selected from 123)

### Exploratory Testing
1. **Session-based exploratory testing** — Time-boxed sessions with a charter.
2. **Persona-based testing** — Test as distinct user roles (admin, free-tier, new user).
3. **Error injection during exploration** — Malformed input, disconnect network, kill sessions mid-flow.

### Test Case Design
4. **Equivalence partitioning** — Test one representative from each valid/invalid class.
5. **Boundary value analysis** — Test at min, min+1, max-1, max.
6. **Decision table testing** — Truth table for all business rule combinations.
7. **State transition testing** — Cover every valid and invalid state transition.

### Defect Management
8. **Root cause annotation** — Tag every resolved defect with its root cause category.
9. **Defect clustering analysis** — Focus testing on modules that produce the most defects.
10. **Regression test linkage** — Every fixed defect gets a regression test before merge.

### Test Automation Patterns
11. **Page Object Model** — Encapsulate UI selectors in page objects.
12. **Arrange-Act-Assert** — Three distinct phases per test.
13. **Test independence** — No shared mutable state, no required execution order.
14. **Retry-aware assertions** — Use `waitFor`/`eventually` for async, not fixed delays.
15. **Test tagging** — Tag by type (smoke, critical-path, slow) for targeted CI runs.

### E2E Testing
16. **Stable selectors** — Use `data-testid` or accessibility roles, never CSS classes.
17. **Screenshot/video on failure** — Auto-capture for faster debugging.
18. **Parallel execution with isolation** — Isolated user accounts and data per worker.

### API Testing
19. **Schema validation on every response** — Validate against OpenAPI/JSON Schema.
20. **Authentication and authorization matrix** — Test every endpoint with no auth, expired, wrong role, correct role.
21. **Request validation testing** — Missing fields, wrong types, oversized payloads.

### Security Testing
22. **OWASP Top 10 scan on every PR** — Automated SAST tools.
23. **Secret scanning** — TruffleHog or GitLeaks on commits.
24. **CORS policy testing** — Verify restrictive headers, no wildcard in production.

### Performance Testing
25. **Baseline performance budgets** — API p95 < 200ms, LCP < 2.5s, bundle < 200KB.
26. **Frontend performance in CI** — Lighthouse/Web Vitals checks, fail on regression.

### Test Data Management
27. **Factory functions over fixtures** — Generate data programmatically, not static JSON.
28. **Minimal test data** — Each test creates only what it needs.
29. **Separate data per parallel worker** — Namespace to prevent collisions.

### Test Reporting
30. **Test result trend tracking** — Pass/fail/skip over time.
31. **Flaky test rate metric** — Track and drive toward zero.
32. **PR-level test summary** — Post pass count, fail count, coverage, duration as PR comment.

---

## Product Manager Practices (28 selected from 88)

### Requirements
1. **5 Whys Analysis** — Dig to the root user need, not surface-level feature requests.
2. **Assumption logging** — Register every assumption with a validation method.

### PRD Standards
3. **Problem-first structure** — Open with problem and evidence before mentioning solutions.
4. **Non-goals section** — Explicitly list what the feature will NOT do.
5. **Living document with changelog** — Every edit logged with date, author, rationale.

### User Stories
6. **INVEST compliance** — Independent, Negotiable, Valuable, Estimable, Small, Testable.
7. **Definition of Ready** — Stories need acceptance criteria, estimate, dependencies, no open questions before entering work.

### Acceptance Criteria
8. **Given-When-Then format** — Gherkin-style for direct test generation.
9. **Boundary value specification** — Behavior at boundary, one below, one above.
10. **Negative case coverage** — At least one "what should NOT happen" scenario per AC set.
11. **Testability validation** — If an AC can't be automated, rewrite it.

### Backlog Management
12. **MoSCoW classification** — Must/Should/Could/Won't for current horizon.
13. **Regular backlog grooming** — Review top N weekly; archive anything untouched 90+ days.
14. **Single ordered backlog** — One list per product, no shadow backlogs.

### Scope Management
15. **Change request process** — Additions after sign-off require impact analysis.
16. **Scope freeze date** — Hard date after which no new scope for current release.

### Feature Decomposition
17. **Vertical slicing** — Thin user-visible slices that deliver value independently.
18. **Dependency graph construction** — Map inter-slice dependencies, reorder to minimize blocks.

### Risk
19. **Risk register** — Living doc of risks with probability, impact, mitigation, owner.
20. **Pre-mortem exercise** — "Assume this failed — what went wrong?" before starting.

### Success Metrics
21. **Instrumentation before launch** — Analytics/telemetry code is part of Definition of Done.
22. **Baseline measurement** — Record current state before launch for comparison.

### Edge Cases
23. **Systematic input exploration** — Empty, null, max length, special chars, Unicode, negative, zero, concurrent.
24. **Failure mode brainstorm** — For every integration: timeout, partial failure, duplicate, auth expiry.

### Non-Functional Requirements
25. **Performance budgets** — p50/p95/p99 response time targets per endpoint.
26. **Security requirements specification** — Auth method, authorization model, encryption, compliance per feature.
27. **Data retention and privacy** — How long stored, when purged, user controls for export/deletion.

### Traceability
28. **Commit-to-story linkage** — Every commit references the story/requirement ID.

---

## Architecture Practices (30 selected from 110)

### ADRs
1. **MADR format** — Status, Context, Decision, Consequences.
2. **ADR for every non-trivial choice** — New dependency, cross-module change, or public interface change.
3. **Supersede, never delete** — Mark old as Superseded, link to replacement.
4. **Include rejection rationale** — Document alternatives and why they were rejected.

### LLD Standards
5. **Standard LLD template** — Problem, Solution, Data Model, API Changes, Sequence Diagram, Rollback Plan.
6. **Include failure modes** — At least three failure scenarios and how the system handles each.
7. **Link LLD to ADRs** — Reference architectural constraints.

### System Design
8. **Start with modular monolith** — Extract services only when scaling demands it.
9. **Enforce module boundaries** — Only interface package is importable; internal packages are lint errors.
10. **Event-driven for cross-domain side effects** — Publish domain events, not synchronous calls.

### API Design
11. **Contract-first with OpenAPI** — Define schema before writing handlers.
12. **Consistent error response format** — Same structure everywhere.
13. **Deprecation policy with sunset headers** — Sunset date + Link to replacement.

### Data Modeling
14. **UUIDs or ULIDs for public-facing IDs** — Never expose auto-increment externally.
15. **Normalize to 3NF, denormalize deliberately** — Only with measured performance justification + ADR.

### Security Architecture
16. **Defense in depth** — Network segmentation + app auth + input validation + encryption.
17. **Input validation at the boundary** — Schema validation (Zod, JSON Schema) at controller layer.

### Resilience
18. **Circuit breaker on every external dependency** — Fail fast instead of queuing timeouts.
19. **Retry with exponential backoff and jitter** — Prevent synchronized retry storms.
20. **Set timeouts on every outbound call** — No indefinite waits.
21. **Dead letter queues for failed async work** — Failed messages go to DLQ, never silently discarded.

### Observability
22. **Structured logging in JSON** — timestamp, level, service, trace_id, message.
23. **Distributed tracing with correlation IDs** — Trace ID propagated through all calls.
24. **RED metrics for every service** — Rate, Errors, Duration.

### Code Organization
25. **Organize by feature/domain, not by layer** — `src/orders/` not `src/controllers/`.
26. **Collocate tests with source** — `user.service.ts` and `user.service.test.ts` in same directory.

### Migration
27. **Expand-contract for schema changes** — Add new, migrate, update code, remove old.
28. **Feature flags for incremental rollout** — Deploy without releasing, roll back without redeploying.

### Diagramming
29. **Diagrams as code** — Mermaid/PlantUML in version control, diffable and reviewable.
30. **Sequence diagrams for complex interactions** — Any flow with 3+ systems gets a diagram.

---

## Documentation Practices (24 selected from 82)

### User-Facing Docs
1. **Task-oriented structure** — Organize around what users want to accomplish, not features.
2. **Success criteria** — End each guide with "you'll know it worked when..."

### API Documentation
3. **Spec-first authoring** — Generate from OpenAPI spec, never hand-write endpoint lists.
4. **Runnable examples** — Copy-pasteable cURL or SDK examples per endpoint.
5. **Error code registry** — Canonical table of error codes with cause and remediation.

### Writing Style
6. **Plain language** — Target 8th-grade reading level.
7. **Active voice and direct address** — "You" and imperative verbs.
8. **One idea per sentence** — Under 25 words, complex instructions in numbered steps.
9. **Consistent terminology** — One term per concept, enforced via glossary.
10. **No weasel words** — Ban "simply", "just", "easy", "obviously".

### Docs as Code
11. **Docs live in the repo** — Co-located with code, same PR review process.
12. **Link checking in CI** — Dead-link checker on every PR, broken links block merge.

### Freshness
13. **Frontmatter metadata** — `last-reviewed`, `owner`, `relates-to` in every doc.
14. **Staleness alerts** — Flag docs whose source files changed since last review.
15. **Diff-triggered doc updates** — When code changes a signature/schema/flag, check if docs need updating.

### Screenshots
16. **Diagram source in repo** — Always commit editable source alongside rendered images.

### Code Examples
17. **Tested snippets** — Code examples in `docs/examples/` run in CI.
18. **Complete and runnable** — Include imports, setup, teardown.

### Templates
19. **Template library** — Templates for each doc type in `docs/templates/`.
20. **Required sections enforced** — Agent validates doc types include required sections.
21. **Frontmatter schema validation** — JSON Schema for frontmatter, validated in CI.

### Changelog
22. **Keep a Changelog format** — Added, Changed, Deprecated, Removed, Fixed, Security.
23. **Breaking change callouts** — Dedicated section with migration instructions.

### Glossary
24. **Single canonical glossary** — One glossary file, rejected synonyms listed, lint for undefined jargon.

---

**Total approved: 151 practices from 508**

**Skipped:**
- Developer: "Rebase before merge" — excluded by operator decision
