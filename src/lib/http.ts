import { ZodError } from "zod";

import { ApiError, isApiError } from "./errors.js";

export function toErrorResponse(error: unknown) {
  if (isApiError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten(),
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      code: "SYSTEM_ERROR",
      message: error instanceof Error ? error.message : "Unexpected error",
      details: null,
    },
  };
}

export function buildTraceId(requestId?: string) {
  return requestId ?? crypto.randomUUID();
}

export function assertPresent<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new ApiError(404, "NOT_FOUND", message);
  }

  return value;
}
