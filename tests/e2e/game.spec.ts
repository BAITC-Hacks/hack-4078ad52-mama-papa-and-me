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
  await page.getByRole("button", { name: "AI-советник", exact: true }).click();
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
