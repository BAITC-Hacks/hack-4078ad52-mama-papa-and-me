# Серверная конфигурация

Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

Серверное окружение, defaults и таймауты без логирования ключей.

## Внутренняя структура

index.ts: getConfig; корневой .env.example — пустой шаблон.

## Публичный интерфейс

OPENAI_API_KEY, OPENAI_MODEL (default gpt-6-astra), SQLITE_PATH; AI_ENABLED=false отключает AI. effort=medium, maxAnalysisMs=180000. Путь БД относительно cwd.

## Зависимости

node:path и server-only. backend передаёт результат адаптерам.

## Проверки при реализации

Без ключа приложение считает и сохраняет. Секрет не экспортируется API или UI. Конфигурация не проверяет биллинг/доступ к модели до фактического обращения.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.
