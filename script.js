const API_URL = "/api/roster";
const POLL_INTERVAL_MS = 15000;

let SEED = { wards: [], stations: [] };
let STATIONS_BY_CODE = {};
let volunteers = [];
let editingId = null;

function cls(s) {
  return s.replace(/ /g, "-");
}

function uid() {
  return "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function setSyncStatus(text, isError) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("sync-error", !!isError);
}

async function apiFetchAll() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`GET ${API_URL} failed: ${res.status}`);
  return res.json();
}

async function apiPut(record) {
  const res = await fetch(API_URL, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`PUT ${API_URL} failed: ${res.status}`);
  return res.json();
}

async function apiDelete(id) {
  const res = await fetch(API_URL, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`DELETE ${API_URL} failed: ${res.status}`);
  return res.json();
}

function populateSelect(selectEl, options, placeholder) {
  selectEl.innerHTML = "";
  if (placeholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    selectEl.appendChild(opt);
  }
  options.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.value !== undefined ? o.value : o;
    opt.textContent = o.label !== undefined ? o.label : o;
    selectEl.appendChild(opt);
  });
}

function stationsForWard(ward) {
  return SEED.stations.filter((s) => !ward || s.ward === ward);
}

function refreshFormStationOptions() {
  const role = document.getElementById("f-role").value;
  const ward = document.getElementById("f-ward").value;
  const stationLabel = document.getElementById("f-station-label");
  const stationSelect = document.getElementById("f-station");

  if (role === "Ward Coordinator") {
    stationLabel.style.display = "none";
    stationSelect.required = false;
    stationSelect.value = "";
  } else {
    stationLabel.style.display = "";
    stationSelect.required = true;
    const opts = stationsForWard(ward).map((s) => ({
      value: s.code,
      label: `${s.name} (${s.registered_voters.toLocaleString()} reg.)`,
    }));
    populateSelect(stationSelect, opts, "Select a station...");
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("assignment-form").reset();
  document.getElementById("f-id").value = "";
  document.getElementById("f-role").value = "Canvasser";
  refreshFormStationOptions();
  document.getElementById("form-heading").textContent = "Add an assignment";
  document.getElementById("f-submit").textContent = "Add assignment";
  document.getElementById("f-cancel").hidden = true;
}

function startEdit(v) {
  editingId = v.id;
  document.getElementById("f-id").value = v.id;
  document.getElementById("f-name").value = v.name;
  document.getElementById("f-phone").value = v.phone || "";
  document.getElementById("f-role").value = v.role;
  document.getElementById("f-ward").value = v.ward;
  refreshFormStationOptions();
  document.getElementById("f-station").value = v.station_code || "";
  document.getElementById("f-status").value = v.status;
  document.getElementById("f-notes").value = v.notes || "";
  document.getElementById("form-heading").textContent = `Editing ${v.name}`;
  document.getElementById("f-submit").textContent = "Save changes";
  document.getElementById("f-cancel").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function onSubmit(e) {
  e.preventDefault();
  const role = document.getElementById("f-role").value;
  const stationCode = role === "Ward Coordinator" ? "" : document.getElementById("f-station").value;
  const station = STATIONS_BY_CODE[stationCode];

  const record = {
    id: editingId || uid(),
    name: document.getElementById("f-name").value.trim(),
    phone: document.getElementById("f-phone").value.trim(),
    role,
    ward: document.getElementById("f-ward").value,
    station_code: stationCode,
    station_name: station ? station.name : "",
    status: document.getElementById("f-status").value,
    notes: document.getElementById("f-notes").value.trim(),
    updated_at: new Date().toISOString(),
  };

  const submitBtn = document.getElementById("f-submit");
  submitBtn.disabled = true;
  try {
    volunteers = await apiPut(record);
    setSyncStatus(`Saved. Synced ${new Date().toLocaleTimeString()}`);
    resetForm();
    renderAll();
  } catch (err) {
    console.error(err);
    setSyncStatus("Could not save — check your connection and try again.", true);
  } finally {
    submitBtn.disabled = false;
  }
}

async function deleteVolunteer(id) {
  if (!confirm("Remove this assignment?")) return;
  try {
    volunteers = await apiDelete(id);
    setSyncStatus(`Saved. Synced ${new Date().toLocaleTimeString()}`);
    renderAll();
  } catch (err) {
    console.error(err);
    setSyncStatus("Could not remove — check your connection and try again.", true);
  }
}

function computeCoverage() {
  const canvasserCounts = {};
  const agentPresent = {};
  const coordinatorWards = new Set();

  volunteers.forEach((v) => {
    if (v.status === "Dropped") return;
    if (v.role === "Canvasser" && v.station_code) {
      canvasserCounts[v.station_code] = (canvasserCounts[v.station_code] || 0) + 1;
    } else if (v.role === "Polling Agent" && v.station_code) {
      agentPresent[v.station_code] = true;
    } else if (v.role === "Ward Coordinator") {
      coordinatorWards.add(v.ward);
    }
  });

  const stationRows = SEED.stations.map((s) => {
    const assignedCanvassers = canvasserCounts[s.code] || 0;
    const hasAgent = !!agentPresent[s.code];
    let status;
    if (hasAgent && assignedCanvassers >= s.target_canvassers) status = "Fully staffed";
    else if (hasAgent || assignedCanvassers > 0) status = "Partial";
    else status = "Unstaffed";
    return { ...s, assignedCanvassers, hasAgent, status };
  });

  return {
    stationRows,
    coordinatorWards,
    totalCanvassersAssigned: Object.values(canvasserCounts).reduce((a, b) => a + b, 0),
    totalCanvasserTarget: SEED.stations.reduce((a, s) => a + s.target_canvassers, 0),
    totalAgentsAssigned: Object.keys(agentPresent).length,
  };
}

function renderSummary(cov) {
  document.getElementById("stat-coordinators").textContent = `${cov.coordinatorWards.size}/${SEED.wards.length}`;
  document.getElementById("stat-agents").textContent = `${cov.totalAgentsAssigned}/${SEED.stations.length}`;
  document.getElementById("stat-canvassers").textContent = `${cov.totalCanvassersAssigned}/${cov.totalCanvasserTarget}`;
  document.getElementById("stat-full").textContent = cov.stationRows.filter((s) => s.status === "Fully staffed").length;
  document.getElementById("stat-partial").textContent = cov.stationRows.filter((s) => s.status === "Partial").length;
  document.getElementById("stat-unstaffed").textContent = cov.stationRows.filter((s) => s.status === "Unstaffed").length;
}

function renderRosterTable() {
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
  const roleFilter = document.getElementById("filter-role").value;
  const wardFilter = document.getElementById("filter-ward").value;
  const statusFilter = document.getElementById("filter-status").value;

  const filtered = volunteers.filter((v) => {
    if (roleFilter && v.role !== roleFilter) return false;
    if (wardFilter && v.ward !== wardFilter) return false;
    if (statusFilter && v.status !== statusFilter) return false;
    if (search && !(v.name.toLowerCase().includes(search) || (v.phone || "").toLowerCase().includes(search))) return false;
    return true;
  });

  const tbody = document.getElementById("roster-tbody");
  tbody.innerHTML = "";
  filtered
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((v) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(v.name)}</td>
        <td>${escapeHtml(v.phone || "—")}</td>
        <td><span class="role-pill ${cls(v.role)}">${v.role}</span></td>
        <td>${escapeHtml(v.ward)}</td>
        <td>${escapeHtml(v.station_name || "—")}</td>
        <td><span class="status-pill ${cls(v.status)}">${v.status}</span></td>
        <td>${escapeHtml(v.notes || "")}</td>
        <td class="row-actions">
          <button type="button" data-edit="${v.id}">Edit</button>
          <button type="button" class="danger" data-delete="${v.id}">Remove</button>
        </td>`;
      tbody.appendChild(tr);
    });

  document.getElementById("roster-empty").hidden = filtered.length > 0;

  tbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = volunteers.find((x) => x.id === btn.dataset.edit);
      if (v) startEdit(v);
    });
  });
  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteVolunteer(btn.dataset.delete));
  });
}

function renderCoverageTable(cov) {
  const wardFilter = document.getElementById("coverage-filter-ward").value;
  const statusFilter = document.getElementById("coverage-filter-status").value;

  const filtered = cov.stationRows.filter((s) => {
    if (wardFilter && s.ward !== wardFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    return true;
  });

  const tbody = document.getElementById("coverage-tbody");
  tbody.innerHTML = "";
  filtered.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.ward)}</td>
      <td class="num">${s.registered_voters.toLocaleString()}</td>
      <td class="num">${s.hasAgent ? "Yes" : "—"}</td>
      <td class="num">${s.assignedCanvassers}/${s.target_canvassers}</td>
      <td><span class="coverage-pill ${cls(s.status)}">${s.status}</span></td>`;
    tbody.appendChild(tr);
  });
}

