import { loadAndApplyConfig } from "./config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startAIScheduler } from "./aiScheduler";
import { startAIReplyWorker } from "./aiReplyWorker";

// Load JSON config (config/app.config.json) and apply to process.env
loadAndApplyConfig();

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '10mb', // Increase limit for file uploads
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static('public/uploads'));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // In development: use Vite dev server with HMR
  // In production: frontend should be served by reverse proxy (Nginx/Caddy)
  // Backend only serves API and WebSocket, not static files
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    // Production: serve built frontend via the same Railway service by default.
    // Disable by setting SERVE_STATIC=false if you use a separate static host.
    if (process.env.SERVE_STATIC !== "false") {
      serveStatic(app);
      console.log("[Production] Serving built frontend from dist-web/");
    } else {
      console.log("[Production] SERVE_STATIC=false, skipping static file serving.");
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);

  // Windows does not support `reusePort`, and binding to 0.0.0.0 can fail depending on environment.
  // For local dev, prefer localhost; for production behind reverse proxy, host can be 0.0.0.0.
  const isWindows = process.platform === "win32";
  const isDev = app.get("env") === "development";

  const listenOptions: any = { port };
  if (!isWindows && !isDev) {
    listenOptions.host = "0.0.0.0";
    listenOptions.reusePort = true;
  } else if (isDev) {
    // Let Node pick the default host (usually 127.0.0.1) on Windows/macOS/Linux
    // so it works out of the box for local testing.
  }

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
    
    // Start AI autonomous moment posting scheduler
    startAIScheduler();
    
    // Start AI reply background worker
    startAIReplyWorker();
  });
})();
