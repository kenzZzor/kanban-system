# Kanban System

Локальная корпоративная система управления задачами на основе Kanban.

Система предназначена для организации рабочего процесса внутри компании с учётом структуры подразделений, ролей и прав доступа, иерархии сотрудников, проектов, задач, междепартаментного взаимодействия, комментариев, истории изменений и уведомлений.

Проект разрабатывается как внутренний корпоративный продукт с серверной проверкой прав доступа, транзакционной обработкой критических изменений и централизованным аудитом действий пользователей.

## Project Status

**Current stage:** Foundation + Authentication

На текущем этапе завершены базовая архитектура приложения, инфраструктура базы данных и первый функциональный срез аутентификации.

Реализовано:

* создано Next.js-приложение с TypeScript;
* настроены ESLint и Tailwind CSS;
* подготовлено Podman-окружение;
* запущен PostgreSQL 16;
* подключён Prisma ORM 7;
* разработана доменная модель базы данных;
* созданы и применены Prisma migrations;
* сгенерирован Prisma Client;
* реализованы development seed-данные;
* настроено подключение приложения к PostgreSQL;
* реализована session-based authentication;
* реализовано хеширование паролей через bcrypt;
* реализованы login / logout / current-user API;
* серверные сессии хранятся в PostgreSQL;
* session token не хранится в базе данных в открытом виде;
* добавлены Playwright E2E-тесты для authentication flow;
* выполнены typecheck, lint, build и automated tests.

Следующий функциональный этап — RBAC и серверная модель permissions, после чего будет реализована организационная структура, проекты и задачи.

## Product Scope

Основные функциональные области системы:

* аутентификация пользователей;
* роли и разграничение доступа;
* департаменты и организационная иерархия;
* сотрудники и руководители;
* проекты;
* задачи;
* Kanban workflow;
* назначение задач сотрудникам;
* междепартаментные задачи;
* комментарии;
* Activity / Audit;
* уведомления;
* Dashboard;
* базовая отчётность;
* административное управление.

## Architecture

Проект реализуется как **модульный монолит**.

```text
Browser
   │
   ▼
Next.js
   │
   ├── UI / Pages
   ├── API / Route Handlers
   ├── Authentication
   ├── Authorization
   └── Business Services
            │
            ▼
         Prisma
            │
            ▼
       PostgreSQL
```

Критические изменения данных проходят через серверную бизнес-логику:

```text
Request
   ↓
Authentication
   ↓
Permission Check
   ↓
Validation
   ↓
Business Logic
   ↓
Database Transaction
   ↓
Activity / Audit
   ↓
Notification
```

Проверка прав доступа выполняется на сервере и не зависит от ограничений интерфейса.

## Authentication

Текущий authentication layer использует серверные сессии.

Основной flow:

```text
Login Request
     ↓
Validate Credentials
     ↓
Find Active User
     ↓
Verify Password
     ↓
Create Session
     ↓
Store Session Hash in PostgreSQL
     ↓
Set HttpOnly Cookie
```

Сессия:

```text
Browser
   │
   │ kanban_session cookie
   ▼
Next.js
   │
   ▼
SHA-256 token hash
   │
   ▼
Session
   │
   ▼
User
```

Реализованные endpoints:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Cookie сессии имеет следующие свойства:

* `HttpOnly`;
* `SameSite=Lax`;
* `Secure` в production;
* ограниченный срок действия;
* серверное удаление сессии при logout.

В PostgreSQL хранится только hash session token, а не исходный token.

## Core Domain Model

Основные сущности базы данных:

```text
User
├── DepartmentMember
├── ProjectMember
├── Task
├── Comment
├── ActivityLog
├── Notification
└── Session

Department
├── DepartmentMember
├── Project
└── Tasks

Project
├── ProjectMember
└── Task

Task
├── Status
├── Priority
├── Type
├── Assignee
├── Comments
└── Activity
```

