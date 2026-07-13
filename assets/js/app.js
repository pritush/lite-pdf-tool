/* Ghostscript compression runs in assets/js/compress-worker.js (Web Worker) */
import createQPDF from "https://cdn.jsdelivr.net/npm/qpdf-wasm-esm-embedded@1.1.1/qpdf.mjs";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.mjs";
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/+esm";

// Import modular utilities
import { CONFIG } from "./modules/config.js";
import { 
  isPdf, 
  formatBytes, 
  filenameWithSuffix, 
  downloadBlob, 
  getRouteFromHash,
  scrollToWorkspace,
  bindDropZone,
  readableError,
  detectFeatures,
  checkRequiredFeatures
} from "./modules/core.js";
import { 
  setStatus, 
  setProgress, 
  setMetrics, 
  activateRoute,
  showCompatibilityWarning,
  showCrossOriginWarning,
  initTheme 
} from "./modules/ui.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = CONFIG.CDN.PDFJS_WORKER;

const routes = CONFIG.ROUTES;
const compressionModeMap = CONFIG.COMPRESSION_MODES;

const elements = {
  tabs: document.querySelectorAll("[data-route]"),
  panels: document.querySelectorAll("[data-panel]"),

  compressInput: document.querySelector("#compress-file"),
  compressDrop: document.querySelector("#compress-drop"),
  compressMeta: document.querySelector("#compress-file-meta"),
  compressButton: document.querySelector("#compress-button"),
  compressDownload: document.querySelector("#compress-download"),
  compressStatus: document.querySelector("#compress-status"),
  compressProgress: document.querySelector("#compress-progress"),
  compressMetrics: document.querySelector("#compress-metrics"),

  organizeInput: document.querySelector("#organize-file"),
  organizeAddInput: document.querySelector("#organize-add-file"),
  organizeDrop: document.querySelector("#organize-drop"),
  organizeMeta: document.querySelector("#organize-file-meta"),
  organizeButton: document.querySelector("#organize-button"),
  organizeDownload: document.querySelector("#organize-download"),
  organizeReset: document.querySelector("#organize-reset"),
  organizeClear: document.querySelector("#organize-clear"),
  organizeStatus: document.querySelector("#organize-status"),
  pageGrid: document.querySelector("#page-grid"),
  pageEmpty: document.querySelector("#page-empty"),

  protectInput: document.querySelector("#protect-file"),
  protectDrop: document.querySelector("#protect-drop"),
  protectMeta: document.querySelector("#protect-file-meta"),
  protectPassword: document.querySelector("#protect-password"),
  protectConfirm: document.querySelector("#protect-confirm"),
  protectButton: document.querySelector("#protect-button"),
  protectDownload: document.querySelector("#protect-download"),
  protectStatus: document.querySelector("#protect-status"),

  themeToggle: document.querySelector("#theme-toggle"),
  themeIcon: document.querySelector("#theme-icon"),
};

const state = {
  compress: {
    file: null,
    result: null,
  },
  protect: {
    file: null,
    blob: null,
  },
  organize: {
    baseFile: null,
    sources: new Map(),
    pages: new Map(),
    sourceCounter: 0,
    pageCounter: 0,
    sortable: null,
    blob: null,
  },
};

let qpdfPromise = null;
let compressWorker = null;

// Check browser compatibility on load
const features = detectFeatures();
const compatibility = checkRequiredFeatures(features);

if (!compatibility.supported) {
  console.error("[App] Missing required features:", compatibility.missing);
  showCompatibilityWarning(compatibility.missing);
}

// Warn if not cross-origin isolated (affects compression)
if (!features.crossOriginIsolated && features.serviceWorker) {
  console.warn("[App] Not cross-origin isolated. Compression may not work until page reload.");
  showCrossOriginWarning();
}

console.log("[App] Feature detection:", features);

function activateRouteHandler(routeName) {
  activateRoute(routeName, routes);
}

