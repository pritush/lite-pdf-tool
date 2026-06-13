import createGhostscript from "https://cdn.jsdelivr.net/npm/ghostscript-wasm-esm@1.0.1/gs.mjs";
import createQPDF from "https://cdn.jsdelivr.net/npm/qpdf-wasm-esm-embedded@1.1.1/qpdf.mjs";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.mjs";
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/+esm";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.mjs";

const routes = ["compress", "organize", "protect"];
const compressionModeMap = {
  low: {
    preset: "/printer",
    label: "Low",
    estimateRange: [0.7, 0.95],
    extra: [],
  },
  medium: {
    preset: "/ebook",
    label: "Medium",
    estimateRange: [0.45, 0.75],
    extra: ["-dDetectDuplicateImages=true"],
  },
  high: {
    preset: "/screen",
    label: "High",
    estimateRange: [0.25, 0.55],
    extra: [
      "-dDetectDuplicateImages=true",
      "-dDownsampleColorImages=true",
      "-dColorImageResolution=120",
      "-dDownsampleGrayImages=true",
      "-dGrayImageResolution=120",
    ],
  },
  extreme: {
    preset: "/screen",
    label: "Extreme",
    estimateRange: [0.15, 0.4],
    extra: [
      "-dDetectDuplicateImages=true",
      "-dDownsampleColorImages=true",
      "-dColorImageResolution=72",
      "-dDownsampleGrayImages=true",
      "-dGrayImageResolution=72",
      "-dDownsampleMonoImages=true",
      "-dMonoImageResolution=150",
    ],
  },
};

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
let ghostscriptPromise = null;

function activateRoute(routeName) {
  const route = routes.includes(routeName) ? routeName : "compress";

  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.route === route);
  });

  elements.panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== route;
  });
}

function scrollToWorkspace() {
  document.querySelector(".workspace-band")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function getRouteFromHash() {
  return window.location.hash.replace("#", "") || "compress";
}

function isPdf(file) {
  return Boolean(file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")));
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0))} ${units[exponent]}`;
}

function filenameWithSuffix(filename, suffix) {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}${suffix}.pdf`;
}

