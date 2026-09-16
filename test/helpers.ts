import { SELF } from "cloudflare:test";

export const BASE = "https://blygger.com";

export async function get(path: string, cookie?: string): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, cookie ? { headers: { cookie } } : undefined);
}

export async function postJson(path: string, body: unknown, cookie?: string) {
  const res = await SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

export async function login(): Promise<string> {
  const res = await SELF.fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=test-password",
    redirect: "manual",
  });
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`login failed: ${res.status}`);
  return cookie.split(";")[0];
}
