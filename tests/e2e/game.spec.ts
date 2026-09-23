import { expect, test } from "@playwright/test";
test("complete game, server result, fallback, saving and restoration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Большой город. Ваши решения." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Рассчитать результат" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Загрузить пример" }).click();
  await page.getByRole("button", { name: "Рассчитать результат" }).click();
  await expect(page.getByTestId("final-score")).toHaveText("56,54");
  await page.getByLabel("Название сценария").fill("Проверка Нуры");
  await page.getByRole("button", { name: "Сохранить на компьютере" }).click();
  await expect(page.getByRole("status")).toContainText("Сценарий сохранён");
  await page.getByRole("button", { name: "Разобрать сценарий с AI" }).click();
  await expect(
    page.getByText("Шаблонное объяснение", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Закрыть советника", exact: true })
    .click();
  await page.getByRole("button", { name: "Мои сценарии" }).click();
  await page
    .getByRole("button", { name: /Проверка Нуры/ })
    .first()
    .click();
  await expect(page.getByTestId("final-score")).toHaveText("56,54");
  expect(errors).toEqual([]);
});
test("selection, conflict, removal and draft recovery", async ({ page }) => {
  await page.goto("/");
  const card = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "Парк / сквер", exact: true }),
    });
  await card.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Удалить Парк / сквер" }),
  ).toBeVisible();
  const school = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Школа + детский сад",
        exact: true,
      }),
    });
  await expect(
    school.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Удалить Парк / сквер" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Удалить Парк / сквер" }).click();
  await expect(
    school.getByRole("button", { name: "Добавить", exact: true }),
  ).toBeEnabled();
});
test("mobile layout and keyboard interaction", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Район Есиль", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Район Есиль", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Открыть AI-советника", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("API rejects tampering and cross-origin writes", async ({ request }) => {
  const data = {
    datasetVersion: "astana-synthetic-1",
    rulesVersion: "akim-1",
    selections: [],
    mode: "preview",
    score: 100,
  };
  expect((await request.post("/api/simulate", { data })).status()).toBe(400);
  expect(
    (
      await request.post("/api/simulate", {
        data,
        headers: { origin: "https://unrelated.example" },
      })
    ).status(),
  ).toBe(403);
});

