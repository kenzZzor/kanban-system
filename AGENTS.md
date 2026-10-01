<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

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

Keep the project structure consistent with the project architecture.

Expected main directories:

- `app/` — Next.js routes and pages
- `components/` — reusable UI components
- `lib/auth/` — authentication
- `lib/db/` — database access
- `lib/permissions/` — authorization
- `lib/validation/` — validation schemas
- `lib/services/` — business logic
- `prisma/` — Prisma schema, migrations and seed
- `tests/` — automated tests
- `public/` — static assets

Do not create parallel or temporary structures such as:

- `components2/`
- `kanban-v2/`
- `utils-final/`
- duplicated versions of existing modules

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
10. Create notifications when required.
11. Return a consistent response.

Never rely on frontend checks for security.

Do not trust user-supplied IDs, roles, department IDs or permissions without verifying access on the server.

Use appropriate HTTP error semantics:

- `401` — unauthenticated
- `403` — forbidden
- `404` — resource not found
- `409` — conflict
- `422` — validation error
- `500` — unexpected server error

## Roles and Permissions

The initial role model is:

- `SYSTEM_ADMIN`
- `DEPARTMENT_ADMIN`
- `MANAGER`
- `EMPLOYEE`
- `VIEWER`

Permission checks must be implemented at the API/service layer.

Hiding a button in the UI is not an authorization mechanism.

Department membership and manager/subordinate hierarchy must be modeled explicitly. Do not infer hierarchy from user names or frontend state.

## Task Workflow

The primary task workflow is:

`NEW -> ANALYSIS -> BACKLOG -> READY -> IN_PROGRESS -> REVIEW -> TESTING -> DONE`

Additional statuses:

- `BLOCKED`
- `CANCELLED`

Workflow transitions are business rules and should not be scattered through unrelated UI components.

Status changes must be validated on the server.

## Cross-Department Work

Tasks must support:

- source department
- assigned department
- assignee
- project

Cross-department work may use direct assignment or a request flow according to department policy.

Cross-department actions must be authorized and recorded in Activity/Audit.

## Activity, Audit and Notifications

Activity is a human-readable history/feed.

Audit is an immutable record of important system mutations.

Important mutations should write their audit information in the same database transaction as the business mutation.

Relevant events include:

- `TASK_CREATED`
- `TASK_ASSIGNED`
- `TASK_STATUS_CHANGED`
- `TASK_PRIORITY_CHANGED`
- `TASK_DUE_DATE_CHANGED`
- `MEMBER_ADDED`
- `ROLE_CHANGED`
- `DEPARTMENT_CREATED`
- `PROJECT_CREATED`
- `COMMENT_ADDED`

Notifications should be generated for relevant events such as assignment, comments, status changes, cross-department requests and approaching deadlines.

## UI and UX

- Desktop-first corporate interface.
- Responsive for laptop and tablet.
- Task is the central business object.
- Every important screen must handle loading, empty, no-results, error and permission states.
- Critical actions require confirmation where appropriate.
- Status and priority must not rely only on color.
- Preserve filters, sorting and current context when navigating.
- Drag-and-drop Kanban updates must go through the API.
- Optimistic UI may be used, but failed mutations must roll back and show the reason.
- Keyboard-accessible alternatives must exist for drag-and-drop actions.

## Code Quality

- Prefer small, focused modules.
- Reuse existing components and services.
- Avoid unnecessary abstractions.
- Do not perform unrelated rewrites.
- Do not silently change architecture.
- Do not silently change dependencies.
- Do not remove working functionality without an explicit reason.
- Keep naming consistent with the domain model.
- Avoid duplicated business logic.

## Testing

After each meaningful vertical slice, run:

- typecheck
- lint
- relevant unit tests
- relevant integration tests
- relevant E2E tests when applicable

Important business rules must have automated tests.

At minimum, test:

- permissions
- workflow transitions
- input validation
- task creation
- assignment
- RBAC restrictions
- audit creation
- cross-department operations

## Vertical Slice Rule

Features should be implemented as complete vertical slices:

Database -> server/service -> authorization -> validation -> API -> UI -> Activity/Audit -> notifications -> tests

A feature is not considered complete merely because a UI screen exists.

## Git

Every meaningful completed change must have a separate Git commit.

Commits should represent complete functional chunks.

Do not commit:

- secrets
- `.env` files
- `node_modules`
- build output
- IDE-specific files

Before committing:

1. Review changed files.
2. Run typecheck.
3. Run lint.
4. Run relevant tests.
5. Confirm no unrelated files were modified.

## AI Coding Rules

Before changing code:

1. Inspect the existing implementation.
2. Identify the files that need to change.
3. Explain architectural impact when relevant.
4. Do not invent existing APIs, database tables or relations.
5. Do not change the database schema without an explicit task.
6. Do not add mock production data.
7. Do not hide security or validation errors.
8. Preserve working behavior outside the requested change.

After changing code:

1. Show the changed files.
2. Explain important implementation decisions.
3. Run the relevant checks.
4. Report environment, migration or dependency requirements.
5. Identify anything that still needs to be done.

## Documentation

Update project documentation when architecture, API contracts, database structure or development procedures change.

Important documentation files include:

- `README.md`
- `ARCHITECTURE.md`
- `DATABASE.md`
- `API.md`
- `AGENTS.md`

## Definition of Done

A feature is complete only when the required parts exist:

- data model
- server/service logic
- API or server action contract
- validation
- server-side permissions
- error/conflict handling
- UI happy path
- UI failure states
- Activity/Audit where required
- notifications where required
- appropriate automated tests
- typecheck
- lint
- documentation updates when necessary
- Git commit

Do not report a feature as complete if only the UI has been implemented.
