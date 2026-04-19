import "dotenv/config";

import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";

const app = await createApp();

try {
  await app.listen({ port, host });
  console.log(`hotel-apartment-platform listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
