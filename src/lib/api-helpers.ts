import { NextResponse } from "next/server";
import type { ApiError } from "./types";
import { ValidationError } from "./validation";
import { UpstreamError } from "./sources/http";

/**
 * The response conventions every API route in this product speaks.
 *
 * Success is the payload itself, never a wrapper. Failure is always the same
 * envelope, always with a machine-readable code, and never with a stack trace or
 * an environment variable in it: an unexpected error is reported to the client as
 * "internal_error" and nothing more.
 */

export const MAX_BODY_BYTES = 16_384;

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): NextResponse {
  const body: ApiError = { error: { code, message, ...(fields ? { fields } : {}) } };
  return NextResponse.json(body, { status });
}

export function jsonValidation(fields: Record<string, string>): NextResponse {
  return jsonError(422, "validation_failed", "Some fields need attention.", fields);
}

/** Read and parse a JSON body, refusing anything oversized or unparseable. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    throw new ValidationError({ body: "The request body is too large." });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ValidationError({ body: "The request body is too large." });
  }
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError({ body: "The request body was not valid JSON." });
  }
}

export interface RouteFailure {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
}

/**
 * Map any thrown value onto a safe response. Upstream failures become 502 with
 * the provider named but nothing about our own infrastructure; anything
 * unrecognised becomes a bare 500 so an internal message can never leak.
 */
export function describeFailure(error: unknown): RouteFailure {
  if (error instanceof ValidationError) {
    return {
      status: 422,
      code: "validation_failed",
      message: "Some fields need attention.",
      fields: error.fields,
    };
  }
  if (error instanceof UpstreamError) {
    return {
      status: 502,
      code: "upstream_unavailable",
      message: `The upstream provider did not answer: ${error.provider}.`,
    };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, code: "not_found", message: error.message };
  }
  if (error instanceof GoneError) {
    return { status: 410, code: "gone", message: error.message };
  }
  if (error instanceof ConflictError) {
    return { status: 409, code: "conflict", message: error.message };
  }
  return { status: 500, code: "internal_error", message: "Something failed on our side." };
}

export class NotFoundError extends Error {
  constructor(message = "That record does not exist.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class GoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoneError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Wrap a route handler so every failure path produces the same envelope.
 *
 * Typed against Response rather than NextResponse because the export routes return
 * a plain Response with a content-disposition header, not a JSON body.
 */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    const failure = describeFailure(error);
    return jsonError(failure.status, failure.code, failure.message, failure.fields);
  }
}

/** No-store on anything a client could mistake for a durable GET. */
export const NO_STORE: ResponseInit = { headers: { "cache-control": "no-store" } };

/** Short shared cache for upstream-derived reads. */
export function shortCache(seconds: number): ResponseInit {
  return { headers: { "cache-control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=86400` } };
}
