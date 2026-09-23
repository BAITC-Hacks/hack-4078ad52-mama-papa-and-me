# Игровой интерфейс

Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

Карта, каталог, пять решений, отчёт, сохранение и AI-советник.

## Внутренняя структура

features/city-simulator.tsx, features/city-map.tsx; components/button.tsx, utils.ts; styles/globals.css.

## Публичный интерфейс

index.ts экспортирует CitySimulator. Изменение портфеля проверяет engine; финал и сохранение — HTTP. Черновик localStorage, текущий анализ sessionStorage.

## Зависимости

contracts, data, engine; React, Lucide, Recharts, Radix Slot. Серверные модули запрещены.

## Проверки при реализации

Playwright: полный сценарий, сохранение, fallback, конфликты, черновик, мобильный экран и клавиатура. Визуальная проверка 390/1440 px.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.