function scrollToWorkspace() {
  document.querySelector(".workspace-band")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function getRouteFromHashHandler() {
  return getRouteFromHash();
}

function isPdfHandler(file) {
  return isPdf(file);

function formatBytesHandler(bytes) {
  return formatBytes(bytes);

function filenameWithSuffixHandler(filename, suffix) {
  return filenameWithSuffix(filename, suffix);

function setStatusHandler(element, message, type = "info") {
  setStatus(element, message, type);

function setProgressHandler(percent, indeterminate = false) {
  setProgress(elements.compressProgress, percent, indeterminate);

function setMetricsHandler(original = "-", estimated = "-", compressed = "-", saved = "-") {
  setMetrics(elements.compressMetrics, original, estimated, compressed, saved);

function getSelectedCompressionMode() {
  const selectedLevel = document.querySelector('input[name="compression-level"]:checked')?.value || "medium";
  return compressionModeMap[selectedLevel];
}

function estimateCompressedSize(file, mode = getSelectedCompressionMode()) {
  if (!file || !mode?.estimateRange) return "-";

  const [lowRatio, highRatio] = mode.estimateRange;
  const low = Math.max(1, Math.round(file.size * lowRatio));
  const high = Math.max(low, Math.round(file.size * highRatio));

  if (Math.abs(high - low) < 1024) return `~${formatBytes(high)}`;
  return `${formatBytes(low)}-${formatBytes(high)}`;
}

function updateCompressionEstimate() {
  const file = state.compress.file;
  if (!file) return;

  const actual = state.compress.result?.blob ? formatBytes(state.compress.result.blob.size) : "-";
  const saved = state.compress.result?.blob
    ? `${Math.max(0, Math.round((1 - state.compress.result.blob.size / file.size) * 100))}%`
    : "-";

  setMetricsHandler(formatBytes(file.size), estimateCompressedSize(file), actual, saved);
}

function downloadBlobHandler(blob, filename) {
  downloadBlob(blob, filename);
}

function bindDropZoneHandler(dropZone, input, onFiles) {
  bindDropZone(dropZone, input, onFiles);
}

function updateCompressReady() {
  elements.compressButton.disabled = !state.compress.file;
}

function setCompressFile(file) {
  state.compress.file = null;
  state.compress.result = null;
  elements.compressDownload.disabled = true;
  setProgressHandler(0);
  setMetricsHandler();

  if (!file) {
    elements.compressMeta.textContent = "PDF only";
    setStatusHandler(elements.compressStatus, "Choose a PDF to begin.");
    updateCompressReady();
    return;
  }

  if (!isPdf(file)) {
    elements.compressMeta.textContent = "PDF only";
    setStatusHandler(elements.compressStatus, "That file is not a PDF.", "error");
    updateCompressReady();
    return;
  }

  state.compress.file = file;
  elements.compressMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  updateCompressionEstimate();
  setStatusHandler(elements.compressStatus, `${file.name} is ready.`);
  updateCompressReady();
}

async function compressCurrentPdf() {
  const file = state.compress.file;
  if (!file) return;

  const mode = getSelectedCompressionMode();

  state.compress.result = null;
  elements.compressButton.disabled = true;
  elements.compressDownload.disabled = true;
  updateCompressionEstimate();
  setProgressHandler(2, true);
  setStatusHandler(elements.compressStatus, "Loading compression engine...");

  try {
    const originalBytes = await file.arrayBuffer();
    const originalPageCount = await getPdfPageCount(originalBytes);

    /* Terminate any in-flight worker from a previous run */
    if (compressWorker) {
      compressWorker.terminate();
      compressWorker = null;
    }

    const worker = new Worker("assets/js/compress-worker.js", { type: "module" });
    compressWorker = worker;

    const outputBytes = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const msg = e.data;
        switch (msg.type) {
          case "progress":
            setProgressHandler(msg.percent);
            break;
          case "status":
            setStatusHandler(elements.compressStatus, msg.message);
            break;
          case "complete":
            resolve(msg.outputBytes);
            break;
          case "error":
            reject(new Error(msg.message));
            break;
        }
      };

      worker.onerror = (err) => {
        reject(new Error(err.message || "Compression worker error."));
      };

      /* Transfer the buffer (zero-copy to worker) */
      const buffer = originalBytes.slice(0);
      worker.postMessage(
        { inputBytes: buffer, mode, totalPages: originalPageCount },
        [buffer],
      );
    });

    /* Verify page count of the compressed output */
    const outputPageCount = await getPdfPageCount(outputBytes);
    if (originalPageCount !== outputPageCount) {
      throw new Error(
        `Output page count changed from ${originalPageCount} to ${outputPageCount}. Compression was cancelled.`,
      );
    }

    const outputBlob = new Blob([outputBytes], { type: "application/pdf" });
    const savedPercent = Math.max(0, Math.round((1 - outputBlob.size / file.size) * 100));

    state.compress.result = {
      blob: outputBlob,
      filename: filenameWithSuffix(file.name, "-compressed"),
    };

    setProgressHandler(100);
    setMetricsHandler(formatBytes(file.size), estimateCompressedSize(file, mode), formatBytes(outputBlob.size), `${savedPercent}%`);

    if (outputBlob.size >= file.size) {
      setStatusHandler(
        elements.compressStatus,
        `This PDF is already well-optimized — ${mode.label} compression couldn't reduce it further.`,
        "info",
      );
    } else {
      setStatusHandler(elements.compressStatus, `${mode.label} compression complete — ${savedPercent}% saved.`, "success");
    }
    elements.compressDownload.disabled = false;
  } catch (error) {
    setProgressHandler(0);
    setStatusHandler(elements.compressStatus, readableError(error, "Compression failed."), "error");
  } finally {
    elements.compressButton.disabled = !state.compress.file;
  }
}

/* getGhostscript() and compressWithGhostscript() removed —
   compression now runs inside compress-worker.js (Web Worker). */

async function getPdfPageCount(bytes) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  await pdf.destroy();
  return numPages;
}

function updateProtectReady() {
  const password = elements.protectPassword.value;
  const confirm = elements.protectConfirm.value;
  elements.protectButton.disabled = !(state.protect.file && password && password === confirm);
}

function setProtectFile(file) {
  state.protect.file = null;
  state.protect.blob = null;
  elements.protectDownload.disabled = true;

  if (!file) {
    elements.protectMeta.textContent = "PDF only";
    setStatusHandler(elements.protectStatus, "Choose a PDF and password to begin.");
    updateProtectReady();
    return;
  }

  if (!isPdf(file)) {
    elements.protectMeta.textContent = "PDF only";
    setStatusHandler(elements.protectStatus, "That file is not a PDF.", "error");
    updateProtectReady();
    return;
  }

  state.protect.file = file;
  elements.protectMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  setStatusHandler(elements.protectStatus, `${file.name} is ready.`);
  updateProtectReady();
}

async function getQpdf() {
  if (!qpdfPromise) {
    qpdfPromise = createQPDF({
      print: () => {},
      printErr: () => {},
    });
  }
  return qpdfPromise;
}

async function protectCurrentPdf() {
  const file = state.protect.file;
  const password = elements.protectPassword.value;
  const confirm = elements.protectConfirm.value;

  if (!file) return;
  if (!password || password !== confirm) {
    setStatusHandler(elements.protectStatus, "Passwords must match.", "error");
    return;
  }

  elements.protectButton.disabled = true;
  elements.protectDownload.disabled = true;
  state.protect.blob = null;
  setStatusHandler(elements.protectStatus, "Loading encryption engine...");

  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputName = `/input-${stamp}.pdf`;
  const outputName = `/protected-${stamp}.pdf`;

  try {
    const qpdf = await getQpdf();
    const bytes = new Uint8Array(await file.arrayBuffer());

    qpdf.FS.writeFile(inputName, bytes);
    qpdf.callMain(["--encrypt", password, password, "256", "--", inputName, outputName]);
    const output = qpdf.FS.readFile(outputName);

    state.protect.blob = new Blob([output], { type: "application/pdf" });
    setStatusHandler(elements.protectStatus, "Password protection complete.", "success");
    elements.protectDownload.disabled = false;
  } catch (error) {
    setStatusHandler(elements.protectStatus, readableError(error, "Password protection failed."), "error");
  } finally {
    await cleanupQpdfFiles(inputName, outputName);
    updateProtectReady();
  }
}

async function cleanupQpdfFiles(...paths) {
  try {
    const qpdf = await qpdfPromise;
    paths.forEach((path) => {
      try {
        qpdf.FS.unlink(path);
      } catch {
        /* Virtual files may not exist after failed runs. */
      }
    });
  } catch {
    /* QPDF never initialized. */
  }
}

function resetOrganizer() {
  state.organize.sources.clear();
  state.organize.pages.clear();
  state.organize.sourceCounter = 0;
  state.organize.pageCounter = 0;
  state.organize.blob = null;
  elements.pageGrid.replaceChildren();
  elements.pageEmpty.hidden = false;
  elements.organizeDownload.disabled = true;
  updateOrganizerControls();
}

function updateOrganizerControls() {
  const hasPages = elements.pageGrid.children.length > 0;
  elements.organizeButton.disabled = !hasPages;
  elements.organizeReset.disabled = !state.organize.baseFile;
  elements.organizeClear.disabled = !hasPages;
  elements.organizeDownload.disabled = !state.organize.blob;
  elements.pageEmpty.hidden = hasPages;
}

async function setOrganizeBaseFile(file) {
  resetOrganizer();
  state.organize.baseFile = null;

  if (!file) {
    elements.organizeMeta.textContent = "PDF only";
    setStatusHandler(elements.organizeStatus, "Select a PDF to show pages.");
    return;
  }

  if (!isPdf(file)) {
    elements.organizeMeta.textContent = "PDF only";
    setStatusHandler(elements.organizeStatus, "That file is not a PDF.", "error");
    return;
  }

  state.organize.baseFile = file;
  elements.organizeMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  setStatusHandler(elements.organizeStatus, "Rendering pages...");

  try {
    await appendPdfSource(file, true);
    setStatusHandler(elements.organizeStatus, `${file.name} loaded.`, "success");
  } catch (error) {
    resetOrganizer();
    elements.organizeMeta.textContent = "PDF only";
    setStatusHandler(elements.organizeStatus, readableError(error, "Could not read this PDF."), "error");
  }
}

async function addOrganizeFiles(files) {
  const pdfs = files.filter(isPdf);
  if (!pdfs.length) {
    setStatusHandler(elements.organizeStatus, "Select PDF files to add.", "error");
    return;
  }

  elements.organizeButton.disabled = true;
  elements.organizeDownload.disabled = true;
  state.organize.blob = null;

  try {
    for (const file of pdfs) {
      setStatusHandler(elements.organizeStatus, `Adding pages from ${file.name}...`);
      await appendPdfSource(file, false);
    }
    setStatusHandler(elements.organizeStatus, `${pdfs.length} PDF ${pdfs.length === 1 ? "was" : "were"} added.`, "success");
  } catch (error) {
    setStatusHandler(elements.organizeStatus, readableError(error, "Could not add PDF pages."), "error");
  } finally {
    updateOrganizerControls();
  }
}

async function appendPdfSource(file, isBase) {
  const bytes = await file.arrayBuffer();
  const sourceId = `source-${++state.organize.sourceCounter}`;
  state.organize.sources.set(sourceId, {
    id: sourceId,
    name: file.name,
    bytes,
    isBase,
  });

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const pdf = await loadingTask.promise;

  /* ① Create all page tiles immediately (instant visual feedback) */
  const tiles = [];
  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
    const pageId = `page-${++state.organize.pageCounter}`;
    const descriptor = {
      id: pageId,
      sourceId,
      sourceName: file.name,
      pageIndex,
      originalNumber: pageIndex + 1,
    };
    state.organize.pages.set(pageId, descriptor);
    const item = createPageTile(descriptor);
    item.querySelector(".page-thumb").classList.add("is-loading");
    elements.pageGrid.append(item);
    tiles.push({ item, pageNumber: pageIndex + 1 });
  }

  /* ② Render thumbnails in parallel chunks — yields to the event loop
     between batches so the UI stays responsive for large PDFs. */
  const CHUNK = 4;
  for (let i = 0; i < tiles.length; i += CHUNK) {
    const chunk = tiles.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async ({ item, pageNumber }) => {
        const canvas = item.querySelector("canvas");
        await renderThumbnail(pdf, pageNumber, canvas);
        item.querySelector(".page-thumb").classList.remove("is-loading");
      }),
    );
    if (i + CHUNK < tiles.length) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  await pdf.destroy();

  setupSortable();
  updateOrganizerControls();
}

function setupSortable() {
  if (state.organize.sortable) return;

  state.organize.sortable = Sortable.create(elements.pageGrid, {
    animation: 150,
    filter: ".danger",
    preventOnFilter: false,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onSort: () => {
      state.organize.blob = null;
      updateOrganizerControls();
      refreshPageLabels();
    },
  });
}

function createPageTile(page) {
  const item = document.createElement("article");
  item.className = "pdf-page-tile";
  item.dataset.pageId = page.id;

  const actions = document.createElement("div");
  actions.className = "tile-actions";

  const drag = document.createElement("button");
  drag.className = "icon-only drag-handle";
  drag.type = "button";
  drag.title = "Drag page";
  drag.innerHTML = '<i class="bi bi-grip-vertical" aria-hidden="true"></i>';

  const remove = document.createElement("button");
  remove.className = "icon-only danger";
  remove.type = "button";
  remove.title = "Delete page";
  remove.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
  remove.addEventListener("click", () => removePage(page.id));

  actions.append(drag, remove);

  const thumb = document.createElement("div");
  thumb.className = "page-thumb";
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 160;
  thumb.append(canvas);

  const meta = document.createElement("div");
  meta.className = "page-meta";
  const label = document.createElement("span");
  label.textContent = `Page ${page.originalNumber}`;
  const source = document.createElement("small");
  source.textContent = page.sourceName;
  meta.append(label, source);

  item.append(actions, thumb, meta);
  return item;
}

async function renderThumbnail(pdf, pageNumber, canvas) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const targetWidth = 120;
  const scale = targetWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  const context = canvas.getContext("2d", { alpha: false });

  canvas.width = Math.ceil(scaledViewport.width);
  canvas.height = Math.ceil(scaledViewport.height);

  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;
}

