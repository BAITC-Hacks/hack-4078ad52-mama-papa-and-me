import type { Category, Dataset, Selection, Values } from "@/contracts";
export const categories: {
  id: Category;
  label: string;
  color: string;
  short: string;
}[] = [
  { id: "transport", label: "Транспорт", color: "#457bd4", short: "Транспорт" },
  { id: "ecology", label: "Озеленение", color: "#288873", short: "Экология" },
  {
    id: "social",
    label: "Социальная инфраструктура",
    color: "#b08b39",
    short: "Соцсфера",
  },
  {
    id: "safety",
    label: "Безопасность",
    color: "#8760b0",
    short: "Безопасность",
  },
  {
    id: "services",
    label: "Городской сервис",
    color: "#c27158",
    short: "Сервисы",
  },
];
const values = (...v: number[]): Values =>
  Object.fromEntries(
    ["T1", "T2", "E1", "E2", "S1", "S2", "B1", "B2", "C1", "C2"].map(
      (id, i) => [id, v[i]],
    ),
  ) as Values;
export const dataset: Dataset = {
  version: "astana-synthetic-1",
  rulesVersion: "akim-1",
  budget: 100,
  horizon: 8,
  indicators: [
    { id: "T1", name: "Разгрузка дорог", weight: 0.1, category: "transport" },
    {
      id: "T2",
      name: "Доступность транспорта",
      weight: 0.1,
      category: "transport",
    },
    { id: "E1", name: "Озеленение", weight: 0.09, category: "ecology" },
    { id: "E2", name: "Качество воздуха", weight: 0.11, category: "ecology" },
    { id: "S1", name: "Школы и детсады", weight: 0.11, category: "social" },
    { id: "S2", name: "Первичная медицина", weight: 0.11, category: "social" },
    { id: "B1", name: "Безопасность улиц", weight: 0.09, category: "safety" },
    {
      id: "B2",
      name: "Безопасность движения",
      weight: 0.09,
      category: "safety",
    },
    { id: "C1", name: "Надёжность ЖКХ", weight: 0.1, category: "services" },
    { id: "C2", name: "Решение обращений", weight: 0.1, category: "services" },
  ],
  districts: [
    {
      id: "esil",
      name: "Есиль",
      population: 0.27,
      profile:
        "Пробки на мостах и переполненные школы при высоком качестве городской среды.",
      indicators: values(45, 62, 68, 72, 48, 55, 78, 60, 75, 70),
    },
    {
      id: "almaty",
      name: "Алматы",
      population: 0.24,
      profile:
        "Транспортная нагрузка и устаревшая коммунальная инфраструктура.",
      indicators: values(40, 75, 50, 55, 60, 65, 62, 52, 50, 60),
    },
    {
      id: "saryarka",
      name: "Сарыарка",
      population: 0.2,
      profile: "Смог от частного сектора и нехватка зелёных пространств.",
      indicators: values(50, 70, 42, 40, 62, 68, 58, 55, 45, 55),
    },
    {
      id: "baikonur",
      name: "Байконур",
      population: 0.13,
      profile:
        "Сбалансированный район, которому нужны точечные улучшения безопасности и среды.",
      indicators: values(52, 68, 55, 50, 58, 60, 52, 58, 55, 58),
    },
    {
      id: "nura",
      name: "Нура",
      population: 0.16,
      profile:
        "Нехватка школ и первичной медицины. Два показателя ниже критического порога.",
      indicators: values(55, 40, 45, 65, 38, 35, 55, 50, 60, 50),
    },
  ],
  measures: [
    {
      id: "M1",
      category: "transport",
      name: "Выделенные полосы для автобусов",
      scope: "district",
      cost: 18,
      lag: 2,
      effects: { T1: 6, T2: 9 },
      description: "Приоритет общественного транспорта на загруженных улицах.",
    },
    {
      id: "M2",
      category: "transport",
      name: "Умные светофоры",
      scope: "city",
      cost: 22,
      lag: 2,
      effects: { T1: 4, B2: 3 },
      description: "Адаптивное управление движением во всём городе.",
    },
    {
      id: "M3",
      category: "transport",
      name: "Линия ЛРТ / расширение",
      scope: "district",
      cost: 30,
      lag: 4,
      effects: { T1: 16, T2: 20, E2: 4 },
      description:
        "Крупный транспортный проект с длительным сроком реализации.",
    },
    {
      id: "M4",
      category: "ecology",
      name: "Парк / сквер",
      scope: "district",
      cost: 15,
      lag: 2,
      effects: { E1: 12, E2: 3, B1: 2 },
      description: "Новое зелёное общественное пространство рядом с домом.",
    },
    {
      id: "M5",
      category: "ecology",
      name: "Чистое топливо для частного сектора",
      scope: "district",
      cost: 25,
      lag: 3,
      effects: { E2: 14, C1: 4 },
      description: "Перевод частного сектора на более чистое отопление.",
    },
    {
      id: "M6",
      category: "ecology",
      name: "Городское озеленение",
      scope: "city",
      cost: 20,
      lag: 4,
      effects: { E1: 5, E2: 3 },
      description: "Программа озеленения и ветрозащитных полос.",
    },
    {
      id: "M7",
      category: "social",
      name: "Школа + детский сад",
      scope: "district",
      cost: 24,
      lag: 3,
      effects: { S1: 16 },
      description: "Модульное строительство для сокращения дефицита мест.",
    },
    {
      id: "M8",
      category: "social",
      name: "Центр семейного здоровья",
      scope: "district",
      cost: 20,
      lag: 3,
      effects: { S2: 14 },
      description: "Поликлиника и первичная помощь ближе к жителям.",
    },
    {
      id: "M9",
      category: "social",
      name: "Дворовые спорт-хабы",
      scope: "district",
      cost: 10,
      lag: 1,
      effects: { S1: 3, S2: 3, B1: 3 },
      description: "Места для занятий спортом и совместного досуга.",
    },
    {
      id: "M10",
      category: "safety",
      name: "Освещение и камеры",
      scope: "district",
      cost: 12,
      lag: 1,
      effects: { B1: 12, B2: 2 },
      description: "Расширение Safe City на улицах выбранного района.",
    },
    {
      id: "M11",
      category: "safety",
      name: "Безопасные переходы",
      scope: "district",
      cost: 10,
      lag: 1,
      effects: { B2: 12, T1: -2 },
      description:
        "Защита пешеходов и школьных зон с компромиссом по движению автомобилей.",
    },
    {
      id: "M12",
      category: "services",
      name: "Платформа обращений",
      scope: "city",
      cost: 14,
      lag: 1,
      effects: { C2: 5 },
      description: "Единый цифровой канал решения городских проблем.",
    },
    {
      id: "M13",
      category: "services",
      name: "Модернизация тепло- и водосетей",
      scope: "district",
      cost: 28,
      lag: 4,
      effects: { C1: 18, E2: 2 },
      description:
        "Обновление коммунальных сетей с длительным горизонтом работ.",
    },
    {
      id: "M14",
      category: "services",
      name: "Аварийные бригады ЖКХ",
      scope: "city",
      cost: 16,
      lag: 1,
      effects: { C1: 5, C2: 2 },
      description: "Бригады оперативного реагирования и раннее оповещение.",
    },
  ],
  synergies: [
    { measures: ["M1", "M2"], indicator: "T1", effect: 2 },
    { measures: ["M10", "M12"], indicator: "B1", effect: 2 },
    { measures: ["M5", "M6"], indicator: "E2", effect: 2 },
  ],
};
export const exampleSelections: Selection[] = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12", districtId: null },
  { measureId: "M5", districtId: "saryarka" },
];
export const scenarioInput = (selections: Selection[]) => ({
  datasetVersion: dataset.version,
  rulesVersion: dataset.rulesVersion,
  selections,
});
