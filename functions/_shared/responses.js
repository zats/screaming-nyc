export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export function errorJson(error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message === "lat/lon required" ? 400 : 500;
  return json({ error: message }, status);
}
