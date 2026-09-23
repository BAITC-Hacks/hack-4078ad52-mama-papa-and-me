# Локальное хранение

Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

SQLite-репозитории сценариев и AI-задач; миграция и lease переходов.

## Внутренняя структура

index.ts: createStorage, SQL, JSON payload, user_version=1, WAL и busy_timeout 5 секунд.

## Публичный интерфейс

save/get/listScenario, insert/save/getJob, getRequest, history, activeJobs, countRecent, lock/unlock, close. Путь передаётся аргументом.

## Зависимости

contracts, better-sqlite3, node:fs/path, server-only. Нет engine, AI или UI.

## Проверки при реализации

Временные SQLite в Vitest: миграция, сохранение после закрытия/открытия, задания и дедупликация. Реальная база var/akim.sqlite исключена из Git.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.
