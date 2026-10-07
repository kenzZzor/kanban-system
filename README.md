# Kanban System

Локальная корпоративная система управления задачами на базе Kanban.

Проект разрабатывается как внутренний корпоративный продукт с аутентификацией, ролевой моделью доступа, организационной структурой, задачами, междепартаментным взаимодействием, аудитом действий, уведомлениями и аналитикой.

Разработка выполняется по принципу вертикальных функциональных срезов:

**Database → API/Service → Permissions → UI → Audit/Activity → Tests**

Функция считается завершённой только после реализации соответствующего серверного контракта, проверок доступа, валидации, пользовательского интерфейса и необходимых тестов.

---

## Current Stage

**Organization — Department Members API**

Фундамент проекта, серверная аутентификация, RBAC, Departments API и базовый API управления участниками подразделений реализованы.

Текущий функциональный срез включает:

* получение списка участников подразделения;
* добавление пользователя в подразделение;
* проверку существования пользователя;
* проверку активности пользователя;
* защиту от повторного добавления пользователя;
* назначение department-scoped роли;
* назначение manager для участника;
* проверку принадлежности manager к тому же подразделению;
* ограничение назначения `DEPARTMENT_ADMIN`;
* server-side permission checks;
* серверную валидацию входных данных через Zod;
* корректное разделение `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict` и других ожидаемых ошибок;
* Activity logging для операции добавления участника;
* Playwright API tests для проверки доступа к Department Members API.

На текущем этапе UI подразделений и UI управления участниками ещё не реализованы.

Следующий функциональный этап:

**Расширение Department Members API — изменение ролей, назначение и изменение иерархии, удаление участников, затем UI организационного модуля.**

Разработка продолжается последовательно, без преждевременного перехода к Kanban Board, Dashboard и другим следующим модулям.

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
   ├── Permissions / RBAC
   ├── Business Services
   └── Activity / Audit
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

* Next.js 16
* TypeScript
* React 19
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

Актуальная структура функциональных частей репозитория:

```text
kanban-system/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   ├── logout/
│   │   │   └── me/
│   │   ├── users/
│   │   └── departments/
│   │       ├── route.ts
│   │       └── [departmentId]/
│   │           └── members/
│   │               └── route.ts
│   │
│   └── ...
│
├── lib/
│   ├── auth/
│   │   ├── current-user.ts
│   │   ├── password.ts
│   │   └── session.ts
│   │
│   ├── permissions/
│   │   ├── codes.ts
│   │   ├── policy.ts
│   │   └── service.ts
│   │
│   ├── activity/
│   │   └── service.ts
│   │
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
│   ├── auth.spec.ts
│   ├── departments.spec.ts
│   ├── department-members.spec.ts
│   ├── permissions.unit.ts
│   └── rbac.spec.ts
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
* `managerId`;
* `assignedTo`;
* другим идентификаторам и параметрам, влияющим на права доступа.

Критические идентификаторы должны определяться или проверяться сервером в соответствии с текущей сессией и полномочиями пользователя.

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
feat: add server-side RBAC authorization
feat: add departments API
feat: add department members API
feat: add activity audit
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

### Logout

```http
POST /api/auth/logout
```

Назначение:

* удаляет текущую серверную сессию;
* очищает session cookie.

### Current User

```http
GET /api/auth/me
```

Назначение:

* получает текущего аутентифицированного пользователя;
* возвращает `401 Unauthorized`, если действующая сессия отсутствует.

---

# RBAC

RBAC реализован на серверной стороне.

Основная модель разделяет глобальную системную роль и роли внутри подразделений.

## System Role

```text
SYSTEM_ADMIN
```

`SYSTEM_ADMIN` является глобальной ролью пользователя.

Он не привязан к конкретному Department для получения системных permissions.

## Department Roles

Следующие роли являются department-scoped:

```text
DEPARTMENT_ADMIN
MANAGER
EMPLOYEE
VIEWER
```

Связь пользователя с подразделением реализуется через:

```text
Department
    ↓
DepartmentMember
    ↓
User + Role
```

Роль относится к membership пользователя в конкретном Department, а не к глобальному объекту `User`.

## Manager Hierarchy

`DepartmentMember.managerId` ссылается на другого `DepartmentMember`.

Таким образом, иерархия строится внутри конкретного подразделения:

```text
Department
    ↓
