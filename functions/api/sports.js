import { errorJson, json } from "../_shared/responses.js";
import { parseScanParams, scanSports } from "../_shared/scanners.js";

export async function onRequestGet({ request }) {
  try {
    const { lat, lon, radius } = parseScanParams(request);
    return json({ events: await scanSports(lat, lon, radius) });
  } catch (error) {
    return errorJson(error);
  }
}
