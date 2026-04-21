const SESSION_COOKIE_NAME = "kaiyan_admin_session";
const DEFAULT_SESSION_DAYS = 14;
const DEFAULT_BOOTSTRAP_DISPLAY_NAME = "凯燕管理员";

export type WebAdminCookieSecureMode = "always" | "never" | "auto";

export type WebAdminAuthConfig = {
  bootstrapUsername: string;
  bootstrapPassword: string;
  bootstrapDisplayName: string;
  sessionMaxAgeSeconds: number;
  cookieSecureMode: WebAdminCookieSecureMode;
};

export function getWebAdminAuthConfig(): WebAdminAuthConfig {
  const days = Number(process.env.WEB_ADMIN_SESSION_DAYS ?? DEFAULT_SESSION_DAYS);
  const normalizedDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_DAYS;
  const rawCookieSecure = process.env.WEB_ADMIN_COOKIE_SECURE?.trim().toLowerCase() ?? "auto";
  const cookieSecureMode = rawCookieSecure === "true" || rawCookieSecure === "always"
    ? "always"
    : rawCookieSecure === "false" || rawCookieSecure === "never"
      ? "never"
      : "auto";

  return {
    bootstrapUsername: process.env.WEB_ADMIN_USERNAME?.trim() ?? "",
    bootstrapPassword: process.env.WEB_ADMIN_PASSWORD?.trim() ?? "",
    bootstrapDisplayName: process.env.WEB_ADMIN_DISPLAY_NAME?.trim() || DEFAULT_BOOTSTRAP_DISPLAY_NAME,
    sessionMaxAgeSeconds: Math.round(normalizedDays * 24 * 60 * 60),
    cookieSecureMode,
  };
}

export function hasBootstrapCredential(config: WebAdminAuthConfig) {
  return Boolean(config.bootstrapUsername && config.bootstrapPassword);
}

export function createWebAdminSessionCookie(
  token: string,
  config: WebAdminAuthConfig,
  requestScheme?: string | null,
) {
  return buildCookie(token, config.sessionMaxAgeSeconds, shouldUseSecureCookie(config, requestScheme));
}

export function clearWebAdminSessionCookie(
  config?: Pick<WebAdminAuthConfig, "cookieSecureMode">,
  requestScheme?: string | null,
) {
  return buildCookie("", 0, shouldUseSecureCookie(config, requestScheme));
}

export function readWebAdminSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] ?? null;
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

export function shouldUseSecureCookie(
  config: Pick<WebAdminAuthConfig, "cookieSecureMode"> | undefined,
  requestScheme?: string | null,
) {
  const mode = config?.cookieSecureMode ?? "never";
  if (mode === "always") {
    return true;
  }

  if (mode === "never") {
    return false;
  }

  return (requestScheme ?? "").toLowerCase() === "https";
}

function buildCookie(value: string, maxAgeSeconds: number, secure: boolean) {
  const securePart = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${securePart}`;
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
