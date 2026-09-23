# Общие контракты

Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

Общие типы и строгие Zod-схемы; не содержат реализаций серверных функций.

## Внутренняя структура

index.ts: Dataset, Selection, ScenarioInput, ScenarioReport, AnalysisRequest/View, Explanation, Source, SavedScenario.

## Публичный интерфейс

Экспорт типов и схем через index.ts. Входные схемы отклоняют лишние поля; бизнес-правила проверяет engine.

## Зависимости

Zod; ни одного другого модуля проекта. Нет env, SQL или сети.

## Проверки при реализации

TypeScript strict и интеграционные проверки подмены полей/невалидного ввода. AI JSON проверяется explanationSchema.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.

AnalysisView.evidence содержит факты, процитированные объяснением. SaveScenario принимает только analysisId; текст/факты клиент передать не может. SavedScenario.analysis — необязательный снимок готового итогового разбора; старые записи без поля поддерживаются.