test("report explains decisions and selection edits do not spend AI requests", async ({ page }) => {
  const analyses: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/analyses") analyses.push(r.url());
  });
  await page.goto("/");
  const park = page.locator("article").filter({ has: page.getByRole("heading", { name: "Парк / сквер", exact: true }) });
  await park.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("button", { name: "Удалить Парк / сквер" }).click();
  await page.getByRole("button", { name: "Загрузить пример" }).click();
  await page.getByRole("button", { name: "Рассчитать результат" }).click();
  expect(analyses).toHaveLength(0);
  const evidence = page.getByRole("region", { name: "Обоснование результата" });
  await expect(evidence.getByText(/Школа \+ детский сад · Нура · 24 ед./)).toBeVisible();
  await expect(evidence.getByText("Показателей ниже 40 не осталось.")).toBeVisible();
  await evidence.getByText("Почему получился такой Score", { exact: true }).click();
  await expect(evidence).toContainText("56,54307");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(evidence.getByText("Почему получился такой Score", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Разобрать сценарий с AI" }).click();
  await expect(page.getByText("Шаблонное объяснение", { exact: true })).toBeVisible();
  await page.getByText("Основания в расчёте", { exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Итоговый Score: 56,54");
  await page.getByRole("button", { name: "Закрыть советника", exact: true }).click();
  await page.getByLabel("Название сценария").fill("Архив с объяснением");
  await page.getByRole("button", { name: "Сохранить на компьютере" }).click();
  await expect(page.getByRole("status")).toContainText("Сценарий сохранён");
  await page.getByRole("button", { name: "Мои сценарии" }).click();
  await page.getByRole("button", { name: /Архив с объяснением/ }).first().click();
  await page.getByRole("button", { name: "Открыть AI-советника", exact: true }).click();
  await expect(page.getByText("Шаблонное объяснение", { exact: true })).toBeVisible();
  expect(analyses).toHaveLength(1);
  await page.getByRole("button", { name: "Закрыть советника", exact: true }).click();
  await page.getByRole("button", { name: "Изменить решения", exact: true }).click();
  await page.getByLabel("Район для Школа + детский сад", { exact: true }).selectOption("esil");
  await expect(page.getByText(/Исходная ситуация:/)).toBeVisible();
  await page.getByRole("button", { name: "Открыть AI-советника", exact: true }).click();
  await expect(page.getByText("Шаблонное объяснение", { exact: true })).not.toBeVisible();
  expect(analyses).toHaveLength(1);
  await page.getByRole("button", { name: "Закрыть советника", exact: true }).click();
  await page.getByRole("button", { name: "Рассчитать результат", exact: true }).click();
  await expect(page.getByTestId("final-score")).toHaveText("55,30");
  await expect(page.getByRole("region", { name: "Обоснование результата" })).toContainText("38,00 — ниже 40");
});

test("AI answer puts decisions before optional research and preserves readable evidence", async ({ page }) => {
  await page.route("**/api/analyses", async (route) => {
    await route.fulfill({ json: {
      id: "00000000-0000-4000-8000-000000000001", kind: "final",
      status: "completed", phase: "done", mode: "ai",
      snapshotKey: "M10:nura|M12:city|M5:saryarka|M7:nura|M8:nura",
      createdAt: "2026-09-23T00:00:00.000Z", error: null,
      model: "gpt-6-astra", reasoning: "medium", promptVersion: "urban-advisor-3",
      usage: { input: 0, output: 0 },
      explanation: {
        summary: { text: "Школа и детсад улучшают обеспеченность местами в Нуре.", factIds: ["effect.M7.nura.S1"], sourceIds: [] },
        strengths: [], risks: [],
        recommendations: [{ text: "Попробуйте вариант с транспортом и пересчитайте результат.", factIds: ["nura.T2.after"], sourceIds: [] }],
        context: [{ text: "Учебный пример внешнего исследования с ограничениями переноса.", factIds: [], sourceIds: ["source-1"] }],
        limitations: ["Реальные расходы на содержание школы не рассчитаны."]
      },
      sources: [{ id: "source-1", title: "Тестовый источник", url: "https://example.org/study", checkedAt: "2026-09-23T00:00:00.000Z" }],
      evidence: [
        { id: "effect.M7.nura.S1", text: "Школа + детский сад, Нура: вклад в S1 после лага", value: 10 },
        { id: "nura.T2.after", text: "Нура: Доступность транспорта после", value: 40 }
      ]
    } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Загрузить пример" }).click();
  await page.getByRole("button", { name: "Рассчитать результат" }).click();
  await page.getByRole("button", { name: "Разобрать сценарий с AI" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Главный вывод" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Что сделать дальше" })).toBeVisible();
  const research = dialog.getByText("Учебный пример внешнего исследования с ограничениями переноса.", { exact: true });
  await expect(research).not.toBeVisible();
  await dialog.getByText("Основания в расчёте", { exact: true }).first().click();
  await expect(dialog).toContainText("вклад в Школы и детсады с учётом срока реализации: 10,00");
  await dialog.getByText("Что подсказывает мировой опыт", { exact: true }).click();
  await expect(research).toBeVisible();
  await expect(dialog.getByRole("link", { name: "example.org", exact: true })).toHaveAttribute("href", "https://example.org/study");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("preview keeps its archive and AI state separate without server requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", r => { if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url()); });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/preview");
  await expect(page.getByText(/Демо интерфейса · расчёт по модели проекта/)).toBeVisible();
  await page.getByRole("button", { name: "Загрузить пример", exact: true }).click();
  await page.getByRole("button", { name: "Рассчитать результат", exact: true }).click();
  await expect(page.getByTestId("final-score")).toHaveText("56,54");
  await page.getByRole("button", { name: "Разобрать сценарий с AI", exact: true }).click();
  await expect(page.getByText("Демо-справка", { exact: true })).toBeVisible();
  await expect(page.getByText("AI-анализ с источниками", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Закрыть советника", exact: true }).click();
  await page.getByLabel("Название сценария").fill("Изолированное демо");
  await page.getByRole("button", { name: "Сохранить в браузере", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Сценарий сохранён в этом браузере");
  await page.getByRole("button", { name: "Мои сценарии", exact: true }).click();
  await page.getByRole("button", { name: /Изолированное демо/ }).click();
  await expect(page.getByTestId("final-score")).toHaveText("56,54");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("akim-active-selection"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("akim-draft-v1"))).toBeNull();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Рассчитать результат", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Открыть AI-советника", exact: true }).click();
  await expect(page.getByText("Демо-справка", { exact: true })).not.toBeVisible();
});
