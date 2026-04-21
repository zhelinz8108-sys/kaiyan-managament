import "dotenv/config";

import { prisma } from "../src/lib/db.js";
import { upsertWebAdminUser } from "../src/services/web-admin-auth-service.js";

function parseArg(flag: string) {
  const argv = process.argv.slice(2);
  const index = argv.findIndex((item) => item === flag || item.startsWith(`${flag}=`));
  if (index === -1) {
    return null;
  }

  const current = argv[index];
  if (current.includes("=")) {
    return current.split("=").slice(1).join("=");
  }

  return argv[index + 1] ?? null;
}

async function main() {
  const username = parseArg("--username")?.trim();
  const password = parseArg("--password") ?? "";
  const displayName = parseArg("--display-name")?.trim();

  if (!username || !password) {
    throw new Error("Usage: tsx scripts/web-admin-user.ts --username <name> --password <password> [--display-name <label>]");
  }

  const user = await upsertWebAdminUser({
    username,
    password,
    displayName: displayName || username,
    isActive: true,
  });

  console.log("Web admin user saved");
  console.log({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isActive: user.isActive,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