function setStatus(element, message, type = "info") {
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

function setProgress(percent) {
  const next = Math.max(0, Math.min(100, Math.round(percent)));
  elements.compressProgress.style.width = `${next}%`;
  elements.compressProgress.parentElement.setAttribute("aria-valuenow", String(next));
}

function setMetrics(original = "-", estimated = "-", compressed = "-", saved = "-") {
  const metrics = elements.compressMetrics.querySelectorAll("strong");
  metrics[0].textContent = original;
  metrics[1].textContent = estimated;
  metrics[2].textContent = compressed;
  metrics[3].textContent = saved;
}

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
  if (!file) {
    setMetrics();
    return;
  }

  const actual = state.compress.result?.blob ? formatBytes(state.compress.result.blob.size) : "-";
  const saved = state.compress.result?.blob
    ? `${Math.max(0, Math.round((1 - state.compress.result.blob.size / file.size) * 100))}%`
    : "-";

  setMetrics(formatBytes(file.size), estimateCompressedSize(file), actual, saved);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function bindDropZone(dropZone, input, onFiles) {
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

function updateCompressReady() {
  elements.compressButton.disabled = !state.compress.file;
}

function setCompressFile(file) {
  state.compress.file = null;
  state.compress.result = null;
  elements.compressDownload.disabled = true;
  setProgress(0);
  setMetrics();

  if (!file) {
    elements.compressMeta.textContent = "PDF only";
    setStatus(elements.compressStatus, "Choose a PDF to begin.");
    updateCompressReady();
    return;
  }

  if (!isPdf(file)) {
    elements.compressMeta.textContent = "PDF only";
    setStatus(elements.compressStatus, "That file is not a PDF.", "error");
    updateCompressReady();
    return;
  }

  state.compress.file = file;
  elements.compressMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  updateCompressionEstimate();
  setStatus(elements.compressStatus, `${file.name} is ready.`);
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
  setProgress(3);
  setStatus(elements.compressStatus, `Loading ${mode.label.toLowerCase()} compression engine...`);

  try {
    const originalBytes = await file.arrayBuffer();
    const originalPageCount = await getPdfPageCount(originalBytes);

    setProgress(18);
    setStatus(elements.compressStatus, "Optimizing PDF structure and image streams...");

    const outputBytes = await compressWithGhostscript(originalBytes, mode);
    const outputPageCount = await getPdfPageCount(outputBytes);

    if (originalPageCount !== outputPageCount) {
      throw new Error(`Output page count changed from ${originalPageCount} to ${outputPageCount}. Compression was cancelled.`);
    }

    const outputBlob = new Blob([outputBytes], { type: "application/pdf" });
    const savedPercent = Math.max(0, Math.round((1 - outputBlob.size / file.size) * 100));

    state.compress.result = {
      blob: outputBlob,
      filename: filenameWithSuffix(file.name, "-compressed"),
    };

    setProgress(100);
    setMetrics(formatBytes(file.size), estimateCompressedSize(file, mode), formatBytes(outputBlob.size), `${savedPercent}%`);
    setStatus(elements.compressStatus, `${mode.label} compression complete. Page count verified.`, "success");
    elements.compressDownload.disabled = false;
  } catch (error) {
    setProgress(0);
    setStatus(elements.compressStatus, readableError(error, "Compression failed."), "error");
  } finally {
    elements.compressButton.disabled = !state.compress.file;
  }
}

async function getGhostscript() {
  if (!ghostscriptPromise) {
    ghostscriptPromise = createGhostscript({
      print: () => {},
      printErr: () => {},
    });
  }
  return ghostscriptPromise;
}

async function compressWithGhostscript(inputBytes, mode) {
  const gs = await getGhostscript();
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputName = `/compress-input-${stamp}.pdf`;
  const outputName = `/compress-output-${stamp}.pdf`;

  try {
    gs.FS.writeFile(inputName, new Uint8Array(inputBytes));
    setProgress(40);

    gs.callMain([
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${mode.preset}`,
      "-dNOPAUSE",
      "-dBATCH",
      "-dQUIET",
      "-dSAFER",
      "-dAutoRotatePages=/None",
      "-dCompressFonts=true",
      "-dSubsetFonts=true",
      ...mode.extra,
      `-sOutputFile=${outputName}`,
      inputName,
    ]);

    setProgress(78);
    return gs.FS.readFile(outputName);
  } finally {
    [inputName, outputName].forEach((path) => {
      try {
        gs.FS.unlink(path);
      } catch {
        /* Virtual files may not exist after a failed Ghostscript run. */
      }
    });
  }
}

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
    setStatus(elements.protectStatus, "Choose a PDF and password to begin.");
    updateProtectReady();
    return;
  }

  if (!isPdf(file)) {
    elements.protectMeta.textContent = "PDF only";
    setStatus(elements.protectStatus, "That file is not a PDF.", "error");
    updateProtectReady();
    return;
  }

  state.protect.file = file;
  elements.protectMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  setStatus(elements.protectStatus, `${file.name} is ready.`);
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
    setStatus(elements.protectStatus, "Passwords must match.", "error");
    return;
  }

  elements.protectButton.disabled = true;
  elements.protectDownload.disabled = true;
  state.protect.blob = null;
  setStatus(elements.protectStatus, "Loading encryption engine...");

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
    setStatus(elements.protectStatus, "Password protection complete.", "success");
    elements.protectDownload.disabled = false;
  } catch (error) {
    setStatus(elements.protectStatus, readableError(error, "Password protection failed."), "error");
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
    setStatus(elements.organizeStatus, "Select a PDF to show pages.");
    return;
  }

  if (!isPdf(file)) {
    elements.organizeMeta.textContent = "PDF only";
    setStatus(elements.organizeStatus, "That file is not a PDF.", "error");
    return;
  }

  state.organize.baseFile = file;
  elements.organizeMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  setStatus(elements.organizeStatus, "Rendering pages...");

  try {
    await appendPdfSource(file, true);
    setStatus(elements.organizeStatus, `${file.name} loaded.`, "success");
  } catch (error) {
    resetOrganizer();
    elements.organizeMeta.textContent = "PDF only";
    setStatus(elements.organizeStatus, readableError(error, "Could not read this PDF."), "error");
  }
}

async function addOrganizeFiles(files) {
  const pdfs = files.filter(isPdf);
  if (!pdfs.length) {
    setStatus(elements.organizeStatus, "Select PDF files to add.", "error");
    return;
  }

  elements.organizeButton.disabled = true;
  elements.organizeDownload.disabled = true;
  state.organize.blob = null;

  try {
    for (const file of pdfs) {
      setStatus(elements.organizeStatus, `Adding pages from ${file.name}...`);
      await appendPdfSource(file, false);
    }
    setStatus(elements.organizeStatus, `${pdfs.length} PDF ${pdfs.length === 1 ? "was" : "were"} added.`, "success");
  } catch (error) {
    setStatus(elements.organizeStatus, readableError(error, "Could not add PDF pages."), "error");
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
    elements.pageGrid.append(item);
    await renderThumbnail(pdf, pageIndex + 1, item.querySelector("canvas"));
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
    setStatus(elements.organizeStatus, "No pages are available to save.", "error");
    return;
  }

  elements.organizeButton.disabled = true;
  elements.organizeDownload.disabled = true;
  state.organize.blob = null;
  setStatus(elements.organizeStatus, "Building organized PDF...");

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
    setStatus(elements.organizeStatus, "Organized PDF is ready.", "success");
    elements.organizeDownload.disabled = false;
  } catch (error) {
    setStatus(elements.organizeStatus, readableError(error, "Could not build the organized PDF."), "error");
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
  setStatus(elements.organizeStatus, "Select a PDF to show pages.");
}

function readableError(error, fallback) {
  const message = error?.message || String(error || "");
  if (!message) return fallback;
  if (message.includes("encrypted")) return `${fallback} Encrypted PDFs may need to be unlocked first.`;
  if (message.includes("PasswordException")) return `${fallback} This PDF requires a password.`;
  return `${fallback} ${message}`;
}

bindDropZone(elements.compressDrop, elements.compressInput, (files) => setCompressFile(files[0]));
bindDropZone(elements.protectDrop, elements.protectInput, (files) => setProtectFile(files[0]));
bindDropZone(elements.organizeDrop, elements.organizeInput, (files) => setOrganizeBaseFile(files[0]));

elements.compressButton.addEventListener("click", compressCurrentPdf);
document.querySelectorAll('input[name="compression-level"]').forEach((input) => {
  input.addEventListener("change", () => {
    state.compress.result = null;
    elements.compressDownload.disabled = true;
    setProgress(0);
    updateCompressionEstimate();
    if (state.compress.file) {
      const mode = getSelectedCompressionMode();
      setStatus(elements.compressStatus, `${mode.label} compression selected for ${state.compress.file.name}.`);
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

window.addEventListener("hashchange", () => activateRoute(getRouteFromHash()));

elements.tabs.forEach((item) => {
  item.addEventListener("click", () => window.setTimeout(scrollToWorkspace, 0));
});

if (!window.location.hash) {
  window.location.hash = "#compress";
} else {
  activateRoute(getRouteFromHash());
}

function initTheme() {
  const savedTheme = localStorage.getItem("pdf-tool-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
  
  setTheme(initialTheme);

  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
      setTheme(currentTheme === "light" ? "dark" : "light");
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("pdf-tool-theme", theme);
  if (elements.themeIcon) {
    elements.themeIcon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-fill";
  }
}

initTheme();

