# Серверные сценарии

Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

Проверка ввода, доверенный расчёт, координация AI и SQLite.

## Внутренняя структура

index.ts: сценарии, ошибки, durable AI lifecycle; миграция и SQL скрыты в storage.

## Публичный интерфейс

runSimulation, saveScenario, getScenario, listScenarios; startAnalysis, pollAnalysis, cancelAnalysis; systemStatus; HttpError.

## Зависимости

contracts, data, engine, ai, storage, config. server-only; UI не импортируется.

## Проверки при реализации

Vitest: подмена данных, контрольный расчёт, сохранение, idempotency, два AI-этапа, отмена/таймаут/поздний ответ/ошибка; сеть заменяется fake provider.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.
