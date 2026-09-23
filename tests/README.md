# Проверки приложения

`npm test` запускает Vitest. Unit-тесты рядом с engine и data; [integration](integration/README.md) проверяет сервер и SQLite. [e2e](e2e/README.md) запускается отдельно через Playwright.

Автотесты используют временную SQLite, fake provider или AI_ENABLED=false и не отправляют платные запросы. Реальные вызовы OpenAI проверены отдельно; это не гарантирует будущую доступность API/квоты. Команды, результаты и ограничения — в [plans.md](../plans.md). Независимые проверки источника — в [scripts](../scripts/README.md).
