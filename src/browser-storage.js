const APP_STORAGE_PREFIX = "custom-import-profit-";

function clearStorage(storage) {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(APP_STORAGE_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in privacy-focused browser modes.
  }
}

export function clearSensitiveBrowserData() {
  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);
}
