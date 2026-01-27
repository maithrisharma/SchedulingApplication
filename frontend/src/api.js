const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

/**
 * Helper for GET requests
 */
export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Helper for POST with JSON body
 */
export async function apiPostJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Generic fetch wrapper
 * For custom requests (POST/PUT/DELETE/upload/etc)
 */
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);

  let data;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

/**
 * Helper for downloading files like Excel, CSV, etc.
 */
export async function apiFetchFile(path, filename) {
  const res = await fetch(`${BASE_URL}${path}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DOWNLOAD ${path} failed: ${res.status} ${text}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  window.URL.revokeObjectURL(url);
}

// api.js
export function apiMoveJob(scenario, job_id, target_start) {
  return apiPostJson(`/schedule/move/${scenario}`, { job_id, target_start });
}
// api.js
// NEW CODE ✅
export function apiSavePlanChanges(scenario, changes) {
  // Helper to format as naive ISO (no 'Z' suffix)
  const formatNaive = (isoString) => {
    if (!isoString) return isoString;
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  // Remove 'Z' suffix from all date strings
  const cleanedChanges = changes.map(ch => ({
    ...ch,
    Start: formatNaive(ch.Start),
    End: formatNaive(ch.End),
  }));

  return apiPostJson(`/schedule/overrides/${scenario}`, { changes: cleanedChanges });
}
export function apiApplyCandidate(scenario) {
  return apiPostJson(`/schedule/apply-candidate/${scenario}`, {});
}

export function apiDiscardCandidate(scenario) {
  return apiPostJson(`/schedule/discard-candidate/${scenario}`, {});
}

export function apiGenerateCandidate(scenario) {
  return apiPostJson(`/schedule/generate-candidate/${scenario}`, {});
}
export function apiOverridesStatus(scenario) {
  return apiGet(`/schedule/overrides-status/${scenario}`);
}

export function apiDiscardOverrides(scenario) {
  return apiPostJson(`/schedule/discard-overrides/${scenario}`, {});
}