DepartmentMember
    ├── Manager
    │      ↓
    │  DepartmentMember
    │      ↓
    │   Employee
    └── ...
```

`managerId` не является `User.id`.

При добавлении участника сервер проверяет, что указанный manager действительно принадлежит тому же Department.

## Permissions

Основные permission codes:

```text
USERS_READ
USERS_MANAGE

DEPARTMENTS_READ
DEPARTMENTS_MANAGE

MEMBERS_READ
MEMBERS_MANAGE

PROJECTS_READ
PROJECTS_MANAGE

TASKS_READ
TASKS_CREATE
TASKS_UPDATE
TASKS_ASSIGN
TASKS_STATUS_CHANGE

COMMENTS_CREATE

ACTIVITY_READ
NOTIFICATIONS_READ
```

`SYSTEM_ADMIN` имеет системный доступ ко всем permissions.

Остальные пользователи получают permissions в рамках соответствующего `DepartmentMember` и назначенной ему роли.

## Authorization Rules

Сервер использует следующие базовые правила:

```text
No session
    ↓
401 Unauthorized

Authenticated
    ↓
Permission denied
    ↓
403 Forbidden

Authenticated
    ↓
Permission granted
    ↓
Operation allowed
```

Authorization не основывается на значениях, переданных клиентским интерфейсом.

---

# Users API

Реализован глобальный users API:

```http
GET /api/users
```

Доступ защищён server-side RBAC.

Неаутентифицированный запрос возвращает:

```text
401 Unauthorized
```

Пользователь без необходимого permission получает:

```text
403 Forbidden
```

На текущем этапе глобальное чтение пользователей доступно `SYSTEM_ADMIN`.

---

# Departments

Базовый Departments API реализован.

## GET Departments

```http
GET /api/departments
```

Поведение зависит от scope пользователя.

### SYSTEM_ADMIN

`SYSTEM_ADMIN` получает список всех подразделений.

### Department Member

Обычный аутентифицированный пользователь получает только те подразделения, в которых существует его `DepartmentMember`.

### Unauthenticated

Без действующей сессии API возвращает:

```text
401 Unauthorized
```

## POST Department

```http
POST /api/departments
```

Создание Department требует:

```text
DEPARTMENTS_MANAGE
```

В текущей модели это системное permission, поэтому создавать Department может `SYSTEM_ADMIN`.

Владелец операции определяется сервером:

```text
createdById = current authenticated user
```

`createdById` не принимается как доверенное значение от клиента.

### Validation

Для входных данных используется Zod.

Текущий контракт:

```text
name
    required
    trimmed
    1–200 characters

description
    optional
    trimmed
    maximum 1000 characters
```

Некорректные данные приводят к:

```text
400 Bad Request
```

## Departments E2E

Departments API покрыт Playwright-тестами.

Проверяются:

* отсутствие авторизации;
* чтение Department через `SYSTEM_ADMIN`;
* чтение собственного Department обычным участником;
* запрет создания Department для Department Admin;
* создание Department через `SYSTEM_ADMIN`;
* validation request body.

---

# Department Members

Department Members API является текущим реализованным функциональным срезом организационного модуля.

## GET Members

```http
GET /api/departments/:departmentId/members
```

Endpoint возвращает участников указанного подразделения.

Для каждого участника доступны:

* `DepartmentMember.id`;
* дата вступления;
* дата изменения;
* пользователь;
* email;
* имя;
* фамилия;
* отчество;
* статус активности;
* department role;
* manager.

### Access

```text
SYSTEM_ADMIN
    ↓
доступ к любому Department

DEPARTMENT_ADMIN
    ↓
свой Department

MANAGER
    ↓
свой Department

EMPLOYEE
    ↓
403 Forbidden

VIEWER
    ↓
