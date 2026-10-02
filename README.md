# Kanban System

Локальная корпоративная система управления задачами на базе Kanban.

Проект разрабатывается как внутренний корпоративный продукт с аутентификацией, ролевой моделью доступа, организационной структурой, задачами, междепартаментным взаимодействием, аудитом действий, уведомлениями и аналитикой.

Разработка выполняется по принципу вертикальных функциональных срезов:

**Database → API/Service → Permissions → UI → Audit/Activity → Tests**

Функция считается завершённой только после реализации соответствующего серверного контракта, проверок доступа, обработки ошибок, пользовательского интерфейса и необходимых тестов.

---

## Current Stage

**Foundation + Authentication**

Фундамент проекта и базовая серверная аутентификация реализованы.

Следующий функциональный этап:

**RBAC — Role-Based Access Control и серверная модель permissions.**

На текущем этапе UI авторизации ещё не реализован. Разработка выполняется последовательно, без преждевременного перехода к Kanban, Dashboard или другим следующим модулям.

---

## Project Goals

Система должна предоставлять:

* аутентификацию пользователей;
* серверные сессии;
* ролевую модель доступа;
* подразделения и организационную структуру;
* команды и участников;
* проекты;
* задачи и Kanban workflow;
* назначение задач;
* работу между подразделениями;
* комментарии;
* Activity и Audit;
* уведомления;
* поиск;
* отчёты и аналитику;
* административные функции.

Ключевой принцип:

> Клиентский интерфейс не является источником истины для безопасности. Все критические проверки выполняются на сервере.

---

## Architecture

Используется архитектура **Modular Monolith**.

```text
Browser
   ↓
Next.js Application
   ├── UI / Pages / Components
   ├── API / Route Handlers
   ├── Authentication / Sessions
   ├── Permissions
   └── Business Services
          ↓
       Prisma
          ↓
     PostgreSQL
```

Локальная инфраструктура:

```text
Podman / Docker Compose
        ↓
   Next.js Application
        ↓
    PostgreSQL 16
```

На более позднем этапе production-окружение будет дополнено reverse proxy и HTTPS.

Микросервисная архитектура на текущем этапе не используется.

---

## Technology Stack

### Application

* Next.js
* TypeScript
* React
* Tailwind CSS
* shadcn/ui

### Backend / Data

* PostgreSQL 16
* Prisma 7
* Zod
* bcryptjs

### Testing

* Playwright
* Unit tests
* Integration tests
* E2E tests

### Infrastructure

* Podman
* Docker Compose
* Nginx — на production-этапе

### Version Control

* Git
* GitHub

---

## Repository Structure

Текущая структура репозитория:

```text
kanban-system/
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── login/
│   │       ├── logout/
│   │       └── me/
│   └── ...
│
├── lib/
│   ├── auth/
│   │   ├── current-user.ts
│   │   ├── password.ts
│   │   └── session.ts
│   └── db.ts
│
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
│
├── public/
│
├── tests/
│   └── auth.spec.ts
│
├── .env.example
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── compose.yaml
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── package-lock.json
├── playwright.config.ts
├── postcss.config.mjs
├── prisma7.config.ts
├── tsconfig.json
└── README.md
```

Структура будет расширяться по мере реализации следующих функциональных модулей.

---

## Development Principles

Проект развивается по следующим принципам.

### 1. Вертикальные функциональные срезы

Каждая значимая функция проходит полный цикл:

```text
Database
   ↓
API / Service
   ↓
Permissions
   ↓
UI
   ↓
Activity / Audit
   ↓
Tests
```

Нельзя считать функцию готовой только потому, что появился экран или таблица в базе данных.

### 2. Server-side authorization

Проверки доступа выполняются на сервере.

Нельзя доверять значениям, пришедшим от клиента:

* `userId`;
* `departmentId`;
* `roleId`;
* `assignedTo`;
* другим идентификаторам и параметрам, влияющим на права доступа.

### 3. No mock data in production

Seed используется только для development/test окружения.

Production не должен зависеть от демонстрационных данных.

### 4. Database changes

Изменения схемы выполняются через Prisma migrations.

Ручное изменение production-схемы без миграции не является штатным способом развития проекта.

### 5. Meaningful Git commits

Каждое существенное изменение должно фиксироваться отдельным Git commit.

Примеры:

```text
feat: add role based access control
feat: add department membership
fix: prevent unauthorized task update
docs: update README
test: add RBAC integration tests
```

---

# Authentication

Authentication реализована как серверная session-based модель.

## Implemented

