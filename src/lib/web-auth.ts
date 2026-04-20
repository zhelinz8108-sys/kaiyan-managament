import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "kaiyan_admin_session";
const DEFAULT_SESSION_DAYS = 14;

export type WebAdminAuthConfig = {
  enabled: boolean;
  username: string;
  password: string;
  secret: string;
  sessionMaxAgeSeconds: number;
};

type SessionPayload = {
  username: string;
  exp: number;
};

export function getWebAdminAuthConfig(): WebAdminAuthConfig {
  const username = process.env.WEB_ADMIN_USERNAME?.trim() ?? "";
  const password = process.env.WEB_ADMIN_PASSWORD?.trim() ?? "";
  const secret = process.env.WEB_ADMIN_SESSION_SECRET?.trim() ?? "";
  const days = Number(process.env.WEB_ADMIN_SESSION_DAYS ?? DEFAULT_SESSION_DAYS);
  const normalizedDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_DAYS;

  return {
    enabled: Boolean(username && password && secret),
    username,
    password,
    secret,
    sessionMaxAgeSeconds: Math.round(normalizedDays * 24 * 60 * 60),
  };
}

export function isValidWebAdminCredential(
  username: string,
  password: string,
  config: WebAdminAuthConfig,
) {
  if (!config.enabled) {
    return false;
  }

  return secureEquals(username, config.username) && secureEquals(password, config.password);
}

export function createWebAdminSessionCookie(config: WebAdminAuthConfig) {
  const payload = {
    username: config.username,
    exp: Math.floor(Date.now() / 1000) + config.sessionMaxAgeSeconds,
  } satisfies SessionPayload;
  const body = toBase64Url(JSON.stringify(payload));
  const signature = signValue(body, config.secret);
  const token = `${body}.${signature}`;

  return buildCookie(token, config.sessionMaxAgeSeconds);
}

export function clearWebAdminSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readWebAdminSession(cookieHeader: string | undefined, config: WebAdminAuthConfig) {
  if (!config.enabled || !cookieHeader) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = signValue(body, config.secret);
  if (!secureEquals(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body)) as SessionPayload;
    if (payload.username !== config.username) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function isPublicWebPath(pathname: string) {
  return pathname === "/health"
    || pathname === "/login"
    || pathname === "/login/"
    || pathname.startsWith("/login/")
    || pathname === "/api/v1/web-admin/session";
}

export function normalizeNextPath(nextPath: string | undefined) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/economics/";
  }

  if (nextPath.startsWith("//")) {
    return "/economics/";
  }

  return nextPath;
}

function buildCookie(value: string, maxAgeSeconds: number) {
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function signValue(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function secureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, part) => {
      const [name, ...rest] = part.split("=");
      if (!name || rest.length === 0) {
        return accumulator;
      }

      accumulator[name] = rest.join("=");
      return accumulator;
    }, {});
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
