<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory, in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kanban System — Development Rules

## Architecture

- Use TypeScript with strict mode.
- Use Next.js App Router.
- Use a modular monolith architecture.
- Use PostgreSQL as the primary database.
- Use Prisma as the ORM.
- Use Zod for external input validation.
- Authentication and authorization are enforced on the server.
- Do not introduce microservices without an explicit architectural decision.
- Do not introduce new frameworks, libraries, or infrastructure without explaining why they are necessary.

## Project Structure

Use the existing project structure first. Current modules include `app/`, `lib/auth/`, `lib/api/`, `lib/permissions/`, `lib/activity/`, `lib/services/`, `lib/db.ts`, `lib/db-transaction.ts`, `prisma/` and `tests/`. `components/` and additional domain folders may be introduced for frontend work when justified by the slice.

Do not create a directory just because it appears in a generic architecture sketch. In particular, do not create parallel `lib/db/`, `lib/validation/`, `components2/`, `kanban-v2/` or `utils-final/` structures without an explicit decision. Keep naming and layering consistent with actual code.

## Database

- PostgreSQL + Prisma are the source of truth for business data.
- Do not use mock data as production data.
- Do not change the database schema without an explicit task or architectural reason.
- Database constraints and indexes must be deliberate.
- Business-critical mutations must use transactions where appropriate.
- Important mutations must create Activity/Audit records.
- Never bypass Prisma with ad-hoc database access unless there is a documented reason.

## API and Server Logic

Every mutation must follow this general pipeline:

1. Authenticate the request.
2. Resolve the current user.
3. Check that the account is active.
4. Resolve department membership and role where required.
5. Check authorization for the requested action and resource.
6. Validate external input with Zod.
7. Apply business rules.
8. Execute the database mutation.
9. Create Activity/Audit records when required.
10. Create notifications when required by the implemented workflow.
11. Return the established response contract.

Never rely on frontend checks for security. Do not trust user-supplied IDs, roles, department IDs or permissions without verifying access on the server.

Use appropriate HTTP error semantics according to each API contract:

- `401` — unauthenticated
- `403` — forbidden
- `404` — resource not found
- `409` — conflict
- `422` — validation error where used by the established contract
- `500` — unexpected server error

The existing API contains both newer shared-handler routes and legacy handlers. New routes should use `apiHandler`, `requireUser`, and the shared AppError/error envelope where applicable. Do not claim every existing endpoint already has the same error payload; document and migrate legacy behavior in a deliberate task.

## Roles and Permissions

The initial role model is:

- `SYSTEM_ADMIN`
- `DEPARTMENT_ADMIN`
- `MANAGER`
- `EMPLOYEE`
- `VIEWER`

`SYSTEM_ADMIN` is global; the other roles are scoped to `DepartmentMember`. Permission checks must be implemented at the API/service layer. Hiding a button in the UI is not an authorization mechanism.

Department membership and manager/subordinate hierarchy must be modeled explicitly. Do not infer hierarchy from user names or frontend state.

## Task Workflow

The target task workflow, completion review by the task assigner/requester, task timing, and multi-employee assignment are defined in `docs/DEVELOPMENT_PLAN.md`. Do not independently choose or reintroduce a different list of status codes. The five-stage interpretation remains a product decision to confirm before Task API/workflow implementation. Existing Prisma status rows do not prove that the target workflow is implemented.

Status transitions are business rules and must be centralized and validated on the server. Do not scatter workflow logic through UI components.

## Cross-Department Work

The intended task model distinguishes source department, assigned department, assignee and optional project. Cross-department work may use direct assignment or a request flow according to the approved design. Cross-department actions must be authorized and recorded in Activity/Audit. These are target requirements until the corresponding API and tests exist.

## Activity, Audit and Notifications

Activity is a human-readable history/feed. Audit is an immutable record of important system mutations. Important mutations should write required history in the same database transaction as the business mutation. Notifications are created only when the corresponding triggers and workflow are implemented.

Examples of domain events include `TASK_CREATED`, `TASK_ASSIGNED`, `TASK_STATUS_CHANGED`, `TASK_PRIORITY_CHANGED`, `TASK_DUE_DATE_CHANGED`, `MEMBER_ADDED`, `ROLE_CHANGED`, `DEPARTMENT_CREATED`, `PROJECT_CREATED` and `COMMENT_ADDED`. Check the actual Prisma enum before using an event code.