* Password hashing через bcrypt;
* проверка пароля;
* server-side sessions;
* случайный session token;
* SHA-256 hash токена в базе;
* срок действия сессии;
* HttpOnly cookie;
* login API;
* logout API;
* current user API;
* удаление просроченных сессий;
* Playwright E2E tests.

## Authentication Flow

```text
User
 ↓
POST /api/auth/login
 ↓
Validate input
 ↓
Find active user
 ↓
Verify password
 ↓
Create random session token
 ↓
Store SHA-256 token hash
 ↓
Set HttpOnly cookie
 ↓
Authenticated requests
 ↓
Resolve current user from session
```

Сам session token не хранится в базе данных.

В базе хранится только его hash.

---

## Authentication API

### Login

```http
POST /api/auth/login
```

Назначение:

* принимает email и password;
* проверяет пользователя;
* проверяет активность пользователя;
* проверяет пароль;
* создаёт серверную сессию;
* устанавливает session cookie.

---

### Logout

```http
POST /api/auth/logout
```

Назначение:

* удаляет текущую серверную сессию;
* очищает session cookie.

---

### Current User

```http
GET /api/auth/me
```

Назначение:

* получает текущего аутентифицированного пользователя;
* возвращает `401 Unauthorized`, если действующая сессия отсутствует.

---

## Roles

Базовая ролевая модель системы:

```text
SYSTEM_ADMIN
DEPARTMENT_ADMIN
MANAGER
EMPLOYEE
VIEWER
```

### SYSTEM_ADMIN

Глобальная системная роль.

`SYSTEM_ADMIN` не привязан к конкретному Department.

Имеет системный scope.

### Department Roles

Следующие роли относятся к конкретному подразделению:

```text
DEPARTMENT_ADMIN
MANAGER
EMPLOYEE
VIEWER
```

Связь пользователя с подразделением реализуется через `DepartmentMember`.

Роль и manager scope относятся к membership, а не непосредственно к `User`.

---

# Database

Основная СУБД:

**PostgreSQL 16**

ORM:

**Prisma 7**

Основные доменные сущности уже заложены в Prisma schema и будут постепенно использоваться функциональными модулями системы.

Текущая база данных включает фундаментальные сущности для:

* пользователей;
* ролей;
* permissions;
* подразделений;
* membership;
* проектов;
* задач;
* комментариев;
* Activity;
* notifications;
* sessions.

Изменения схемы выполняются через:

```bash
npx prisma migrate dev
```

Проверка состояния миграций:

```bash
npx prisma migrate status
```

Генерация Prisma Client:

```bash
npx prisma generate
```

Проверка схемы:

```bash
npx prisma validate
```

---

# Local Development

## Requirements

Для локальной разработки необходимы:

* Node.js 22+
* npm
* Git
* Podman или Docker

Проверить версии:

```bash
node -v
npm -v
git --version
podman --version
```

---

## Install Dependencies

```bash
npm install
```

---

## Environment

Создать `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Текущий локальный connection string:

```env
DATABASE_URL="postgresql://kanban:kanban_dev@localhost:5432/kanban?schema=public"
```

Файл `.env` не должен попадать в Git.

---

# PostgreSQL

Локальная база запускается через Podman/Docker Compose.

Запуск:

```bash
podman compose up -d
```

Проверка контейнера:

```bash
podman ps
```

Ожидаемый PostgreSQL container:

```text
kanban-postgres
```

Остановка:

```bash
podman compose down
```

---

# Prisma

После изменения Prisma schema:

```bash
npx prisma generate
```

Создание migration:

```bash
npx prisma migrate dev --name <migration_name>
```

Проверка:

```bash
npx prisma validate
npx prisma migrate status
```

---

# Development Server

Запуск приложения:

```bash
npm run dev
```

После запуска приложение доступно локально по адресу:

```text
http://localhost:3000
```

---

# Development Seed

Для development/test окружения используется Prisma seed.

Seed содержит контролируемые тестовые данные для локальной разработки:

* пользователей;
* роли;
* подразделения;
* memberships;
* проекты;
* задачи;
* Activity;
* notifications.

Seed не предназначен для production.

Тестовый системный пользователь:

```text
Email:
system.admin@kanban.local
```

Development password:

```text
DevOnly123!
```

Этот пароль предназначен исключительно для локального development/test окружения.

---

# Testing

Проект использует несколько уровней тестирования.

## Unit Tests

Используются для проверки изолированной бизнес-логики:

* permissions;
* workflow;
* validation;
* utilities.

## Integration Tests

Используются для проверки взаимодействия:

```text
API
 ↓