function renderAll() {
  const cov = computeCoverage();
  renderSummary(cov);
  renderRosterTable();
  renderCoverageTable(cov);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CSV_FIELDS = ["id", "name", "phone", "role", "ward", "station_code", "station_name", "status", "notes", "updated_at"];

function toCsv(rows) {
  const esc = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_FIELDS.join(",")];
  rows.forEach((r) => lines.push(CSV_FIELDS.map((f) => esc(r[f])).join(",")));
  return lines.join("\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length && r.some((c) => c !== "")).map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = r[idx]));
    return obj;
  });
}

function exportCsv() {
  const csv = toCsv(volunteers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `butula_roster_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importCsv(file) {
  const text = await file.text();
  const imported = parseCsv(text);
  setSyncStatus(`Importing ${imported.length} row(s)...`);
  try {
    let updated = volunteers;
    for (const r of imported) {
      updated = await apiPut(r);
    }
    volunteers = updated;
    renderAll();
    setSyncStatus(`Saved. Synced ${new Date().toLocaleTimeString()}`);
    alert(`Imported ${imported.length} row(s). Roster now has ${volunteers.length} assignment(s).`);
  } catch (err) {
    console.error(err);
    setSyncStatus("Import failed partway — check your connection and try again.", true);
  }
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((c) => (c.hidden = true));
      document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
    });
  });
}

async function pollForUpdates() {
  if (editingId) return; // don't yank the roster out from under an in-progress edit
  try {
    volunteers = await apiFetchAll();
    renderAll();
    setSyncStatus(`Synced ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error(err);
    setSyncStatus("Offline — showing last synced data.", true);
  }
}

