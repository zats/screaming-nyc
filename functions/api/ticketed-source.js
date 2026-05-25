import { errorJson, json } from "../_shared/responses.js";
import { parseScanParams, scanTicketedSource } from "../_shared/scanners.js";

export async function onRequestGet({ request }) {
  try {
    const { lat, lon, radius, source } = parseScanParams(request);
    return json({ events: await scanTicketedSource(source, lat, lon, radius) });
  } catch (error) {
    return errorJson(error);
  }
}
