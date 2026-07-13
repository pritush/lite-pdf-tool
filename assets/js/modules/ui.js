/**
 * ui.js
 * UI update functions - status, progress, metrics
 */

/**
 * Set status message with icon and styling
 */
export function setStatus(element, message, type = "info") {
  if (!element) return;
  
  const icon = element.querySelector("i");
  const text = element.querySelector("span");

  element.classList.remove("is-success", "is-error");
  if (type === "success") element.classList.add("is-success");
  if (type === "error") element.classList.add("is-error");

  if (icon) {
    icon.className = {
      info: "bi bi-info-circle",
      success: "bi bi-check-circle",
      error: "bi bi-exclamation-triangle",
    }[type] || "bi bi-info-circle";
  }

  if (text) text.textContent = message;
}

/**
 * Set progress bar value
 */
export function setProgress(element, percent, indeterminate = false) {
  if (!element) return;
  
  if (indeterminate) {
    element.classList.add("indeterminate");
    element.style.width = "100%";
    element.parentElement?.setAttribute("aria-valuenow", "0");
  } else {
    element.classList.remove("indeterminate");
    const next = Math.max(0, Math.min(100, Math.round(percent)));
    element.style.width = `${next}%`;
    element.parentElement?.setAttribute("aria-valuenow", String(next));
  }
}

/**
 * Set compression metrics display
 */
export function setMetrics(container, original = "-", estimated = "-", compressed = "-", saved = "-") {
  if (!container) return;
  
  const metrics = container.querySelectorAll("strong");
  if (metrics.length >= 4) {
    metrics[0].textContent = original;
    metrics[1].textContent = estimated;
    metrics[2].textContent = compressed;
    metrics[3].textContent = saved;
  }
}

/**
 * Activate route - show/hide panels and update tabs
 */
export function activateRoute(routeName, routes = ["compress", "organize", "protect"]) {
  const route = routes.includes(routeName) ? routeName : "compress";

  // Update tab states
  document.querySelectorAll("[data-route]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.route === route);
  });

  // Update panel visibility
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== route;
  });
}

/**
 * Show browser compatibility warning
 */
export function showCompatibilityWarning(missingFeatures) {
  const warning = document.createElement("div");
  warning.className = "alert alert-danger m-3";
  warning.setAttribute("role", "alert");
  warning.innerHTML = `
    <h4 class="alert-heading">Browser Not Supported</h4>
    <p>Your browser is missing required features:</p>
    <ul>
      ${missingFeatures.map(f => `<li>${f}</li>`).join("")}
    </ul>
    <hr>
    <p class="mb-0">Please use a modern browser like Chrome, Edge, Firefox, or Safari.</p>
  `;
  
  document.body.insertBefore(warning, document.body.firstChild);
}

/**
 * Show cross-origin isolation warning
 */
export function showCrossOriginWarning() {
  const warning = document.createElement("div");
  warning.className = "alert alert-warning m-3";
  warning.setAttribute("role", "alert");
  warning.innerHTML = `
    <h5 class="alert-heading">
      <i class="bi bi-exclamation-triangle"></i> 
      Compression May Not Work
    </h5>
    <p>
      This page is not cross-origin isolated, which may prevent PDF compression from working.
      ${!navigator.serviceWorker ? "Service Workers are not supported." : ""}
    </p>
    <p class="mb-0">
      <strong>Solution:</strong> Reload the page. The Service Worker will activate and inject the required headers.
    </p>
  `;
  
  const container = document.querySelector(".workspace-band .app-container");
  if (container) {
    container.insertBefore(warning, container.firstChild);
  }
}

/**
 * Create loading overlay
 */
export function createLoadingOverlay(message = "Loading...") {
  const overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.innerHTML = `
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">${message}</span>
    </div>
    <p class="mt-3">${message}</p>
  `;
  
  return overlay;
}

/**
 * Show toast notification
 */
export function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
  
  // Auto-remove
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Update button loading state
 */
export function setButtonLoading(button, isLoading, originalText = "") {
  if (!button) return;
  
  if (isLoading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      Processing...
    `;
  } else {
    button.disabled = false;
    button.innerHTML = originalText || button.dataset.originalText || button.innerHTML;
  }
}

/**
 * Initialize theme toggle
 */
export function initTheme() {
  const savedTheme = localStorage.getItem("pdf-tool-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
  
  setTheme(initialTheme);

  const themeToggle = document.querySelector("#theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      setTheme(currentTheme === "light" ? "dark" : "light");
    });
  }
}

/**
 * Set theme
 */
export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("pdf-tool-theme", theme);
  
  const themeIcon = document.querySelector("#theme-icon");
  if (themeIcon) {
    themeIcon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-fill";
  }
}
