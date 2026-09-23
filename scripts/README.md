# Независимые проверки

Python 3.9+, только стандартная библиотека; запуск из корня репозитория.

- `python3 scripts/check_docs.py` / `npm run check:docs` — README, ссылки, регистр AGENTS.md, env-шаблон, Git-ignore и типовые паттерны секретов.
- `python3 scripts/verify_dataset.py` / `npm run check:data` — шесть исходных таблиц и два контрольных Score с Decimal.

Скрипты не делают сетевых запросов и не читают локальный .env. Они дополняют Vitest/Playwright и не заменяют движок приложения. Runtime-набор дополнительно сверяется с исходником тестом src/data/data.test.ts.

## Публикация Netlify CLI

Команды netlify:login/create/status/build/deploy в package.json запускают CLI через npx, без глобальной установки и без подключения GitHub организации. Создание сайта, вход и публикация выполняются только по явной команде пользователя. Миграция Neon: `npm run db:migrate` (читает DATABASE_URL из окружения или локального .env). Полный порядок — [инструкция публикации](../docs/deployment.md).
