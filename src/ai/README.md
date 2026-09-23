# AI-объяснения

Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

OpenAI-клиент, промпты, извлечение цитат, проверка структуры ответа и fallback.

## Внутренняя структура

index.ts: createAI, extractSources, verifyExplanation, fallback, PROMPT_VERSION.

## Публичный интерфейс

Доверенный отчёт и конфигурация → background response; объяснение содержит factIds/sourceIds. Подробности в AI-спецификации.

## Зависимости

contracts, официальный OpenAI SDK, server-only. Не пересчитывает числа и не пишет в БД.

## Проверки при реализации

Fake provider в integration; неизвестные ссылки отклоняются. Реальная проверка: чат о парках и финальный сценарий. Смысл текста не полностью проверяется автоматически.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.
