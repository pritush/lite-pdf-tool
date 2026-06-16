/**
 * compress-worker.js
 * Dedicated Web Worker that runs Ghostscript WASM off the main thread.
 *
 * Strategy:
 *   • Always compresses the PDF as a single unit to preserve shared resources
 *     (fonts, color profiles, XObjects) and avoid duplication overhead.
 *   • For PDFs ≥ 5 pages, images are pre-processed page-by-page using
 *     WebGPU/OffscreenCanvas before the Ghostscript pass.
 *   • A size guard ensures the output is never larger than the input.
 *
 * Optional acceleration:
 *   Before Ghostscript processes each page, JPEG images inside the PDF are
 *   detected and pre-downsampled via WebGPU compute shaders (or OffscreenCanvas
 *   fallback). This reduces the data Ghostscript needs to process and speeds
 *   up the overall pipeline.
 *
 * Communication with the main thread uses postMessage:
 *   → Receives  { inputBytes: ArrayBuffer, mode: {...}, totalPages: number }
 *   ← Sends     { type: "progress", percent, page?, totalPages? }
 *   ← Sends     { type: "status",   message }
 *   ← Sends     { type: "complete", outputBytes: Uint8Array }  (transferable)
 *   ← Sends     { type: "error",    message }
 */

import createGhostscript from "https://cdn.jsdelivr.net/npm/ghostscript-wasm-esm@1.0.1/gs.mjs";
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

/* ── Dynamic imports for pdf-lib internals + image processor ── */

let PDFName      = null;
let PDFNumber    = null;
let PDFRawStream = null;
let PDFRef       = null;
let pdfLibReady  = false;

async function loadPdfLibTypes() {
  if (pdfLibReady) return;
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm");
    PDFName      = mod.PDFName;
    PDFNumber    = mod.PDFNumber;
    PDFRawStream = mod.PDFRawStream;
    PDFRef       = mod.PDFRef;
    pdfLibReady  = !!(PDFName && PDFRawStream);
  } catch {
    pdfLibReady = false;
  }
}

/* ── Constants ── */

const IMAGE_PREPROCESS_MIN_KB = 512;  // only pre-process pages > 512 KB

/* ── Singletons ── */

let gsInstance    = null;
let imgProcessor  = null;

/* ── Helpers ── */

function post(type, data = {}) {
  self.postMessage({ type, ...data });
}

async function ensureGhostscript() {
  if (!gsInstance) {
    /* SharedArrayBuffer is required by Ghostscript WASM for multi-threading.
       It's only available in cross-origin isolated contexts (COOP + COEP headers). */
    if (typeof SharedArrayBuffer === "undefined") {
      throw new Error(
        "SharedArrayBuffer is not available. " +
        "This usually means the page is missing Cross-Origin-Opener-Policy and " +
        "Cross-Origin-Embedder-Policy headers. Compression cannot run without them."
      );
    }

    /* Guard against silent hangs — abort if init takes > 30 seconds */
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(
        "Ghostscript WASM failed to initialize within 30 seconds. " +
        "Please reload the page and try again."
      )), 30_000)
    );

    gsInstance = await Promise.race([
      createGhostscript({ print() {}, printErr() {} }),
      timeout,
    ]);
  }
  return gsInstance;
}

async function ensureImageProcessor(mode) {
  if (imgProcessor) return imgProcessor;
  try {
    const { createImageProcessor } = await import("./image-processor.js");
    imgProcessor = await createImageProcessor(mode);
  } catch {
    imgProcessor = null;
  }
  return imgProcessor;
}

/* ── Ghostscript runner ── */

/**
 * Run Ghostscript on raw PDF bytes and return the output.
 * Handles virtual-file creation/cleanup automatically.
 */
