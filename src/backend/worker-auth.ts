import { timingSafeEqual } from "node:crypto";

export function workerAuthorized(request: Request, secret: string) {
  if (secret.length < 32) return false;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
