import { errorJson, json } from "../_shared/responses.js";
import { parseScanParams, scanSports } from "../_shared/scanners.js";

export async function onRequestGet({ request, env }) {
  try {
    const { lat, lon, radius } = parseScanParams(request);
    return json({ events: await scanSports(lat, lon, radius, env) });
  } catch (error) {
    return errorJson(error);
  }
}