## UI and UX

- Desktop-first corporate interface, responsive for laptop and tablet.
- Task is the central business object.
- Every important screen must handle loading, empty, no-results, error and permission states.
- Critical actions require confirmation where appropriate.
- Status and priority must not rely only on color.
- Preserve filters, sorting and current context when navigating.
- Drag-and-drop Kanban updates must go through the API.
- Optimistic UI may be used, but failed mutations must roll back and show an appropriate reason.
- Keyboard-accessible alternatives must exist for drag-and-drop actions.
- Do not build UI against hypothetical endpoints or use mock data to disguise a missing backend contract.

## Code Quality

- Prefer small, focused modules.
- Reuse existing components and services.
- Avoid unnecessary abstractions.
- Do not perform unrelated rewrites.
- Do not silently change architecture or dependencies.
- Do not remove working functionality without an explicit reason.
- Keep naming consistent with the domain model.
- Avoid duplicated business logic.

## Testing

After each meaningful vertical slice, run the checks named in the task, normally including typecheck, lint, relevant unit tests, and relevant Playwright/API or E2E tests. Important business rules must have automated tests for permissions, workflow transitions, validation, creation, assignment, RBAC, Activity/Audit and cross-department operations as those modules are implemented.

## Vertical Slice Rule

Features should be implemented as complete vertical slices:

Database -> server/service -> authorization -> validation -> API -> UI -> Activity/Audit -> notifications when required -> tests.

A feature is not complete merely because a UI screen or database table exists. Distinguish implemented behavior from planned behavior in status reports and documentation.

## Git

Every meaningful completed change should have a separate Git commit representing one coherent functional chunk. Do not commit secrets, `.env` files, `node_modules`, build output or IDE-specific files.

Before a commit:

1. Review changed files.
2. Run typecheck.
3. Run lint.
4. Run relevant tests.
5. Confirm no unrelated files were modified.

The AI agent must not run `git commit`, `git push`, `git reset`, or commands that rewrite Git history. The owner commits/pushes after reviewing the change.

## AI Coding Rules

Before changing code:

1. Inspect only the task-specified files and the minimum directly referenced files necessary to understand existing behavior.
2. Identify the files that need to change.
3. Explain architectural impact when relevant.
4. Do not invent existing APIs, database tables or relations.
5. Do not change the database schema without an explicit task.
6. Do not add mock production data.
7. Do not hide security or validation errors.
8. Preserve working behavior outside the requested change.
9. Present a plan and wait for owner approval before editing.

After changing code:

1. Show the changed files.
2. Explain important implementation decisions.
3. Run the relevant checks.
4. Report environment, migration or dependency requirements.
5. Identify anything that still needs to be done.

## Documentation

Keep documentation separated by purpose and update it when architecture, API contracts, database structure or implementation procedures change:

- `README.md` — short overview, quick start and links.
- `docs/DEVELOPMENT_PLAN.md` — the single canonical implementation sequence and target business requirements.
- `docs/PROJECT_STATUS.md` — factual implemented vs pending state, separate from the plan.
- `docs/ARCHITECTURE.md` — architecture and module boundaries.
- `docs/DATABASE.md` — current Prisma data model and constraints.
- `docs/API.md` — implemented endpoints and contracts only.
- `docs/AGENT_BRIEF.md` — short agent context and links, not a duplicate of the plan.
- `AGENTS.md` — persistent coding-agent rules.

Do not create a second ordered roadmap such as `docs/PRIORITIES.md`. `DEVELOPMENT_PLAN.md` defines the order and target requirements; `PROJECT_STATUS.md` records actual implementation. Technical reference documents do not override the plan. If they conflict, report the discrepancy and inspect the implementation before proceeding.

## Definition of Done

A feature is complete only when the required parts exist:

- data model when required;
- server/service logic;
- API or server action contract;
- validation;
- server-side permissions;
- error/conflict handling;
- UI happy path and failure states;
- Activity/Audit where required;
- notifications where required;
- appropriate automated tests;
- typecheck and lint;
- documentation updates when necessary;
- Git commit by the owner.

Do not report a feature as complete if only the UI has been implemented.