В модели предусмотрены:

* пользователи;
* роли и permissions;
* департаменты;
* участники департаментов;
* иерархия сотрудников;
* проекты;
* участники проектов;
* статусы задач;
* приоритеты;
* типы задач;
* задачи;
* комментарии;
* журнал активности;
* уведомления;
* пользовательские сессии.

## Roles

В системе предусмотрены следующие роли:

| Role               | Scope                                       |
| ------------------ | ------------------------------------------- |
| `SYSTEM_ADMIN`     | системный уровень                           |
| `DEPARTMENT_ADMIN` | управление департаментом                    |
| `MANAGER`          | управление сотрудниками и рабочими задачами |
| `EMPLOYEE`         | работа с назначенными задачами              |
| `VIEWER`           | просмотр доступных данных                   |

`SYSTEM_ADMIN` является глобальной системной ролью и не привязывается к конкретному департаменту.

Остальные роли используются в контексте членства пользователя в департаменте.

Фактические проверки доступа реализуются на серверном уровне через RBAC и permission model.

## Task Workflow

Основной workflow задачи:

```text
NEW
  ↓
ANALYSIS
  ↓
BACKLOG
  ↓
READY
  ↓
IN_PROGRESS
  ↓
REVIEW
  ↓
TESTING
  ↓
DONE
```

Дополнительные состояния:

```text
BLOCKED
CANCELLED
```

Переходы между статусами являются частью бизнес-логики системы и должны выполняться через серверный API.

## Technology Stack

### Application

* Next.js 16
* React 19
* TypeScript

### UI

* Tailwind CSS
* shadcn/ui

### Backend / Data

* Next.js Server / API
* Prisma ORM 7
* PostgreSQL 16
* Prisma PostgreSQL adapter
* bcryptjs

### Infrastructure

* Podman
* Docker Compose-compatible configuration
* Nginx — планируется на этапе deployment

### Testing

* TypeScript
* ESLint
* Playwright
* E2E authentication tests
* Unit / Integration tests — по мере реализации соответствующих модулей

## Repository Structure

Текущая структура проекта:

```text
kanban-system/
│
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── login/
│   │       ├── logout/
│   │       └── me/
│   │
│   └── generated/
│       └── prisma/
│
├── lib/
│   ├── auth/
│   │   ├── current-user.ts
│   │   ├── password.ts
│   │   └── session.ts
│   │
│   └── db.ts
│
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   ├── seed.ts
│   └── prisma7.config.ts
│
├── tests/
│   └── auth.spec.ts
│
├── public/
│
├── compose.yaml
├── Dockerfile
├── .env.example
├── AGENTS.md
├── ARCHITECTURE.md
├── DATABASE.md
├── API.md
├── playwright.config.ts
└── README.md
```

По мере реализации функциональных модулей будут добавляться соответствующие директории `app/`, `components/` и `lib/`.

## Local Development

### Requirements

Для локальной разработки используются:

* Node.js
* npm
* Podman
* Git

### Install dependencies

```bash
npm install
```

### Start PostgreSQL

```bash
podman compose up -d
```

Проверить состояние контейнера:

```bash
podman ps
```

Остановить окружение:

```bash
podman compose down
```

### Environment

Создать `.env` на основе `.env.example`.

Основная переменная:

```env
DATABASE_URL="postgresql://kanban:kanban_dev@localhost:5432/kanban?schema=public"
```

Файл `.env` не хранится в Git.

## Database

PostgreSQL запускается в отдельном Podman-контейнере.

Текущая база данных:

```text
Database: kanban
Schema:   public
Port:     5432
```

Prisma используется как ORM и основной инструмент управления схемой базы данных.

Проверка схемы:

```bash
npx prisma validate
```

Проверка состояния миграций:

```bash
npx prisma migrate status
```

Создание development migration:

```bash
npx prisma migrate dev --name <migration_name>
```

Генерация Prisma Client:

