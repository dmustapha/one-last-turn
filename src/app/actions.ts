// File: src/app/actions.ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createCaseRuntime } from "../application/demo-runtime";

const codeSchema = z.string().min(8).max(64).regex(/^[A-Z0-9-]+$/);
const versionSchema = z.coerce.number().int().nonnegative();
const messageSchema = z.string().trim().min(10).max(400);

function command(formData: FormData): { code: string; version: number } {
  return { code: codeSchema.parse(formData.get("code")), version: versionSchema.parse(formData.get("version")) };
}

async function withController<T>(work: (controller: ReturnType<typeof createCaseRuntime>["controller"]) => Promise<T>): Promise<T> {
  const runtime = createCaseRuntime(process.env);
  try { return await work(runtime.controller); }
  finally { await runtime.close(); }
}

export async function createCaseAction(): Promise<never> {
  const view = await withController((controller) => controller.create());
  redirect(`/?case=${encodeURIComponent(view.code)}`);
}

export async function authorizeAction(formData: FormData): Promise<void> {
  const input = command(formData);
  await withController((controller) => controller.authorize(input.code, input.version));
  revalidatePath("/");
}

export async function submitReturnAction(formData: FormData): Promise<void> {
  const input = command(formData);
  const message = messageSchema.parse(formData.get("message"));
  await withController((controller) => controller.submitReturn(input.code, input.version, message));
  revalidatePath("/");
}

export async function consumeAction(formData: FormData): Promise<void> {
  const input = command(formData);
  await withController((controller) => controller.consume(input.code, input.version));
  revalidatePath("/");
}
