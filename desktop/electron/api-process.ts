import { app } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import { createServer, AddressInfo } from "node:net";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export interface ApiProcessResult {
  process: ChildProcess;
  port: number;
  url: string;
}

/**
 * Find a free TCP port by binding to port 0, reading the assigned port.
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

/**
 * Get the path to the .NET API executable.
 * - DEV: relative to the repo root
 * - PROD: bundled in resources/api/
 */
function getApiPath(): { command: string; args: string[]; cwd: string } {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // In dev, use dotnet run pointing to the API project
    const projectDir = process.env.MAILBRIDGE_API_PROJECT
      || join(__dirname, "..", "..", "MailBridge.API");
    return {
      command: "dotnet",
      args: ["run", "--project", projectDir, "--no-launch-profile"],
      cwd: projectDir,
    };
  }

  // In production, use the published self-contained executable
  const resourcePath = process.resourcesPath || join(__dirname, "..");
  const execName = process.platform === "win32" ? "MailBridge.API.exe" : "MailBridge.API";
  return {
    command: join(resourcePath, "api", execName),
    args: [],
    cwd: join(resourcePath, "api"),
  };
}

/**
 * Health-check the API until it responds or times out.
 */
function waitForApi(url: string, maxRetries = 30, intervalMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`${url}/api/auth/profile`, (res) => {
        // Any response (even 401) means the API is alive
        resolve();
      });
      req.on("error", () => {
        if (attempts >= maxRetries) {
          reject(new Error(`API did not start after ${maxRetries} attempts`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts >= maxRetries) {
          reject(new Error(`API timed out after ${maxRetries} attempts`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
    };
    check();
  });
}

/**
 * Launch the .NET API on a free localhost port.
 * Returns the child process and the API URL.
 */
export async function launchApi(): Promise<ApiProcessResult> {
  const port = await findFreePort();
  const apiUrl = `http://127.0.0.1:${port}`;
  const { command, args, cwd } = getApiPath();

  const apiProcess = spawn(command, [...args, "--urls", apiUrl], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ASPNETCORE_URLS: apiUrl,
      ASPNETCORE_ENVIRONMENT: process.env.NODE_ENV === "development" ? "Development" : "Production",
    },
  });

  apiProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[API] ${data.toString().trim()}`);
  });

  apiProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[API ERR] ${data.toString().trim()}`);
  });

  apiProcess.on("exit", (code) => {
    console.log(`[API] Process exited with code ${code}`);
  });

  console.log(`[API] Waiting for API at ${apiUrl}...`);
  await waitForApi(apiUrl);
  console.log(`[API] Ready at ${apiUrl}`);

  return { process: apiProcess, port, url: `${apiUrl}/api` };
}

/**
 * Gracefully kill the API process.
 */
export function killApi(apiProcess: ChildProcess | null): void {
  if (!apiProcess) return;
  try {
    if (process.platform === "win32") {
      // On Windows, use taskkill to kill the process tree
      spawn("taskkill", ["/pid", String(apiProcess.pid), "/f", "/t"]);
    } else {
      apiProcess.kill("SIGTERM");
    }
  } catch {
    // Ignore errors on cleanup
  }
}
