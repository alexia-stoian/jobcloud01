import { Socket } from "net";

function parseDatabaseHostAndPort(databaseUrl: string): { host: string; port: number } | null {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432
    };
  } catch {
    return null;
  }
}

export async function canReachDatabase(databaseUrl: string, timeoutMs = 800): Promise<boolean> {
  const target = parseDatabaseHostAndPort(databaseUrl);
  if (!target) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = new Socket();

    const finish = (result: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));

    socket.connect(target.port, target.host);
  });
}