function removePage(pageId) {
  const item = elements.pageGrid.querySelector(`[data-page-id="${CSS.escape(pageId)}"]`);
  if (!item) return;

  item.classList.add("is-removing");
  window.setTimeout(() => {
    item.remove();
    state.organize.pages.delete(pageId);
    state.organize.blob = null;
    refreshPageLabels();
    updateOrganizerControls();
  }, 80);
}

function refreshPageLabels() {
  Array.from(elements.pageGrid.children).forEach((item, index) => {
    const label = item.querySelector(".page-meta span");
    if (label) label.textContent = `Output page ${index + 1}`;
  });
}

async function saveOrganizedPdf() {
  const orderedItems = Array.from(elements.pageGrid.children);
  if (!orderedItems.length) {
    setStatusHandler(elements.organizeStatus, "No pages are available to save.", "error");
    return;
  }

  elements.organizeButton.disabled = true;
  elements.organizeDownload.disabled = true;
  state.organize.blob = null;
  setStatusHandler(elements.organizeStatus, "Building organized PDF...");

  try {
    const output = await PDFDocument.create();
    const loadedDocs = new Map();

    for (const item of orderedItems) {
      const page = state.organize.pages.get(item.dataset.pageId);
      const source = state.organize.sources.get(page.sourceId);

      if (!loadedDocs.has(source.id)) {
        const sourceDoc = await PDFDocument.load(source.bytes.slice(0));
        loadedDocs.set(source.id, sourceDoc);
      }

      const sourceDoc = loadedDocs.get(source.id);
      const [copiedPage] = await output.copyPages(sourceDoc, [page.pageIndex]);
      output.addPage(copiedPage);
    }

    const pdfBytes = await output.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    state.organize.blob = new Blob([pdfBytes], { type: "application/pdf" });
    setStatusHandler(elements.organizeStatus, "Organized PDF is ready.", "success");
    elements.organizeDownload.disabled = false;
  } catch (error) {
    setStatusHandler(elements.organizeStatus, readableError(error, "Could not build the organized PDF."), "error");
  } finally {
    updateOrganizerControls();
  }
}

