// Shared roster backend - Netlify Function (v2, uses Netlify Blobs for storage).
//
// Threat model note: this endpoint has no per-user login (by design, so field
// coordinators don't need accounts). ROSTER_ACCESS_KEY is a shared-secret gate
// instead - set it in Netlify's dashboard (Site configuration -> Environment
// variables) and give the value to your coordinators out of band (e.g. WhatsApp).
// If ROSTER_ACCESS_KEY is left unset, the endpoint stays open (matches the
// original behavior) - set it before real volunteer PII goes into this roster.
import { getStore } from "@netlify/blobs";

const KEY = "volunteers";
const MAX_RECORDS = 2000;
const FIELD_MAX_LENGTHS = { id: 100, name: 200, phone: 40, ward: 100, station_code: 40, station_name: 200, notes: 500 };
const ALLOWED_ROLES = new Set(["Ward Coordinator", "Polling Agent", "Canvasser"]);
const ALLOWED_STATUSES = new Set(["Assigned", "Confirmed", "Dropped"]);

function store() {
  return getStore("butula-roster");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function checkAccess(request) {
  const required = process.env.ROSTER_ACCESS_KEY;
  if (!required) return true; // no key configured -> open, same as original behavior
  return request.headers.get("x-roster-key") === required;
}

// Validates and trims an incoming volunteer record. Returns an error string, or
// null if the record is acceptable. Guards against unbounded/garbage payloads
// (storage-abuse DoS) and against a record silently corrupting the coverage math
// with a role/status the UI doesn't know how to count.
function validateRecord(r) {
  if (!r || typeof r !== "object") return "Body must be a JSON object";
  if (typeof r.id !== "string" || !r.id) return "Missing id";
  if (r.role && !ALLOWED_ROLES.has(r.role)) return "Invalid role";
  if (r.status && !ALLOWED_STATUSES.has(r.status)) return "Invalid status";
  for (const [field, max] of Object.entries(FIELD_MAX_LENGTHS)) {
    if (r[field] !== undefined && r[field] !== null && String(r[field]).length > max) {
      return `${field} exceeds ${max} characters`;
    }
  }
  if (r.updated_at && Number.isNaN(new Date(r.updated_at).getTime())) return "Invalid updated_at";
  return null;
}

// Client clocks can't be trusted: without this, a malicious PUT with a
// far-future updated_at would "win" every future last-write-wins comparison
// forever, permanently locking out legitimate edits. Clamping to server time
// keeps the field useful for real conflict resolution while closing that hole.
function clampTimestamp(record) {
  const now = new Date();
  const ts = record.updated_at ? new Date(record.updated_at) : now;
  return { ...record, updated_at: (Number.isNaN(ts.getTime()) || ts > now ? now : ts).toISOString() };
}

export default async (request) => {
  // TEMPORARY diagnostic - reports only whether the key is configured, never
  // its value. Remove once ROSTER_ACCESS_KEY enforcement is confirmed working.
  if (request.headers.get("x-debug-check") === "1") {
    return json({ configured: !!process.env.ROSTER_ACCESS_KEY, keyLength: (process.env.ROSTER_ACCESS_KEY || "").length });
  }

  if (!checkAccess(request)) return json({ error: "Unauthorized" }, 401);

  const s = store();

  if (request.method === "GET") {
    const data = (await s.get(KEY, { type: "json" })) || [];
    return json(data);
  }

  if (request.method === "PUT") {
    let incoming;
    try {
      incoming = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const validationError = validateRecord(incoming);
    if (validationError) return json({ error: validationError }, 400);
    incoming = clampTimestamp(incoming);

    const current = (await s.get(KEY, { type: "json" })) || [];
    const byId = new Map(current.map((v) => [v.id, v]));
    const isNewRecord = !byId.has(incoming.id);
    if (isNewRecord && byId.size >= MAX_RECORDS) {
      return json({ error: `Roster is at its ${MAX_RECORDS}-record limit` }, 400);
    }
    const existing = byId.get(incoming.id);
    if (!existing || new Date(incoming.updated_at) >= new Date(existing.updated_at)) {
      byId.set(incoming.id, incoming);
    }
    const updated = Array.from(byId.values());
    await s.setJSON(KEY, updated);
    return json(updated);
  }

  if (request.method === "DELETE") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (!body || typeof body.id !== "string" || !body.id) return json({ error: "Missing id" }, 400);

    const current = (await s.get(KEY, { type: "json" })) || [];
    const updated = current.filter((v) => v.id !== body.id);
    await s.setJSON(KEY, updated);
    return json(updated);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/roster" };
