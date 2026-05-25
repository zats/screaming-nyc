import { errorJson, json } from "../_shared/responses.js";
import { parseScanParams, scanContextSource } from "../_shared/scanners.js";

export async function onRequestGet({ request, env }) {
  try {
    const { lat, lon, radius, source } = parseScanParams(request);
    return json({ events: await scanContextSource(source, lat, lon, radius, env) });
  } catch (error) {
    return errorJson(error);
  }
}