function runGhostscript(inputBytes, args) {
  const stamp   = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inFile  = `/in-${stamp}.pdf`;
  const outFile = `/out-${stamp}.pdf`;

  try {
    gsInstance.FS.writeFile(inFile, new Uint8Array(
      inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes),
    ));
    gsInstance.callMain([...args, `-sOutputFile=${outFile}`, inFile]);
    /* Copy result out of WASM memory before unlinking */
    const raw = gsInstance.FS.readFile(outFile);
    return new Uint8Array(raw);
  } finally {
    try { gsInstance.FS.unlink(inFile);  } catch { /* ok */ }
    try { gsInstance.FS.unlink(outFile); } catch { /* ok */ }
  }
}

/** Build the Ghostscript CLI arg list for a given compression mode. */
function getGsArgs(mode) {
  const args = [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    `-dPDFSETTINGS=${mode.preset}`,
    "-dNOPAUSE", "-dBATCH", "-dQUIET", "-dSAFER",
    "-dAutoRotatePages=/None",
    "-dCompressFonts=true",
    "-dSubsetFonts=true",
    "-dDetectDuplicateImages=true",
    ...mode.extra,
  ];

  /* For low compression, pass through already-compressed JPEGs to avoid
     re-encoding them at a similar quality (which inflates file size). */
  if (mode.preset === "/printer") {
    args.push("-dPassThroughJPEGImages=true");
  }

  return args;
}

/* ── Image pre-processing ── */

/**
 * Walk a single-page PDF's Resources/XObject entries, find JPEG images,
 * and recompress them using the GPU/OffscreenCanvas image processor.
 * Returns the (potentially smaller) page bytes.
 */
async function preprocessPageImages(pageBytes, mode) {
  if (!imgProcessor || !pdfLibReady) return pageBytes;
  if (pageBytes.byteLength < IMAGE_PREPROCESS_MIN_KB * 1024) return pageBytes;

  const { getLevelFromMode, QUALITY_PRESETS } = await import("./image-processor.js");
  const settings = QUALITY_PRESETS[getLevelFromMode(mode)];

  try {
    const doc  = await PDFDocument.load(pageBytes, { ignoreEncryption: true });
    const page = doc.getPages()[0];
    if (!page) return pageBytes;

    const resources = page.node.lookup(PDFName.of("Resources"));
    if (!resources || typeof resources.lookup !== "function") return pageBytes;

    const xObjects = resources.lookup(PDFName.of("XObject"));
    if (!xObjects || typeof xObjects.entries !== "function") return pageBytes;

    let modified = false;

    for (const [, rawRef] of xObjects.entries()) {
      let obj = rawRef;
      if (PDFRef && rawRef instanceof PDFRef) {
        obj = doc.context.lookup(rawRef);
      }

      if (!(obj instanceof PDFRawStream)) continue;

      /* Must be an Image XObject with DCTDecode (JPEG) filter */
      const subtype = obj.dict.lookup(PDFName.of("Subtype"));
      if (!subtype || subtype !== PDFName.of("Image")) continue;

      const filter = obj.dict.lookup(PDFName.of("Filter"));
      if (!filter || filter !== PDFName.of("DCTDecode")) continue;

      /* Skip complex cases: alpha masks, CMYK colour space */
      if (obj.dict.has(PDFName.of("SMask")) || obj.dict.has(PDFName.of("Mask"))) continue;
      const cs = obj.dict.lookup(PDFName.of("ColorSpace"));
      if (cs && cs === PDFName.of("DeviceCMYK")) continue;

      const jpegBytes = obj.contents;
      if (!jpegBytes || jpegBytes.length < 2048) continue; // skip tiny images

      const result = await imgProcessor.resizeAndRecompress(
        jpegBytes, settings.maxDim, settings.quality,
      );

      if (result) {
        obj.contents = result.bytes;
        obj.dict.set(PDFName.of("Width"),  PDFNumber.of(result.width));
        obj.dict.set(PDFName.of("Height"), PDFNumber.of(result.height));
        modified = true;
      }
    }

    if (modified) {
      return await doc.save();
    }
  } catch {
    /* Image pre-processing failed — return original bytes unmodified */
  }

  return pageBytes;
}