403 Forbidden
```

## POST Member

```http
POST /api/departments/:departmentId/members
```

Назначение:

* добавление существующего пользователя в Department;
* назначение department role;
* назначение manager;
* создание соответствующего `DepartmentMember`;
* запись Activity.

Request:

```json
{
  "userId": "user-id",
  "roleCode": "EMPLOYEE",
  "managerId": "department-member-id"
}
```

`managerId` является необязательным.

### Validation and Business Rules

Сервер проверяет:

* наличие действующей сессии;
* permission `MEMBERS_MANAGE`;
* существование Department;
* существование User;
* активность User;
* отсутствие существующего membership;
* существование указанной роли;
* допустимость назначения `DEPARTMENT_ADMIN`;
* принадлежность manager к тому же Department.

При повторном добавлении пользователя API возвращает:

```text
409 Conflict
```

Неактивного пользователя нельзя добавить в Department.

Назначение `DEPARTMENT_ADMIN` ограничено системным уровнем доступа.

## Activity

Успешное добавление участника создаёт запись:

```text
ActivityType.MEMBER_ADDED
```

Activity содержит:

* actor;
* entity type;
* entity id;
* description;
* department id;
* user id;
* role code;
* manager id;
* timestamp.

Логирование выполняется через:

```text
lib/activity/service.ts
```

---

# Activity and Audit

В Prisma schema существует `ActivityLog`, предназначенный для фиксации значимых действий пользователей.

Текущая реализация включает Activity logging для добавления участника:

```text
MEMBER_ADDED
```

Проверенная цепочка:

```text
POST Department Members
        ↓
Permission check
        ↓
Validation
        ↓
DepartmentMember.create()
        ↓
ActivityLog.create()
```

Полноценная система Audit ещё не завершена.

В дальнейшем будут добавлены:

* immutable audit history;
* критические mutation logs;
* task activity;
* department activity;
* administrative activity;
* transactional audit;
* отдельное чтение Activity/Audit.

---

# Database

Основная СУБД:

**PostgreSQL 16**

ORM:

**Prisma 7**

Основные доменные сущности уже заложены в Prisma schema и постепенно используются функциональными модулями системы.

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

## Install Dependencies

```bash
npm install
```

## Environment

Создать `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Локальный connection string:

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

Проверка контейнеров:

```bash
podman ps
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

После запуска приложение доступно локально:

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
* memberships.

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

Используются для проверки изолированной бизнес-логики.

На текущем этапе реализованы unit-тесты permission policy:

```text
inactive user
SYSTEM_ADMIN
department permission
permission denied
```

Запуск:

```bash
npm run test:unit
```

## E2E / API Tests

Playwright используется для проверки реальных API-сценариев с authentication/session context.

На текущем этапе покрыты:

### Authentication

* login;
* authenticated `/me`;
* logout;
* невозможность получить `/me` после logout.

### RBAC

* unauthenticated access;
* `SYSTEM_ADMIN` access;
* запрещённый access для Department Admin.

### Departments

* GET access;
* Department scope;
* создание Department;
* validation;
* authorization.

### Department Members

* unauthenticated access;
* `SYSTEM_ADMIN` access;
* `DEPARTMENT_ADMIN` access;
* `MANAGER` access;
* запрет для `EMPLOYEE`;
* запрет для `VIEWER`;
* запрет доступа к другому Department;
* `404` для несуществующего Department.

Запуск полного набора:

```bash
npx playwright test
```

Запуск Departments:

```bash
npx playwright test tests/departments.spec.ts
```

Запуск Department Members:

```bash
npx playwright test tests/department-members.spec.ts
```

---

# Code Quality

Для текущего функционального среза после изменений выполняются:

```bash
npx tsc --noEmit
npm run lint
```

Для соответствующих изменений также используются:

```bash
npx playwright test
npm run test:unit
```

Перед production-ready состоянием проекта дополнительно обязателен:

```bash
npm run build
```

Проверки Prisma:

```bash
npx prisma validate
npx prisma migrate status
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

Изменение статуса является серверной операцией и должно учитывать:

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
Department Members
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

* [x] Role model
* [x] Permission model
* [x] Role-permission mapping
* [x] Global SYSTEM_ADMIN scope
* [x] Department-scoped roles
* [x] Server-side permission checks
* [x] Permission helper/service
* [x] API authorization
* [x] RBAC unit tests
* [x] RBAC E2E tests

## Phase 4 — Organization

### Departments

* [x] Department database model
* [x] Department read API
* [x] Department creation API
* [x] Department authorization
* [x] Department input validation
* [x] Department E2E tests
* [ ] Department details API
* [ ] Department UI

### Department Members

