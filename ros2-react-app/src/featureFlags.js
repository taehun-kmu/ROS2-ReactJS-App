// Simple feature flag storage using localStorage with in-memory fallback.
// Default flags are set here; environment override may be added later if needed.

const STORAGE_KEY = "featureFlags";

const DEFAULT_FLAGS = {
  mapOverlay: false,
};

function loadFlags() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FLAGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_FLAGS, ...parsed };
  } catch (_e) {
    return { ...DEFAULT_FLAGS };
  }
}

function saveFlags(flags) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (_e) {
    // ignore persistence errors
  }
}

let cache = loadFlags();

export function isFeatureEnabled(name) {
  return !!cache[name];
}

export function setFeatureFlag(name, value) {
  cache = { ...cache, [name]: !!value };
  saveFlags(cache);
}

export function getAllFeatureFlags() {
  return { ...cache };
}

export function resetFeatureFlags() {
  cache = { ...DEFAULT_FLAGS };
  saveFlags(cache);
}

