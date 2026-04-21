import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    webAdminUser?: {
      sessionId: string;
      userId: string;
      username: string;
      displayName: string;
    };
  }
}
