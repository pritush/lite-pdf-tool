/**
 * image-processor.js
 * GPU-accelerated image pre-processing for PDF compression.
 * Uses WebGPU compute shaders for fast bilinear-interpolated image resizing
 * when available, falling back to OffscreenCanvas for universal support.
 *
 * Runs inside the compress Web Worker — never on the main thread.
 */

/* ── Quality presets per compression level ── */

export const QUALITY_PRESETS = {
  low:     { quality: 0.85, maxDim: 4096 },
  medium:  { quality: 0.72, maxDim: 2048 },
  high:    { quality: 0.55, maxDim: 1200 },
  extreme: { quality: 0.40, maxDim: 800 },
};

/* ── WGSL bilinear resize compute shader ── */

const RESIZE_WGSL = /* wgsl */`
@group(0) @binding(0) var<storage, read>       src : array<u32>;
@group(0) @binding(1) var<storage, read_write> dst : array<u32>;
@group(0) @binding(2) var<uniform>             dim : vec4<u32>;   // srcW srcH dstW dstH

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let dstW = dim.z;
  let dstH = dim.w;
  if (gid.x >= dstW || gid.y >= dstH) { return; }

  let srcW = dim.x;
  let srcH = dim.y;
  let sx   = f32(gid.x) * f32(srcW) / f32(dstW);
  let sy   = f32(gid.y) * f32(srcH) / f32(dstH);

  let x0 = u32(floor(sx));
  let y0 = u32(floor(sy));
  let x1 = min(x0 + 1u, srcW - 1u);
  let y1 = min(y0 + 1u, srcH - 1u);

  let fx = sx - f32(x0);
  let fy = sy - f32(y0);

  let p00 = unpack4x8unorm(src[y0 * srcW + x0]);
  let p10 = unpack4x8unorm(src[y0 * srcW + x1]);
  let p01 = unpack4x8unorm(src[y1 * srcW + x0]);
  let p11 = unpack4x8unorm(src[y1 * srcW + x1]);

  let top = mix(p00, p10, fx);
  let bot = mix(p01, p11, fx);

  dst[gid.y * dstW + gid.x] = pack4x8unorm(mix(top, bot, fy));
}
`;

/* ── GPU Resizer ── */

class GPUResizer {
  /** @param {GPUDevice} device */
  constructor(device) {
    this.device = device;
    this.pipeline = null;
  }

  async init() {
    const mod = this.device.createShaderModule({ code: RESIZE_WGSL });
    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: mod, entryPoint: "main" },
    });
    return this;
  }

  /**
   * Resize RGBA pixel data on the GPU.
   * @param {Uint8Array} srcPixels  RGBA bytes (srcW*srcH*4)
   * @param {number} srcW
   * @param {number} srcH
   * @param {number} dstW
   * @param {number} dstH
   * @returns {Promise<Uint8Array>}  Resized RGBA bytes
   */
  async resize(srcPixels, srcW, srcH, dstW, dstH) {
    const dev = this.device;
    const srcSize = srcW * srcH * 4;
    const dstSize = dstW * dstH * 4;

    /* Source pixels → GPU storage */
    const srcBuf = dev.createBuffer({ size: srcSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(srcBuf, 0, srcPixels);

    /* Destination storage */
    const dstBuf = dev.createBuffer({ size: dstSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });

    /* Dimension uniform */
    const dimData = new Uint32Array([srcW, srcH, dstW, dstH]);
    const dimBuf  = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(dimBuf, 0, dimData);

    /* Read-back buffer */
    const readBuf = dev.createBuffer({ size: dstSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    /* Bind + dispatch */
    const bg = dev.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: srcBuf  } },
        { binding: 1, resource: { buffer: dstBuf  } },
        { binding: 2, resource: { buffer: dimBuf  } },
      ],
    });

    const enc  = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(dstW / 16), Math.ceil(dstH / 16));
    pass.end();
    enc.copyBufferToBuffer(dstBuf, 0, readBuf, 0, dstSize);
    dev.queue.submit([enc.finish()]);

    /* Read result */
    await readBuf.mapAsync(GPUMapMode.READ);
    const out = new Uint8Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();

    /* Clean up GPU resources */
    srcBuf.destroy();
    dstBuf.destroy();
    dimBuf.destroy();
    readBuf.destroy();

    return out;
  }
}

/* ── Image Processor ── */

