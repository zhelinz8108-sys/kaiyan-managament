import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toErrorResponse } from "./lib/http.js";
import { registerApiRoutes } from "./routes/api.js";

export async function createApp() {
  const app = Fastify({ logger: false });
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  await app.register(cors, {
    origin: true,
  });

  await app.register(staticPlugin, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/",
  });

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorResponse(error);
    reply.status(statusCode).send({
      ...body,
      trace_id: crypto.randomUUID(),
    });
  });

  await registerApiRoutes(app);

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

  return app;
}