* [x] Department membership model
* [x] Department Members GET API
* [x] Add member API
* [x] Membership permission checks
* [x] Role validation
* [x] Manager validation
* [x] Manager hierarchy relation
* [x] Duplicate membership protection
* [x] Activity logging for member addition
* [x] Department Members API tests
* [ ] Remove member
* [ ] Change member role
* [ ] Change manager
* [ ] Full membership lifecycle tests
* [ ] Organization UI

### Teams

* [ ] Team model
* [ ] Team membership
* [ ] Team permissions
* [ ] Team API
* [ ] Team UI
* [ ] Team tests

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

* [x] Activity service
* [x] `MEMBER_ADDED` Activity
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
* [ ] Centralized error handling
* [ ] Request / correlation ID
* [ ] Server-side error logging
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
        ↓
Push
```

Не допускается считать функцию завершённой только на основании визуального результата.

Для серверных функциональных срезов, которые пока не имеют UI, Definition of Done применяется к существующей серверной части; UI добавляется в соответствующем UI-срезе.

---

# Security Baseline

Система должна соблюдать следующие базовые требования:

* пароли хранятся только в hash-виде;
* session token не хранится в открытом виде;
* authentication выполняется на сервере;
* authorization выполняется на сервере;
* пользовательские идентификаторы не считаются доверенными;
* `departmentId`, `userId`, `roleId`, `managerId` и аналогичные параметры проверяются сервером;
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

Реализованные API:

```text
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/users

GET    /api/departments
POST   /api/departments

GET    /api/departments/:id/members
POST   /api/departments/:id/members
```

Запланированные API:

```text
GET    /api/departments/:id

PATCH  /api/departments/:id/members/:memberId
DELETE /api/departments/:id/members/:memberId

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

Ожидаемые HTTP-коды:

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

API использует единообразный формат ожидаемых ошибок.

Пример:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  }
}
```

Централизованный механизм обработки непредвиденных серверных ошибок пока не реализован.

На этапе Hardening планируется добавить:

```text
Unexpected server error
        ↓
Centralized error handler
        ↓
Request / Correlation ID
        ↓
Detailed server-side logging
        ↓
Safe client response
```

Технические stack traces и внутренние детали реализации не должны передаваться клиенту в production.

---

# Development Workflow

Перед началом нового функционального среза:

```text
1. Проверить текущую архитектуру
2. Проверить существующую Prisma schema
3. Проверить существующие permissions
4. Проверить существующие API contracts
5. Определить необходимые изменения
6. Реализовать Database layer
7. Реализовать API / Service
8. Добавить server-side permissions
9. Добавить validation
10. Добавить UI, если он входит в текущий срез
11. Добавить Activity / Audit
12. Добавить notifications, если необходимо
13. Добавить tests
14. Выполнить typecheck
15. Выполнить lint
16. Выполнить build перед production-ready состоянием
17. Обновить документацию
18. Создать Git commit
19. Push в remote
```

Нельзя менять архитектуру, стек или структуру базы без необходимости.

Если изменение архитектуры действительно требуется, оно должно быть сначала обосновано.

---

# Current Development State

На текущем этапе реализованы:

```text
Project Foundation
        ✓
PostgreSQL 16
        ✓
Prisma 7
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
RBAC Permission Model
        ✓
Role-permission Mapping
        ✓
Global SYSTEM_ADMIN scope
        ✓
Department-scoped roles
        ✓
Server-side RBAC
        ✓
Users Authorization
        ✓
Departments Read API
        ✓
Departments Create API
        ✓
Departments Validation
        ✓
Departments Authorization
        ✓
Departments E2E Tests
        ✓
Department Members GET API
        ✓
Department Members POST API
        ✓
Membership Validation
        ✓
Manager Validation
        ✓
Membership Permission Checks
        ✓
MEMBER_ADDED Activity
        ✓
Department Members API Tests
        ✓
TypeScript Typecheck
        ✓
ESLint
        ✓
```

Последний завершённый функциональный срез:

```text
Department Members API
        +
Activity Audit for MEMBER_ADDED
```

Изменения этого среза зафиксированы в Git и отправлены в:

```text
origin/main
```

Текущая задача проекта:

```text
Расширение Department Members
```

Следующие серверные операции организационного модуля:

```text
Change member role
        ↓
Change manager
        ↓
Remove member
        ↓
Full membership lifecycle tests
```

После завершения серверного контракта организационного модуля можно переходить к UI соответствующего раздела.

---

# License

Internal corporate project.