export class ImageProcessor {
  /** @param {boolean} useWebGPU  @param {GPUResizer|null} gpuResizer */
  constructor(useWebGPU, gpuResizer) {
    this.useWebGPU  = useWebGPU;
    this.gpuResizer = gpuResizer;
  }

  /**
   * Resize and re-encode a JPEG image at the given constraints.
   * Returns `{ bytes, width, height }` if smaller than the original, else `null`.
   *
   * @param {Uint8Array} jpegBytes  Raw JPEG file bytes
   * @param {number}     maxDim     Maximum width or height
   * @param {number}     quality    JPEG quality 0-1
   * @returns {Promise<{bytes:Uint8Array, width:number, height:number}|null>}
   */
  async resizeAndRecompress(jpegBytes, maxDim, quality) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([jpegBytes], { type: "image/jpeg" }));
    } catch {
      return null; // undecodable
    }

    try {
      const { width, height } = bitmap;
      const needsResize = width > maxDim || height > maxDim;

      /* Skip if image is small and quality is high (would produce a similar or bigger file) */
      if (!needsResize && quality >= 0.80) return null;

      let tw = width, th = height;
      if (needsResize) {
        const s = maxDim / Math.max(width, height);
        tw = Math.round(width  * s);
        th = Math.round(height * s);
      }

      let blob = null;

      /* ① WebGPU accelerated resize (beneficial for large images) */
      if (this.useWebGPU && needsResize && this.gpuResizer) {
        try {
          blob = await this._gpuResize(bitmap, width, height, tw, th, quality);
        } catch {
          blob = null; // fall through
        }
      }

      /* ② OffscreenCanvas fallback (always available in workers) */
      if (!blob) {
        blob = await this._canvasResize(bitmap, tw, th, quality);
      }

      const resultBytes = new Uint8Array(await blob.arrayBuffer());

      /* Only use the recompressed version if it's meaningfully smaller */
      if (resultBytes.byteLength >= jpegBytes.byteLength * 0.92) return null;

      return { bytes: resultBytes, width: tw, height: th };
    } finally {
      bitmap.close();
    }
  }

  /* ── private ───────────────────────────────────────────── */

  async _gpuResize(bitmap, srcW, srcH, dstW, dstH, quality) {
    /* Draw bitmap → OffscreenCanvas to read raw RGBA pixels */
    const srcCanvas = new OffscreenCanvas(srcW, srcH);
    const ctx = srcCanvas.getContext("2d", { alpha: false });
    ctx.drawImage(bitmap, 0, 0);
    const srcData = ctx.getImageData(0, 0, srcW, srcH);

    /* GPU resize */
    const resized = await this.gpuResizer.resize(
      new Uint8Array(srcData.data.buffer), srcW, srcH, dstW, dstH,
    );

    /* Encode as JPEG via OffscreenCanvas (GPU can't do JPEG encoding) */
    const dstCanvas = new OffscreenCanvas(dstW, dstH);
    const dCtx = dstCanvas.getContext("2d", { alpha: false });
    dCtx.putImageData(
      new ImageData(new Uint8ClampedArray(resized.buffer), dstW, dstH), 0, 0,
    );
    return dstCanvas.convertToBlob({ type: "image/jpeg", quality });
  }

  async _canvasResize(bitmap, dstW, dstH, quality) {
    const canvas = new OffscreenCanvas(dstW, dstH);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
}

/* ── Factory helpers ── */

/**
 * Determine the quality-level name from a compression mode object.
 * @param {{ preset: string, extra: string[] }} mode
 * @returns {"low"|"medium"|"high"|"extreme"}
 */
export function getLevelFromMode(mode) {
  if (mode.preset === "/printer") return "low";
  if (mode.preset === "/ebook")   return "medium";
  if (mode.preset === "/screen") {
    /* extreme uses ColorImageResolution=72 */
    return mode.extra.some((e) => e.includes("72")) ? "extreme" : "high";
  }
  return "medium";
}

/**
 * Create and initialise an ImageProcessor.
 * Automatically probes for WebGPU support and falls back to OffscreenCanvas.
 * @returns {Promise<ImageProcessor>}
 */
export async function createImageProcessor() {
  let useWebGPU  = false;
  let gpuResizer = null;

  /* Attempt WebGPU (available in workers since Chrome 113, Safari 18) */
  if (typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        gpuResizer = await new GPUResizer(device).init();
        useWebGPU = true;
      }
    } catch {
      /* WebGPU unavailable – OffscreenCanvas will be used instead */
    }
  }

  return new ImageProcessor(useWebGPU, gpuResizer);
}
