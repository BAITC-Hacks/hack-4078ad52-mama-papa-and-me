# Архитектура локального приложения

Реализован модульный монолит: один Next.js-процесс на 127.0.0.1, браузерный UI, локальная SQLite и внешний OpenAI API. Текущее состояние — в [plans.md](../../plans.md).

```mermaid
flowchart LR
  UI[UI браузера] -->|HTTP| Routes[app: маршруты]
  Routes --> Backend[backend: сценарии]
  Backend --> Engine[engine: расчёт]
  Data[data: каталог] --> Backend
  Backend --> AI[ai: исследование и объяснение]
  AI --> OpenAI[OpenAI Responses API]
  Backend --> Storage[storage: репозитории]
  Storage --> SQLite[(SQLite)]
```

## Границы

| Модуль | Зависимости проекта | Интерфейс |
| --- | --- | --- |
| contracts | нет | Типы и строгие Zod-схемы |
| data | contracts | dataset, categories, exampleSelections, scenarioInput |
| engine | contracts | validate, simulate, baseline, canonicalSelections; данные аргументами |
| config | нет | getConfig, server-only |
| ai | contracts | createAI, extractSources, verifyExplanation, fallback |
| storage | contracts | createStorage(path), репозитории сценариев и анализов |
| backend | contracts, data, engine, ai, storage, config | simulate/save/list/load, start/poll/cancelAnalysis |
| ui | contracts, data, engine | CitySimulator; локальный preview и HTTP-клиент |
| app | ui, backend | Next.js страницы и Route Handlers |
| mocks | нет реализации | Не участвует в runtime |

Публичный вход каждого исполняемого модуля — index.ts, кроме Next.js app с файловой маршрутизацией. UI не импортирует серверные модули; engine не использует React, сеть, БД или env. Защита — server-only и ограничения ESLint. Циклы и обход границ через относительные импорты запрещены правилами проекта; линтер не является полным анализатором графа зависимостей.

## HTTP API

| Метод и маршрут | Вход / результат |
| --- | --- |
| POST /api/simulate | ScenarioInput + mode preview/final → серверный ScenarioReport |
| POST /api/scenarios | ScenarioInput + name → сохранённый финальный отчёт |
| GET /api/scenarios | До 100 последних сценариев |
| GET /api/scenarios/:id | Сценарий или 404 |
| POST /api/analyses | AnalysisRequest → AnalysisView с локальным ID |
| GET /api/analyses/:id | Статус, переход фонового этапа, объяснение/источники |
| DELETE /api/analyses/:id | Отмена ожидания и попытка остановить OpenAI response |
| GET /api/status | Наличие настройки AI, модель и версии; без ключа |

Входные схемы находятся в [contracts](../../src/contracts/index.ts). Клиент передаёт IDs мер/районов и версии, сервер сам определяет цены, эффекты и Score. Ошибки имеют `{error, details?}` и HTTP 400/403/404/409/413/415/429/500. Для preview неполного набора score/delta равны null. Серверная проверка Origin/Host/JSON защищает локальные операции записи от обычных межсайтовых запросов; это не система аккаунтов или публичный API.

## Данные и ожидание

UI хранит черновик в localStorage. SQLite в режиме WAL хранит scenarios и analyses; начальная миграция — user_version 1. AnalysisJob содержит запрос, серверный отчёт, состояние двух этапов, provider ID, источники, токены, модель и версии. Браузеру provider ID не выдаётся.

AI запускается по отправке вопроса или кнопке итогового анализа. Изменение портфеля пересчитывает preview без нового AI-запроса. Новый ход отменяет старую задачу. Дубликат requestId с тем же нормализованным содержанием возвращает существующую запись, с другим — HTTP 409. Запись резервируется до ожидания отмены предыдущего запроса; автоматических retries SDK нет. Poll использует SQLite lease на 90 секунд, чтобы не запускать один переход параллельно. Перед созданием второго response сохраняется отметка перехода; прерванный запуск не повторяется автоматически. Готовый ответ привязан к canonicalSelections и поколению запросов UI, поэтому не заменяет другой портфель.

Исследование → проверенные ID цитат → структурированное объяснение. Переход запускается опросом из браузера. При длительной паузе и истечении трёх минут новый платный этап не начинается; уже завершённое финальное объяснение можно получить позже. Две платные генерации не образуют транзакцию с локальной SQLite: в редком сбое между приёмом запроса OpenAI и записью его ID приложение покажет прерванный запуск, а исходная генерация может быть оплачена.

## Развитие

Границы позволяют заменять UI, AI-адаптер или хранилище без изменения движка. Независимое масштабирование серверов, общая БД, worker очереди и авторизация пока не реализованы. Их добавляют по реальным требованиям. [Исторические роли команды](../team-roles.md) сохранены отдельно от действующих инструкций.
