import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/auth";
import { MissingEnvError } from "@/lib/env";

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Converte exceções conhecidas em respostas HTTP. */
export function handleRouteError(e: unknown) {
  if (e instanceof HttpError) return jsonError(e.status, e.message);
  if (e instanceof ZodError) return jsonError(400, "Dados inválidos", { issues: e.issues });
  if (e instanceof MissingEnvError) {
    return jsonError(503, "Integração não configurada no servidor", { missing: e.names });
  }
  console.error(e);
  return jsonError(500, "Erro interno");
}
