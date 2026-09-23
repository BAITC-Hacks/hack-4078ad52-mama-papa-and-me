# UI: components

button.tsx — Button с Radix Slot и вариантами cva; utils.ts — cn для классов. Без формул и HTTP.

measure-card.tsx — визуальная оболочка инициативы. При наведении мыши раскрывает описание, при уходе закрывает; кнопка описания переключает закреплённое раскрытие с клавиатуры или касанием. Escape закрывает описание. useId связывает кнопку и блок через aria-controls; aria-expanded и aria-hidden отражают состояние. Компонент получает содержимое через heading, description и children; выбор инициативы и расчёт остаются в feature.

Границы и проверки — в [README UI](../README.md).
