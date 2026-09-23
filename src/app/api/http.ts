import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/backend";
export async function body(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))
    throw new HttpError(403, "Ожидается локальный адрес.");
  const expected = `http://${host}`;
  if (origin && origin !== expected)
    throw new HttpError(
      403,
      "Запрос разрешён только из локального приложения.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Межсайтовый запрос отклонён.");
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Ожидается JSON.");
  const raw = await request.text();
  if (raw.length > 24000) throw new HttpError(413, "Слишком большой запрос.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Некорректный JSON.");
  }
}
export async function respond(
  action: () => unknown | Promise<unknown>,
  status = 200,
) {
  try {
    return NextResponse.json(await action(), {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: "Некорректные параметры запроса.",
          details: error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        },
        { status: 400 },
      );
    if (error instanceof HttpError)
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    // Never forward provider errors or environment values to the browser.
    console.error(
      "Local request failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      {
        error:
          "Локальная операция не выполнена. Проверьте доступность хранилища и повторите.",
      },
      { status: 500 },
    );
  }
}
