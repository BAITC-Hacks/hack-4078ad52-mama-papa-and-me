# Серверные сценарии

## Netlify + Neon

Облачный режим: readAnalysis читает состояние без продвижения, pollAnalysis вызывается защищённым worker API. Дополнительные публичные точки входа: dispatch.ts (запуск Netlify worker) и worker-auth.ts (проверка служебного токена без server-only, доступна standalone worker). getScenario/saveScenario стали async; closeStorageConnections закрывает локальные соединения для тестов. Backend выбирает Neon при DATABASE_URL, иначе SQLite.


Актуальный прогресс — в [plans.md](../../plans.md), зависимости — в [карте архитектуры](../../docs/architecture/README.md).

## Ответственность

Проверка ввода, доверенный расчёт, координация AI и SQLite.

## Внутренняя структура

index.ts: сценарии, ошибки, durable AI lifecycle; миграция и SQL скрыты в storage.

## Публичный интерфейс

runSimulation, saveScenario, getScenario, listScenarios; startAnalysis, pollAnalysis, cancelAnalysis; systemStatus; HttpError.

## Зависимости

contracts, data, engine, ai, storage, config. server-only; UI не импортируется.

## Проверки при реализации

Vitest: подмена данных, контрольный расчёт, сохранение, idempotency, два AI-этапа, отмена/таймаут/поздний ответ/ошибка; сеть заменяется fake provider.

При изменении публичного интерфейса обновляйте contracts, потребителей и этот README. Команды проверки: npm test, npm run typecheck, npm run lint; UI дополнительно npm run test:e2e.

Повторный requestId с иным вопросом, сессией или выбором даёт 409. Резервирование запроса до первого await предотвращает дубли при отмене. saveScenario прикрепляет только готовый итоговый анализ той же версии данных/правил, набора мер. Архивный промпт допустим: AI-текст перед сохранением повторно проходит текущий verifyExplanation, а исходная версия сохраняется. evidence всегда берётся из серверного отчёта.
