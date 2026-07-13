/**
 * config.js
 * Centralized configuration for PDF Tool
 */

export const CONFIG = {
  // Application
  APP_NAME: "PDF Tool",
  APP_VERSION: "2.0.0",
  
  // Routes
  ROUTES: ["compress", "organize", "protect"],
  DEFAULT_ROUTE: "compress",
  
  // Compression modes
  COMPRESSION_MODES: {
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
  },
  
  // CDN URLs
  CDN: {
    QPDF: "https://cdn.jsdelivr.net/npm/qpdf-wasm-esm-embedded@1.1.1/qpdf.mjs",
    PDFJS: "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.mjs",
    PDFJS_WORKER: "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.mjs",
    PDF_LIB: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm",
    SORTABLE: "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/+esm",
  },
  
  // Performance
  THUMBNAIL_WIDTH: 120,
  THUMBNAIL_HEIGHT: 160,
  THUMBNAIL_BATCH_SIZE: 4,
  
  // Storage
  STORAGE_KEY_THEME: "pdf-tool-theme",
  
  // Feature detection
  REQUIRED_FEATURES: {
    serviceWorker: true,
    wasm: true,
    webWorker: true,
    createImageBitmap: true,
    offscreenCanvas: true,
  },
  
  OPTIONAL_FEATURES: {
    webgpu: false,
    sharedArrayBuffer: false,
  },
};

export default CONFIG;
