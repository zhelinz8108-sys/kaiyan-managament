import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toErrorResponse } from "./lib/http.js";
import {
  clearWebAdminSessionCookie,
  createWebAdminSessionCookie,
  getWebAdminAuthConfig,
  isPublicWebPath,
  isValidWebAdminCredential,
  normalizeNextPath,
  readWebAdminSession,
} from "./lib/web-auth.js";
import { registerApiRoutes } from "./routes/api.js";

export async function createApp() {
  const app = Fastify({ logger: false });
  const webAdminAuth = getWebAdminAuthConfig();
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
    if (!webAdminAuth.enabled) {
      return;
    }

    const pathname = request.url.split("?")[0] ?? "/";
    if (isPublicWebPath(pathname)) {
      return;
    }

    const session = readWebAdminSession(request.headers.cookie, webAdminAuth);
    if (session) {
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

  app.get("/login", async (_request, reply) => {
    return reply.redirect("/login/");
  });

  app.get("/login/", async (_request, reply) => {
    return reply.sendFile("login/index.html");
  });

  app.post("/api/v1/web-admin/session", async (request, reply) => {
    const body = request.body as {
      username?: string;
      password?: string;
      next?: string;
    };

    if (!webAdminAuth.enabled) {
      return reply.status(503).send({
        code: "AUTH_DISABLED",
        message: "Web admin authentication is not configured",
        trace_id: crypto.randomUUID(),
      });
    }

    const username = body?.username?.trim() ?? "";
    const password = body?.password ?? "";
    const nextPath = normalizeNextPath(body?.next);

    if (!isValidWebAdminCredential(username, password, webAdminAuth)) {
      return reply.status(401).send({
        code: "INVALID_CREDENTIALS",
        message: "账号或密码错误",
        trace_id: crypto.randomUUID(),
      });
    }

    reply.header("Set-Cookie", createWebAdminSessionCookie(webAdminAuth));
    return reply.send({
      code: "OK",
      message: "success",
      trace_id: crypto.randomUUID(),
      data: {
        redirect_to: nextPath,
        username: webAdminAuth.username,
      },
    });
  });

  app.post("/api/v1/web-admin/logout", async (_request, reply) => {
    reply.header("Set-Cookie", clearWebAdminSessionCookie());
    return reply.send({
      code: "OK",
      message: "success",
      trace_id: crypto.randomUUID(),
      data: {
        redirect_to: "/login/",
      },
    });
  });

  app.get("/", async (_request, reply) => {
    return reply.redirect("/economics/");
  });

  app.get("/admin", async (_request, reply) => {
    return reply.redirect("/economics/");
  });

  app.get("/admin/", async (_request, reply) => {
    return reply.redirect("/economics/");
  });

  app.get("/backend", async (_request, reply) => {
    return reply.redirect("/economics/");
  });

  app.get("/backend/", async (_request, reply) => {
    return reply.redirect("/economics/");
  });

  app.get("/economics", async (_request, reply) => {
    return reply.redirect("/economics/");
  });

  app.get("/economics/", async (_request, reply) => {
    return reply.sendFile("economics/index.html");
  });

  app.get("/frontdesk", async (_request, reply) => {
    return reply.redirect("/frontdesk/");
  });

  app.get("/frontdesk/", async (_request, reply) => {
    return reply.sendFile("frontdesk/index.html");
  });

  return app;
}
