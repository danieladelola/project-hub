import { getCookie } from "@tanstack/react-start/server";
import { db } from "./db.server";

export const SESSION_COOKIE = "uc_session";

export function randomToken(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function requireUserId(): Promise<number> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw new Error("Not signed in");
  const sql = await db();
  const rows = await sql`select user_id from bank_sessions where token = ${token} and expires_at > now()`;
  if (!rows[0]) throw new Error("Not signed in");
  const userId = rows[0].user_id as number;
  const { getSettings } = await import("./settings.server");
  if ((await getSettings(sql)).maintenance.enabled) {
    const admin = await sql`select 1 from bank_user_roles where user_id = ${userId} and role = 'admin'`;
    if (!admin[0]) throw new Error("Online banking is temporarily unavailable for maintenance.");
  }
  return userId;
}

export async function requireAdminId(): Promise<number> {
  const id = await requireUserId();
  const sql = await db();
  const rows = await sql`select 1 from bank_user_roles where user_id = ${id} and role = 'admin'`;
  if (!rows[0]) throw new Error("Forbidden");
  return id;
}
