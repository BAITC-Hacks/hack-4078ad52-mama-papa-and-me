# Независимые проверки

Python 3.9+, только стандартная библиотека; запуск из корня репозитория.

- `python3 scripts/check_docs.py` / `npm run check:docs` — README, ссылки, регистр AGENTS.md, env-шаблон, Git-ignore и типовые паттерны секретов.
- `python3 scripts/verify_dataset.py` / `npm run check:data` — шесть исходных таблиц и два контрольных Score с Decimal.

Скрипты не делают сетевых запросов и не читают локальный .env. Они дополняют Vitest/Playwright и не заменяют движок приложения. Runtime-набор дополнительно сверяется с исходником тестом src/data/data.test.ts.