async function init() {
  try {
    const [seed, initialVolunteers] = await Promise.all([
      fetch("data/stations_seed.json").then((r) => r.json()),
      apiFetchAll(),
    ]);
    SEED = seed;
    STATIONS_BY_CODE = Object.fromEntries(seed.stations.map((s) => [s.code, s]));
    volunteers = initialVolunteers;

    populateSelect(document.getElementById("f-ward"), SEED.wards);
    populateSelect(document.getElementById("filter-ward"), SEED.wards, "All wards");
    populateSelect(document.getElementById("coverage-filter-ward"), SEED.wards, "All wards");
    refreshFormStationOptions();

    document.getElementById("assignment-form").addEventListener("submit", onSubmit);
    document.getElementById("f-role").addEventListener("change", refreshFormStationOptions);
    document.getElementById("f-ward").addEventListener("change", refreshFormStationOptions);
    document.getElementById("f-cancel").addEventListener("click", resetForm);

    ["filter-search", "filter-role", "filter-ward", "filter-status"].forEach((id) =>
      document.getElementById(id).addEventListener("input", renderRosterTable)
    );
    ["coverage-filter-ward", "coverage-filter-status"].forEach((id) =>
      document.getElementById(id).addEventListener("input", () => renderCoverageTable(computeCoverage()))
    );

    document.getElementById("btn-export").addEventListener("click", exportCsv);
    document.getElementById("btn-import").addEventListener("click", () => document.getElementById("file-import").click());
    document.getElementById("file-import").addEventListener("change", (e) => {
      if (e.target.files[0]) importCsv(e.target.files[0]);
      e.target.value = "";
    });

    setupTabs();
    renderAll();
    setSyncStatus(`Synced ${new Date().toLocaleTimeString()}`);
    setInterval(pollForUpdates, POLL_INTERVAL_MS);
  } catch (err) {
    console.error("Failed to load roster app:", err);
    setSyncStatus("Could not load the shared roster — check your connection and reload.", true);
  }
}

init();
