"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/session";

/** Kept for compatibility; the UI posts to /logout, which also clears a
 *  pre-portal unpartitioned cookie. */
export async function logout() {
  await destroySession();
  redirect("/login");
}