function clearOrganizer() {
  resetOrganizer();
  state.organize.baseFile = null;
  elements.organizeInput.value = "";
  elements.organizeAddInput.value = "";
  elements.organizeMeta.textContent = "PDF only";
  setStatusHandler(elements.organizeStatus, "Select a PDF to show pages.");
}

function readableErrorHandler(error, fallback) {
  return readableError(error, fallback);
}

bindDropZone(elements.compressDrop, elements.compressInput, (files) => setCompressFile(files[0]));
bindDropZone(elements.protectDrop, elements.protectInput, (files) => setProtectFile(files[0]));
bindDropZone(elements.organizeDrop, elements.organizeInput, (files) => setOrganizeBaseFile(files[0]));

elements.compressButton.addEventListener("click", compressCurrentPdf);
document.querySelectorAll('input[name="compression-level"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.compress.result = null;
    elements.compressDownload.disabled = true;
    setProgressHandler(0);
    updateCompressionEstimate();
    if (state.compress.file) {
      const mode = getSelectedCompressionMode();
      setStatusHandler(elements.compressStatus, `${mode.label} compression selected for ${state.compress.file.name}.`);
    }
  });
});
elements.compressDownload.addEventListener("click", () => {
  const result = state.compress.result;
  const file = state.compress.file;
  if (result && file) downloadBlob(result.blob, filenameWithSuffix(file.name, "-compressed"));
});

