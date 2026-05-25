import { defineConfig, loadEnv } from "vite";
import { parseScanParams, scanContextSource, scanSports, scanTicketedEvents, scanTicketedSource } from "./functions/_shared/scanners.js";

export default defineConfig(({ mode }) => {
  const localEnv = { ...process.env, ...loadEnv(mode, process.cwd(), "") };

  return {
    plugins: [
      {
        name: "local-api",
        configureServer(server) {
        server.middlewares.use("/api/scan", async (req, res) => {
          try {
            const { lat, lon, radius } = parseScanParams(toRequest(req));
            const [sports, ticketedEvents] = await Promise.all([
              scanSports(lat, lon, radius),
              scanTicketedEvents(lat, lon, radius, localEnv)
            ]);
            sendJson(res, 200, { sports, ticketedEvents });
          } catch (error) {
            sendJson(res, error.message === "lat/lon required" ? 400 : 500, { error: error.message });
          }
        });

        server.middlewares.use("/api/sports", async (req, res) => {
          try {
            const { lat, lon, radius } = parseScanParams(toRequest(req));
            sendJson(res, 200, { events: await scanSports(lat, lon, radius) });
          } catch (error) {
            sendJson(res, error.message === "lat/lon required" ? 400 : 500, { error: error.message });
          }
        });

        server.middlewares.use("/api/ticketed-source", async (req, res) => {
          try {
            const { lat, lon, radius, source } = parseScanParams(toRequest(req));
            sendJson(res, 200, { events: await scanTicketedSource(source, lat, lon, radius, localEnv) });
          } catch (error) {
            sendJson(res, error.message === "lat/lon required" ? 400 : 500, { error: error.message });
          }
        });

        server.middlewares.use("/api/context-source", async (req, res) => {
          try {
            const { lat, lon, radius, source } = parseScanParams(toRequest(req));
            sendJson(res, 200, { events: await scanContextSource(source, lat, lon, radius, localEnv) });
          } catch (error) {
            sendJson(res, error.message === "lat/lon required" ? 400 : 500, { error: error.message });
          }
        });
      }
      }
    ]
  };
});

function toRequest(req) {
  return new Request(new URL(req.url, "http://localhost"));
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
