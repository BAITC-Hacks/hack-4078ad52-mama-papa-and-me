# Серверная конфигурация

## Netlify + Neon

Облако определяется DEPLOY_TARGET=netlify или окружением Netlify (SITE_ID/NETLIFY). В этом режиме DATABASE_URL, APP_ORIGIN и WORKER_SECRET обязательны; тихого отката на SQLite нет. APP_ORIGIN — точный HTTPS origin без завершающего слеша. WORKER_SECRET — не менее 32 символов. AI_MAX_ANALYSIS_MINUTES: локально 3, облако 12, допустимо 1–12. AI_DAILY_ANALYSIS_LIMIT: по умолчанию 50, 0 запрещает новые анализы в Neon; это лимит задач, не долларов.


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