/* ── Compression strategy ── */

/**
 * For large PDFs (≥ 5 pages), pre-process images page-by-page with the
 * GPU/canvas pipeline, then compress the *whole* PDF in one Ghostscript run.
 * This avoids the font/resource duplication that per-page-split caused.
 */
async function preprocessLargePdf(inputBytes, mode, totalPages) {
  post("status", { message: "Pre-processing images..." });

  const pdfDoc = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
  let anyModified = false;

  for (let i = 0; i < totalPages; i++) {
    /* Extract single page for image pre-processing only */
    const singleDoc = await PDFDocument.create();
    const [copied]  = await singleDoc.copyPages(pdfDoc, [i]);
    singleDoc.addPage(copied);
    const pageBytes = await singleDoc.save();

    post("status", { message: `Pre-processing page ${i + 1} of ${totalPages}...` });
    const processed = await preprocessPageImages(pageBytes, mode);

    if (processed !== pageBytes) {
      /* Replace the page in the main document with the pre-processed version */
      try {
        const processedDoc = await PDFDocument.load(processed, { ignoreEncryption: true });
        const [newPage] = await pdfDoc.copyPages(processedDoc, [0]);
        /* Remove old page and insert new one at the same position */
        pdfDoc.removePage(i);
        pdfDoc.insertPage(i, newPage);
        anyModified = true;
      } catch {
        /* If re-insertion fails, keep the original page */
      }
    }

    const pct = 10 + Math.round(((i + 1) / totalPages) * 40);
    post("progress", { percent: pct, page: i + 1, totalPages });
  }

  if (anyModified) {
    return await pdfDoc.save();
  }
  return inputBytes;
}

async function compressDocument(inputBytes, mode, totalPages) {
  let bytesToCompress = inputBytes;

  /* For large PDFs, pre-process images first (GPU/canvas acceleration) */
  if (totalPages >= 5 && imgProcessor) {
    bytesToCompress = await preprocessLargePdf(inputBytes, mode, totalPages);
  }

  post("status", { message: "Compressing PDF..." });
  post("progress", { percent: totalPages >= 5 ? 55 : 30 });

  const gsOutput = runGhostscript(bytesToCompress, getGsArgs(mode));

  post("progress", { percent: 90 });

  /* ── Size guard: never return a file bigger than the input ── */
  const inputSize = inputBytes instanceof Uint8Array
    ? inputBytes.byteLength
    : inputBytes.byteLength ?? new Uint8Array(inputBytes).byteLength;

  if (gsOutput.byteLength >= inputSize) {
    post("status", { message: "Compression would increase file size — returning original." });
    /* Return the original bytes unchanged */
    return new Uint8Array(
      inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes),
    );
  }

  return gsOutput;
}

/* ── Main message handler ── */

self.onmessage = async (e) => {
  const { inputBytes, mode, totalPages } = e.data;

  try {
    /* ① Load engines */
    post("status", { message: "Loading compression engine..." });
    post("progress", { percent: 3 });

    await ensureGhostscript();
    post("progress", { percent: 6 });

    await loadPdfLibTypes();

    const proc = await ensureImageProcessor(mode);
    const accel = proc?.useWebGPU ? "WebGPU" : "OffscreenCanvas";
    post("status", {
      message: proc
        ? `Engine ready — ${accel} acceleration active`
        : "Engine ready",
    });
    post("progress", { percent: 8 });

    /* ② Compress (always as whole document to preserve shared resources) */
    const outputBytes = await compressDocument(inputBytes, mode, totalPages);

    /* ③ Transfer result (zero-copy) */
    post("progress", { percent: 100 });
    const buf = outputBytes.buffer.slice(
      outputBytes.byteOffset,
      outputBytes.byteOffset + outputBytes.byteLength,
    );
    self.postMessage({ type: "complete", outputBytes: new Uint8Array(buf) }, [buf]);
  } catch (err) {
    post("error", { message: err?.message || "Compression failed." });
  }
};
