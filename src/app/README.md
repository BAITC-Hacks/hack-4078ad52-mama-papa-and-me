# Страницы и HTTP-адаптеры

## Netlify + Neon

В облаке GET /api/analyses/:id только читает статус. POST /api/internal/analyses/:id продвигает этап, требует WORKER_SECRET и недоступен обычному браузеру. POST /api/analyses дожидается подтверждения запуска Netlify Background Function. Ошибка запуска отменяет анализ и возвращает 503. Запись проверяет APP_ORIGIN, локальный режим сохраняет localhost-защиту.


Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

Композиция страницы и тонкие маршруты; бизнес-логика в backend.

## Внутренняя структура

layout.tsx, page.tsx, preview/page.tsx, api/http.ts и api/{simulate,analyses,scenarios,status}.

`/` — основное приложение с серверным API. `/preview` — тот же frontend с явно обозначенным автономным режимом: engine считает в браузере, сценарии сохраняются отдельно в localStorage, AI не вызывается. PreviewApp приходит через публичный экспорт UI.

## Публичный интерфейс

HTTP API описан в карте архитектуры; ошибки JSON со статусами, ответы no-store.

## Зависимости

ui и backend; серверные импорты только в Route Handlers.

## Проверки при реализации

Playwright проверяет страницу, подмену Score и межсайтовые запросы. npm run build проверяет маршруты.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.
