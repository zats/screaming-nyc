import { errorJson, json } from "../_shared/responses.js";
import { parseScanParams, scanSports, scanTicketedEvents } from "../_shared/scanners.js";

export async function onRequestGet({ request, env }) {
  try {
    const { lat, lon, radius } = parseScanParams(request);
    const [sports, ticketedEvents] = await Promise.all([
      scanSports(lat, lon, radius),
      scanTicketedEvents(lat, lon, radius, env)
    ]);

    return json({ sports, ticketedEvents });
  } catch (error) {
    return errorJson(error);
  }
}