```bash
npx prisma generate
```

Запуск development seed:

```bash
npx prisma db seed
```

Seed используется только для контролируемого development/test окружения.

## Authentication Testing

Для запуска E2E-тестов:

```bash
npx playwright test
```

Текущий authentication test suite проверяет:

* успешный login;
* создание и использование session cookie;
* получение текущего пользователя;
* logout;
* удаление серверной сессии;
* отказ при неверном пароле;
* отказ при отсутствии обязательных credentials.

Текущий результат:

```text
3 passed
```

Playwright автоматически запускает Next.js development server через `playwright.config.ts`.

## Development Checks

Перед фиксацией значимого изменения необходимо проверить проект:

```bash
npx prisma validate
npx prisma migrate status
npx tsc --noEmit
npm run lint
npm run build
```

Для функциональных срезов также запускаются соответствующие автоматизированные тесты:

```bash
npx playwright test
```

Каждый законченный функциональный срез должен проходить typecheck, lint и соответствующие tests.

## Development Principles

Проект развивается по принципу **vertical slices**:

```text
Database
   ↓
API
   ↓
Permissions
   ↓
UI
   ↓
Audit / Activity
   ↓
Notifications
   ↓
Tests
```

Основные правила разработки:

* бизнес-правила не должны реализовываться только на уровне UI;
* сервер является источником истины для авторизации и permissions;
* внешние входные данные проходят validation;
* критические изменения выполняются транзакционно;
* значимые изменения фиксируются в Activity / Audit;
* production-код не использует mock/demo data;
* изменения схемы БД выполняются через Prisma migrations;
* архитектура и зависимости не изменяются без необходимости;
* одна задача должна решаться без несвязанных переписываний проекта;
* завершённый функциональный срез должен проходить typecheck/lint/tests;
* значимые изменения фиксируются отдельными Git-коммитами.

Подробные правила AI-assisted development находятся в `AGENTS.md`.

## Roadmap

### Foundation

* [x] Project initialization
* [x] Next.js + TypeScript
* [x] ESLint
* [x] Tailwind CSS
* [x] Podman environment
* [x] PostgreSQL
* [x] Prisma
* [x] Initial domain schema
* [x] Prisma migrations
* [x] Prisma Client generation
* [x] Development seed

### Authentication

* [x] Authentication foundation
* [x] Password hashing
* [x] Server-side sessions
* [x] Login API
* [x] Logout API
* [x] Current user API
* [x] HttpOnly session cookie
* [x] Authentication E2E tests
* [ ] Authentication UI

### Core Platform

* [ ] RBAC
* [ ] Permissions
* [ ] Departments
* [ ] Department membership
* [ ] Employee hierarchy
* [ ] Authorization services

### Task Management

* [ ] Projects
* [ ] Task creation
* [ ] Task Details
* [ ] Task assignment
* [ ] Task status transitions
* [ ] Comments
* [ ] Cross-department workflow

### Collaboration

* [ ] Activity log
* [ ] Audit
* [ ] Notifications

### Interface

* [ ] Dashboard
* [ ] My Tasks
* [ ] All Tasks
* [ ] Kanban
* [ ] Backlog
* [ ] Team
* [ ] Projects
* [ ] Reports
* [ ] Administration
* [ ] Settings

### Quality & Deployment

* [ ] Unit tests
* [ ] Integration tests
* [x] E2E authentication tests
* [ ] Security hardening
* [ ] Error handling and observability
* [ ] Database backup strategy
* [ ] Production deployment

## Git Workflow

Работа ведётся через небольшие осмысленные коммиты, соответствующие законченным этапам разработки.

Примеры:

```text
foundation: initialize application and database
data: add development seed
feat: add session-based authentication
rbac: implement roles and permissions
organization: implement departments and hierarchy
tasks: implement task core
kanban: implement kanban workflow
```

Каждый commit должен оставлять проект в рабочем и проверяемом состоянии.
