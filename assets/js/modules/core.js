/**
 * core.js
 * Core utilities and helper functions
 */

/**
 * Check if a file is a PDF
 */
export function isPdf(file) {
  return Boolean(
    file && 
    (file.type === "application/pdf" || 
     file.name.toLowerCase().endsWith(".pdf"))
  );
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)), 
    units.length - 1
  );
  return `${Number((bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0))} ${units[exponent]}`;
}

/**
 * Add suffix to filename before extension
 */
export function filenameWithSuffix(filename, suffix) {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}${suffix}.pdf`;
}

/**
 * Download blob as file
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Get route from URL hash
 */
export function getRouteFromHash() {
  return window.location.hash.replace("#", "") || "compress";
}

/**
 * Scroll to workspace section
 */
export function scrollToWorkspace() {
  document.querySelector(".workspace-band")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

/**
 * Bind drag-and-drop to an element
 */
export function bindDropZone(dropZone, input, onFiles) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    onFiles(Array.from(event.dataTransfer.files || []));
  });

  input.addEventListener("change", () => {
    onFiles(Array.from(input.files || []));
  });
}

/**
 * Convert error to user-friendly message
 */
export function readableError(error, fallback) {
  const message = error?.message || String(error || "");
  if (!message) return fallback;
  if (message.includes("encrypted")) {
    return `${fallback} Encrypted PDFs may need to be unlocked first.`;
  }
  if (message.includes("PasswordException")) {
    return `${fallback} This PDF requires a password.`;
  }
  if (message.includes("SharedArrayBuffer")) {
    return `${fallback} This browser configuration doesn't support compression. Try reloading the page.`;
  }
  return `${fallback} ${message}`;
}

/**
 * Detect browser features
 */
export function detectFeatures() {
  const features = {
    serviceWorker: "serviceWorker" in navigator,
    wasm: typeof WebAssembly !== "undefined",
    webWorker: typeof Worker !== "undefined",
    createImageBitmap: typeof createImageBitmap !== "undefined",
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    webgpu: "gpu" in navigator,
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated: window.crossOriginIsolated || false,
  };
  
  return features;
}

/**
 * Check if all required features are available
 */
export function checkRequiredFeatures(features) {
  const missing = [];
  
  if (!features.serviceWorker) missing.push("Service Workers");
  if (!features.wasm) missing.push("WebAssembly");
  if (!features.webWorker) missing.push("Web Workers");
  if (!features.createImageBitmap) missing.push("ImageBitmap API");
  
  return {
    supported: missing.length === 0,
    missing,
  };
}

/**
 * Debounce function calls
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function calls
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Safely parse JSON
 */
export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Create unique ID
 */
export function uniqueId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
