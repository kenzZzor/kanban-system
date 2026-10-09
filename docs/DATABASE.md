# База данных

## Источник истины

Источник истины для схемы — [`prisma/schema.prisma`](../prisma/schema.prisma). Этот документ описывает назначение моделей и важные ограничения, но не заменяет Prisma schema. После изменения модели здесь нужно обновлять только затронутые сведения.

СУБД — PostgreSQL. ORM и генератор клиентского кода — Prisma 7. Изменения схемы проводятся через миграции; не заменять их ручным редактированием БД.

## Модели текущей схемы

| Область | Модели | Назначение |
|---|---|---|
| Учётные записи | `User`, `Session` | Пользователи, активность, хеш пароля и серверные сессии. |
| Доступ | `Role`, `Permission`, `RolePermission` | Роли и связь ролей с permission-кодами. `User.systemRoleId` задаёт системную роль; `DepartmentMember.roleId` — роль в подразделении. |
| Организация | `Department`, `DepartmentMember` | Подразделения, членство, руководители и история выхода через `leftAt`. |
| Проекты | `Project`, `ProjectMember` | Проекты подразделений и список участников проекта. API проекта пока не завершён. |
| Задачи | `Task`, `TaskStatus`, `Priority`, `TaskType` | Каркас модели задач, статусы, приоритеты и типы. Наличие моделей не означает наличие Task API. |
| Коммуникация | `Comment` | Комментарии к задаче. Endpoint и UI ещё не реализованы. |
| История | `ActivityLog` | Записи действий с актором, сущностью, необязательной задачей/департаментом и metadata. |
| Уведомления | `Notification` | Модель уведомления; генерация и полноценный пользовательский API ещё предстоят. |

## Основные связи

```text
User ──< Session
User ──< DepartmentMember >── Department
DepartmentMember ── manager/subordinates ── DepartmentMember
Role ──< RolePermission >── Permission
Department ──< Project ──< ProjectMember >── User
Task ──> User (creator / optional assignee)
Task ──> Department (source / optional assigned department)
Task ──> Project (optional)
Task ──> TaskStatus, Priority, TaskType
Task ──< Comment
Task ──< ActivityLog
User ──< ActivityLog, Notification
```

## Важные ограничения

- `User.email` уникален.
- `Role.code`, `Permission.code`, `TaskStatus.code` и `Priority.code` уникальны.
- `DepartmentMember` имеет уникальную пару `[departmentId, userId]`. Поэтому прекращённое членство повторно активируется в той же записи, а не создаётся как дубликат.
- `DepartmentMember.leftAt IS NULL` обозначает активное членство; `leftAt != NULL` — завершённое.
- `ProjectMember` имеет уникальную пару `[projectId, userId]`.
- `Session.tokenHash` уникален; в таблице хранится хеш токена, а не сам токен cookie.
- `ActivityLog.taskId` и `departmentId` необязательны и при удалении связанной сущности устанавливаются в `NULL`, чтобы не каскадно удалять запись истории.

## Статусы и приоритеты

`TaskStatusCode`: `NEW`, `ANALYSIS`, `BACKLOG`, `READY`, `IN_PROGRESS`, `REVIEW`, `TESTING`, `DONE`, `BLOCKED`, `CANCELLED`.

`PriorityCode`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

Существование этих статусов в текущей базе не реализует автоматически правила переходов и не означает, что это окончательный набор пяти пользовательских колонок. Целевой процесс и необходимость сопоставления старых codes с утверждённым workflow описаны в [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md). Разрешённые переходы должны быть централизованы в серверной бизнес-логике и проверяться тестами при реализации Task API.

## Поля задач, которых пока нет

В текущей `Task` модели нет `position` и `version`. Их добавление запланировано отдельной миграцией до реализации полноценного Kanban drag-and-drop и контроля конкурентных изменений. Не предполагать, что эти поля существуют.

## Команды разработчика

```bash
npx prisma validate
npx prisma migrate status
npm run db:migrate
npm run db:generate
npm run db:seed
```

Seed предназначен только для локальной разработки и тестов. Перед изменением схемы сначала изучить текущие связи, ограничения и миграции; не запускать `prisma migrate reset` или сброс БД без явного разрешения.
