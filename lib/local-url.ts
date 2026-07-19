import { existsSync } from "node:fs";

function isContainerRuntime(): boolean {
  return Boolean(process.env.DOCKER_CONTAINER) || existsSync("/.dockerenv");
}

export function normalizeLocalServiceUrl(value: string | undefined): string | undefined {
  if (!value || process.env.NODE_ENV === "production" || isContainerRuntime()) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname === "postgres" || url.hostname === "host.docker.internal") {
      url.hostname = "localhost";
      return url.toString();
    }
  } catch {
    return value;
  }

  return value;
}