Service
 ↓
Prisma
 ↓
PostgreSQL
```

В том числе:

* RBAC;
* database constraints;
* audit transactions;
* cross-department operations.

## E2E Tests

Playwright используется для проверки реальных пользовательских сценариев.

Текущие authentication E2E tests проверяют:

* login;
* authenticated `/me`;
* logout;
* невозможность получить `/me` после logout.

Запуск:

```bash
npx playwright test
```

---

# Code Quality

Перед фиксацией значимого изменения необходимо выполнить проверки:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Для изменений базы:

```bash
npx prisma validate
npx prisma migrate status
```

Для соответствующих функциональных изменений:

```bash
npx playwright test
```

---

# Task Workflow

Основной workflow задач:

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

Изменение статуса является серверной операцией и в дальнейшем должно учитывать:

* authentication;
* authorization;
* validation;
* business rules;
* Activity/Audit;
* notifications;
* tests.

---

# Planned Modules

Основные функциональные разделы системы:

```text
Authentication
      ↓
RBAC
      ↓
Departments
      ↓
Projects
      ↓
Tasks
      ↓
Cross-department work
      ↓
Activity / Audit
      ↓
Kanban
      ↓
Dashboard
      ↓
Management
      ↓
Reports
      ↓
Hardening
      ↓
QA
      ↓
Production
```

---

# Roadmap

## Phase 0 — Project Fixation

* [x] Define project goal
* [x] Define architecture
* [x] Define technology stack
* [x] Define development principles
* [x] Define RBAC model
* [x] Define task workflow
* [x] Define testing strategy

## Phase 1 — Foundation

* [x] Initialize Next.js + TypeScript
* [x] Configure ESLint
* [x] Configure Tailwind CSS
* [x] Configure PostgreSQL
* [x] Configure Podman / Compose
* [x] Configure Prisma 7
* [x] Create initial database schema
* [x] Create migrations
* [x] Configure Prisma Client
* [x] Create development seed
* [x] Configure database connection

## Phase 2 — Authentication

* [x] Password hashing
* [x] Password verification
* [x] Server-side sessions
* [x] Session token hashing
* [x] Session expiration
* [x] HttpOnly session cookie
* [x] Login API
* [x] Logout API
* [x] Current user API
* [x] Authentication E2E tests
* [ ] Authentication UI

## Phase 3 — RBAC

* [ ] Role model
* [ ] Permission model
* [ ] Role-permission mapping
* [ ] Global SYSTEM_ADMIN scope
* [ ] Department-scoped roles
* [ ] Server-side permission checks
* [ ] Permission helper/service
* [ ] API authorization
* [ ] RBAC unit tests
* [ ] RBAC integration tests

## Phase 4 — Organization

* [ ] Department creation
* [ ] Department details
* [ ] Department membership
* [ ] Managers
* [ ] Teams
* [ ] Employee membership
* [ ] Department permissions
* [ ] Organization UI
* [ ] Organization tests

## Phase 5 — Task Core

* [ ] Create task
* [ ] Task details
* [ ] Task list
* [ ] Task editing
* [ ] Assignment
* [ ] Priority
* [ ] Task type
* [ ] Project relation
* [ ] Status management
* [ ] Due date
* [ ] Comments
* [ ] Task validation
* [ ] Task permissions
* [ ] Task API tests
* [ ] Task E2E tests

## Phase 6 — Cross-Department Work

* [ ] Source department
* [ ] Target department
* [ ] Cross-department assignment
* [ ] Transfer request
* [ ] Manager acceptance
* [ ] Cross-department permissions
* [ ] Cross-department Activity
* [ ] Notifications
* [ ] Integration tests

## Phase 7 — Activity and Audit

* [ ] Human-readable Activity feed
* [ ] Immutable Audit history
* [ ] Critical mutation logging
* [ ] Transactional Audit
* [ ] Admin activity
* [ ] Task activity
* [ ] Department activity
* [ ] Audit tests

## Phase 8 — Kanban

* [ ] Kanban board
* [ ] Columns by workflow status
* [ ] Task cards
* [ ] Drag and drop
* [ ] Status transitions
* [ ] Filters
* [ ] Search
* [ ] Loading states
* [ ] Empty states
* [ ] Error states
* [ ] Kanban E2E tests

## Phase 9 — Dashboard

* [ ] Personal dashboard
* [ ] Department dashboard
* [ ] Task statistics
* [ ] Status statistics
* [ ] Overdue tasks
* [ ] Activity summary
* [ ] Notifications summary

## Phase 10 — Management

* [ ] User management
* [ ] Department management
* [ ] Team management
* [ ] Project management
* [ ] Role management
* [ ] Permission management
* [ ] Administrative UI

## Phase 11 — Reports

* [ ] Task reports
* [ ] Department reports
* [ ] Employee workload
* [ ] Project reports
* [ ] Performance metrics
* [ ] Export functionality

## Phase 12 — Hardening

* [ ] Security review
* [ ] Input validation review
* [ ] Authorization review
* [ ] Session security review
* [ ] Upload restrictions
* [ ] API data minimization
* [ ] Error handling
* [ ] Request logging
* [ ] Health endpoint
* [ ] Backup strategy
* [ ] Restore testing

## Phase 13 — QA

* [ ] Full integration test suite
* [ ] Full E2E suite
* [ ] Regression tests
* [ ] Smoke tests
* [ ] Security regression
* [ ] Database migration verification
* [ ] Production-like environment test

## Phase 14 — Production

* [ ] Production build
* [ ] PostgreSQL production instance
* [ ] Reverse proxy
* [ ] HTTPS
* [ ] Internal hostname
* [ ] Backup target
* [ ] Restore procedure
* [ ] Health monitoring
* [ ] Deployment documentation

---

# Definition of Done

Функциональность считается завершённой только если выполнены необходимые пункты:

```text
Database / existing model
        ↓