elements.protectButton.addEventListener("click", protectCurrentPdf);
elements.protectDownload.addEventListener("click", () => {
  if (state.protect.blob && state.protect.file) {
    downloadBlob(state.protect.blob, filenameWithSuffix(state.protect.file.name, "-protected"));
  }
});

elements.protectPassword.addEventListener("input", updateProtectReady);
elements.protectConfirm.addEventListener("input", updateProtectReady);

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.dataset.togglePassword}`);
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.title = isHidden ? "Hide password" : "Show password";
    button.querySelector("i").className = isHidden ? "bi bi-eye-slash" : "bi bi-eye";
  });
});

elements.organizeAddInput.addEventListener("change", () => {
  addOrganizeFiles(Array.from(elements.organizeAddInput.files || []));
});
elements.organizeButton.addEventListener("click", saveOrganizedPdf);
elements.organizeDownload.addEventListener("click", () => {
  if (state.organize.blob) {
    const filename = state.organize.baseFile ? state.organize.baseFile.name : "organized.pdf";
    downloadBlob(state.organize.blob, filenameWithSuffix(filename, "-organized"));
  }
});
elements.organizeReset.addEventListener("click", () => {
  if (state.organize.baseFile) setOrganizeBaseFile(state.organize.baseFile);
});
elements.organizeClear.addEventListener("click", clearOrganizer);

window.addEventListener("hashchange", () => activateRouteHandler(getRouteFromHashHandler()));

elements.tabs.forEach((item) => {
  item.addEventListener("click", () => window.setTimeout(scrollToWorkspace, 0));
});

if (!window.location.hash) {
  window.location.hash = "#compress";
} else {
  activateRouteHandler(getRouteFromHashHandler());
}

// Initialize theme
initTheme();

