import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import Fastify, { FastifyRequest } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toErrorResponse } from "./lib/http.js";
import {
  clearWebAdminSessionCookie,
  createWebAdminSessionCookie,
  getWebAdminAuthConfig,
  hasBootstrapCredential,
  isPublicWebPath,
  normalizeNextPath,
  readWebAdminSessionToken,
} from "./lib/web-auth.js";
import { registerApiRoutes } from "./routes/api.js";
import { recordAdminAuditLog } from "./services/admin-audit-service.js";
import {
  countActiveWebAdminUsers,
  createWebAdminLoginSession,
  ensureBootstrapWebAdminUser,
  listWebAdminUsers,
  resolveWebAdminSession,
  invalidateWebAdminSession,
} from "./services/web-admin-auth-service.js";

export async function createApp() {
  const app = Fastify({ logger: false });
  const webAdminAuth = getWebAdminAuthConfig();

  if (hasBootstrapCredential(webAdminAuth)) {
    await ensureBootstrapWebAdminUser(webAdminAuth);
  }

  const webAdminEnabled = (await countActiveWebAdminUsers()) > 0;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const staticRootCandidates = [
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "..", "public"),
  ];
  const staticRoot = staticRootCandidates.find((candidate) => fs.existsSync(candidate))
    ?? staticRootCandidates[0];

  await app.register(cors, {
    origin: true,
  });

  await app.register(staticPlugin, {
    root: staticRoot,
    prefix: "/",
  });

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorResponse(error);
    reply.status(statusCode).send({
      ...body,
      trace_id: crypto.randomUUID(),
    });
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!webAdminEnabled) {
      return;
    }

    const pathname = request.url.split("?")[0] ?? "/";
    if (isPublicWebPath(pathname)) {
      return;
    }

    const sessionToken = readWebAdminSessionToken(request.headers.cookie);
    const session = await resolveWebAdminSession(sessionToken);
    if (session) {
      request.webAdminUser = session;
      return;
    }

    if (pathname.startsWith("/api/")) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Please sign in to continue",
        trace_id: crypto.randomUUID(),
        data: null,
      });
    }

    return reply.redirect(`/login/?next=${encodeURIComponent(request.url)}`);
  });

  await registerApiRoutes(app);

  app.get("/login", async (_request, reply) => reply.redirect("/login/"));
  app.get("/login/", async (_request, reply) => reply.sendFile("login/index.html"));

  app.post("/api/v1/web-admin/session", async (request, reply) => {
    const body = request.body as {
      username?: string;
      password?: string;
      next?: string;
    };

    if (!webAdminEnabled) {
      return reply.status(503).send({
        code: "AUTH_DISABLED",
        message: "Web admin authentication is not configured",
        trace_id: crypto.randomUUID(),
      });
    }

    const username = body?.username?.trim() ?? "";
    const password = body?.password ?? "";
    const nextPath = normalizeNextPath(body?.next);
    const requestMeta = getRequestMeta(request);

    const session = await createWebAdminLoginSession({
      username,
      password,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      config: webAdminAuth,
    });

    if (!session) {
      await recordAdminAuditLog({
        actor: {
          username: username || null,
        },
        action: "WEB_ADMIN_LOGIN_FAILED",
        targetType: "WEB_ADMIN_SESSION",
        requestId: requestMeta.requestId,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        metadata: {
          username,
        },
      });

      return reply.status(401).send({
        code: "INVALID_CREDENTIALS",
        message: "Invalid username or password",
        trace_id: crypto.randomUUID(),
      });
    }

    await recordAdminAuditLog({
      actor: {
        userId: session.user.userId,
        username: session.user.username,
      },
      action: "WEB_ADMIN_LOGIN_SUCCEEDED",
      targetType: "WEB_ADMIN_SESSION",
      targetId: session.user.sessionId,
      requestId: requestMeta.requestId,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });

    reply.header("Set-Cookie", createWebAdminSessionCookie(session.token, webAdminAuth));
    return reply.send({
      code: "OK",
      message: "success",
      trace_id: crypto.randomUUID(),
      data: {
        redirect_to: nextPath,
        username: session.user.username,
        display_name: session.user.displayName,
      },
    });
  });

  app.post("/api/v1/web-admin/logout", async (request, reply) => {
    const sessionToken = readWebAdminSessionToken(request.headers.cookie);
    const requestMeta = getRequestMeta(request);

    await invalidateWebAdminSession(sessionToken);
    if (request.webAdminUser) {
      await recordAdminAuditLog({
        actor: {
          userId: request.webAdminUser.userId,
          username: request.webAdminUser.username,
        },
        action: "WEB_ADMIN_LOGOUT",
        targetType: "WEB_ADMIN_SESSION",
        targetId: request.webAdminUser.sessionId,
        requestId: requestMeta.requestId,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
      });
    }

    reply.header("Set-Cookie", clearWebAdminSessionCookie(webAdminAuth));
    return reply.send({
      code: "OK",
      message: "success",
      trace_id: crypto.randomUUID(),
      data: {
        redirect_to: "/login/",
      },
    });
  });

  app.get("/api/v1/web-admin/profile", async (request) => ({
    code: "OK",
    message: "success",
    trace_id: crypto.randomUUID(),
    data: {
      user: request.webAdminUser ?? null,
      users: await listWebAdminUsers(),
    },
  }));

  app.get("/", async (_request, reply) => reply.redirect("/economics/"));
  app.get("/admin", async (_request, reply) => reply.redirect("/economics/"));
  app.get("/admin/", async (_request, reply) => reply.redirect("/economics/"));
  app.get("/backend", async (_request, reply) => reply.redirect("/economics/"));
  app.get("/backend/", async (_request, reply) => reply.redirect("/economics/"));
  app.get("/economics", async (_request, reply) => reply.redirect("/economics/"));
  app.get("/economics/", async (_request, reply) => reply.sendFile("economics/index.html"));
  app.get("/frontdesk", async (_request, reply) => reply.redirect("/frontdesk/"));
  app.get("/frontdesk/", async (_request, reply) => reply.sendFile("frontdesk/index.html"));

  return app;
}

function getRequestMeta(request: FastifyRequest) {
  return {
    requestId: typeof request.headers["x-request-id"] === "string"
      ? request.headers["x-request-id"].trim()
      : request.id,
    ipAddress: getClientIpAddress(request),
    userAgent: request.headers["user-agent"] ?? null,
  };
}

function getClientIpAddress(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return request.ip ?? null;
}