Server / Service
        ↓
API or Server Action
        ↓
Input Validation
        ↓
Permission Checks
        ↓
Error Handling
        ↓
UI
        ↓
Activity / Audit
        ↓
Notifications, if required
        ↓
Tests
        ↓
Typecheck
        ↓
Lint
        ↓
Build
        ↓
Documentation, if contract changed
        ↓
Git Commit
```

Не допускается считать функцию завершённой только на основании визуального результата.

---

# Security Baseline

Система должна соблюдать следующие базовые требования:

* пароли хранятся только в hash-виде;
* session token не хранится в открытом виде;
* authentication выполняется на сервере;
* authorization выполняется на сервере;
* пользовательские идентификаторы не считаются доверенными;
* `departmentId`, `userId`, `roleId` и аналогичные параметры проверяются сервером;
* Prisma используется для параметризованных запросов;
* критические операции журналируются;
* Audit должен быть защищён от обычного пользовательского изменения;
* административные операции журналируются;
* session cookie использует HttpOnly;
* в production cookie должна использовать Secure;
* используется подходящий SameSite policy;
* входные данные валидируются на сервере;
* загрузка файлов в будущем должна иметь ограничения по типам и размерам.

Внутренняя корпоративная сеть сама по себе не считается достаточной границей безопасности.

---

# Core API Contract

Запланированные основные API:

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/users

POST   /api/departments
GET    /api/departments/:id
POST   /api/departments/:id/members

POST   /api/projects

POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
PATCH  /api/tasks/:id/status
PATCH  /api/tasks/:id/assignee

POST   /api/tasks/:id/comments
GET    /api/tasks/:id/activity
```

API будет расширяться по мере реализации соответствующих функциональных срезов.

---

# API Error Model

Основные HTTP-коды:

```text
200 OK
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
500 Internal Server Error
```

API должен использовать единообразный формат ошибок.

Пример:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  }
}
```

---

# Development Workflow

Перед началом нового функционального среза:

```text
1. Проверить текущую архитектуру
2. Проверить существующую Prisma schema
3. Определить необходимые изменения
4. Реализовать Database layer
5. Реализовать API / Service
6. Добавить server-side permissions
7. Добавить validation
8. Добавить UI
9. Добавить Activity / Audit
10. Добавить notifications, если необходимо
11. Добавить tests
12. Выполнить typecheck
13. Выполнить lint
14. Выполнить build
15. Обновить документацию
16. Создать Git commit
17. Push в remote
```

Нельзя менять архитектуру, стек или структуру базы без необходимости.

Если изменение архитектуры действительно требуется, оно должно быть сначала обосновано.

---

# Current Development State

На текущем этапе реализованы:

```text
Project Foundation
        ✓
PostgreSQL
        ✓
Prisma
        ✓
Database Schema
        ✓
Migrations
        ✓
Development Seed
        ✓
Password Hashing
        ✓
Server-side Sessions
        ✓
Login API
        ✓
Logout API
        ✓
Current User API
        ✓
Authentication E2E
        ✓
```

Следующая задача:

```text
RBAC
```

После RBAC разработка продолжается строго последовательно через организационную модель, Task Core и последующие вертикальные срезы.

---

# License

Internal corporate project.
