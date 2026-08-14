// Shared roster backend - Netlify Function (v2, uses Netlify Blobs for storage).
// Replaces the old per-browser localStorage: every visitor now reads/writes the
// same stored list, so an assignment added by one coordinator shows up for
// everyone else (after their next poll/refresh - see script.js).
//
// No auth: any visitor with the site link can read or write the roster, same
// openness as the rest of this tool. If that becomes a problem, add Netlify's
// site-level password protection (Site configuration -> Sharing & embed) - that
// gates the whole site including this API, without needing per-user accounts here.
import { getStore } from "@netlify/blobs";

const KEY = "volunteers";

function store() {
  return getStore("butula-roster");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (request) => {
  const s = store();

  if (request.method === "GET") {
    const data = (await s.get(KEY, { type: "json" })) || [];
    return json(data);
  }

  if (request.method === "PUT") {
    const incoming = await request.json();
    if (!incoming || !incoming.id) return json({ error: "Missing id" }, 400);

    const current = (await s.get(KEY, { type: "json" })) || [];
    const byId = new Map(current.map((v) => [v.id, v]));
    const existing = byId.get(incoming.id);
    if (!existing || new Date(incoming.updated_at) >= new Date(existing.updated_at)) {
      byId.set(incoming.id, incoming);
    }
    const updated = Array.from(byId.values());
    await s.setJSON(KEY, updated);
    return json(updated);
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    const current = (await s.get(KEY, { type: "json" })) || [];
    const updated = current.filter((v) => v.id !== id);
    await s.setJSON(KEY, updated);
    return json(updated);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/roster" };
