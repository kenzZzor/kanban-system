# Kanban System

Локальная корпоративная система управления задачами на основе Kanban.

Система предназначена для организации рабочего процесса внутри компании с учётом структуры подразделений, ролей и прав доступа, иерархии сотрудников, проектов, задач, междепартаментного взаимодействия, комментариев, истории изменений и уведомлений.

Проект разрабатывается как внутренний корпоративный продукт с серверной проверкой прав доступа, транзакционной обработкой критических изменений и централизованным аудитом действий пользователей.

## Project Status

**Current stage:** Foundation + Database Foundation

На текущем этапе подготовлена базовая архитектура приложения и инфраструктура базы данных:

* создано Next.js-приложение с TypeScript;
* настроены ESLint и Tailwind CSS;
* подготовлен Podman-окружение;
* запущен PostgreSQL 16;
* подключён Prisma ORM 7;
* разработана первоначальная доменная модель;
* создана и применена первая Prisma migration;
* сгенерирован Prisma Client;
* настроена базовая структура проекта и правила разработки.

Следующие этапы включают seed-данные, аутентификацию, RBAC, организационную структуру, управление задачами, междепартаментный workflow, аудит, Kanban-интерфейс и отчётность.

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

## Core Domain Model

Основные сущности базы данных:

```text
User
├── DepartmentMember
├── ProjectMember
├── Task
├── Comment
├── ActivityLog
└── Notification

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
* уведомления.

## Roles

В системе предусмотрены следующие роли:

| Role               | Scope                                       |
| ------------------ | ------------------------------------------- |
| `SYSTEM_ADMIN`     | системный уровень                           |
| `DEPARTMENT_ADMIN` | управление департаментом                    |
| `MANAGER`          | управление сотрудниками и рабочими задачами |
| `EMPLOYEE`         | работа с назначенными задачами              |
| `VIEWER`           | просмотр доступных данных                   |

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
* Zod

### Infrastructure

* Podman
* Docker Compose-compatible configuration
* Nginx — планируется на этапе deployment

### Testing

* TypeScript checks
* ESLint
* Unit / Integration tests
* Playwright E2E — планируется по мере формирования функциональных срезов

## Repository Structure

```text
kanban-system/
│
├── app/
│   ├── auth/
│   ├── dashboard/
│   ├── my-tasks/
│   ├── tasks/
│   ├── kanban/
│   ├── backlog/
│   ├── departments/
│   ├── projects/
│   ├── team/
│   ├── reports/
│   ├── activity/
│   ├── notifications/
│   ├── settings/
│   └── admin/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── tasks/
│   ├── kanban/
│   └── dashboard/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── permissions/
│   ├── validation/
│   ├── services/
│   └── utils/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── tests/
│
├── public/
│
├── compose.yaml
├── Dockerfile
├── .env.example
├── AGENTS.md
├── CLAUDE.md
├── ARCHITECTURE.md
├── DATABASE.md
├── API.md
└── README.md
```

Некоторые директории и документы будут добавляться по мере реализации соответствующих функциональных модулей.

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

## Development Checks

Перед фиксацией значимого изменения необходимо проверить проект:

```bash
npx prisma validate
npx prisma migrate status
npm run lint
npm run build
```

Для каждого законченного функционального среза также должны добавляться соответствующие автоматизированные тесты.

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
* [x] Initial migration
* [x] Prisma Client generation
* [ ] Development seed

### Core Platform

* [ ] Authentication
* [ ] Server-side sessions
* [ ] RBAC
* [ ] Permissions
* [ ] Departments
* [ ] Department membership
* [ ] Employee hierarchy

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
* [ ] E2E tests
* [ ] Security hardening
* [ ] Error handling and observability
* [ ] Database backup strategy
* [ ] Production deployment

## Git Workflow

Работа ведётся через небольшие осмысленные коммиты, соответствующие законченным этапам разработки.

Пример:

```text
foundation: initialize application and database
data: add development seed
auth: implement authentication and sessions
rbac: implement roles and permissions
organization: implement departments and hierarchy
tasks: implement task core
kanban: implement kanban workflow
```

Каждый commit должен оставлять проект в рабочем и проверяемом состоянии.
