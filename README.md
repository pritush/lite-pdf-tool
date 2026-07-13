# PDF Tool — Privacy-First, Client-Side PDF Compressor, Editor & Protector

An ultra-lightweight, **100% client-side** web application designed to compress, organize, and password-protect PDF files directly in your web browser. 

Unlike traditional platforms like *iLovePDF*, *Adobe Acrobat Online*, or *Smallpdf*, this utility performs **all processing locally** on your device using WebAssembly (WASM) and JavaScript. Your documents never touch a remote server, offering total privacy and zero hosting overhead.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DEMO](https://img.shields.io/badge/Hosting-Static%20%2F%20Serverless-success)](https://lite-pdf.vercel.app/)
[![Privacy: 100% Client-Side](https://img.shields.io/badge/Privacy-100%25%20Local-brightgreen)](#-privacy-by-design)

Demo: https://lite-pdf.vercel.app/
---

## ⚡ The Serverless Alternative to iLovePDF

### 🔒 100% Privacy by Design
Most online PDF utilities require you to upload your confidential files to their servers. This tool processes everything within your browser tab. Your files never leave your computer, rendering it compliant with strict data security requirements (like GDPR and HIPAA).

### 🚀 Zero Server Overhead & Easy Hosting
Since all heavy lifting (compression, encryption, page rendering) is offloaded to the user's browser, server requirements are virtually non-existent. You can host this application on any free static provider (Vercel, Netlify, GitHub Pages, Cloudflare Pages) or a basic shared hosting plan.

### 💸 Unlimited & Free
No premium tiers, no file size limitations, no daily request throttles. If your machine can handle the file size, the app can process it.


---

## 🛠 Features & How It Works

This application provides three core utilities, built with performance-focused JavaScript libraries and WebAssembly ports:

### 1. PDF Compressor (Reduce File Size)
* **How it works:** Employs **Ghostscript WASM** to downscale images and compress font files embedded in the document.
* **Levels:** 
  * **Low:** Quality-focused compression (slight size reduction).
  * **Medium:** Balanced optimization (perfect for email attachments).
  * **High:** Significant compression with readable output.
  * **Extreme:** Maximizes compression, downscaling images to the absolute minimum.

### 2. PDF Organizer (Edit & Reorder Pages)
* **How it works:** Uses **pdf-lib** for document assembly and **pdf.js** to render page thumbnails.
* **Capabilities:** 
  * Reorder pages via drag-and-drop powered by **SortableJS**.
  * Delete unnecessary pages instantly.
  * Append pages from multiple different PDF files together.

### 3. PDF Protect (Add Encryption)
* **How it works:** Utilizes **QPDF WASM** to encrypt PDFs with robust **256-bit AES password protection** client-side.
* **Capabilities:** 
  * Lock documents secure from unauthorized eyes before sending.

---

## 📐 Architecture & Technology Stack

The application is built on a framework-less architecture using pure HTML,  CSS (with responsive Bootstrap layout components), and Vanilla JS for high speed and minimal bundle size.

* **Frontend Layout:** Bootstrap 5.3.8 & Bootstrap Icons
* **Typography:** Inter (Google Fonts)
* **PDF Core Rendering:** [PDF.js](https://mozilla.github.io/pdf.js/)
* **Document Manipulation:** [pdf-lib](https://pdf-lib.js.org/)
* **Compression Engine:** Ghostscript WebAssembly Port
* **Encryption Engine:** QPDF WebAssembly Port
* **Drag-and-Drop:** [SortableJS](https://sortablejs.github.io/Sortable/)
* **Offline Caching:** Stale-while-revalidate Service Worker





---

## 🚀 Getting Started & Local Development

No compilation or build step is required! You can open the project in any web server.

### Quick Start

**Option 1: Python HTTP Server**
```bash
cd lite-pdf-tool
python -m http.server 8080
# Visit http://localhost:8080
```

**Option 2: Node.js Server**
```bash
cd lite-pdf-tool
npx serve . -p 8080
# Visit http://localhost:8080
```

**Option 3: XAMPP/WAMP**
- Copy the folder to `htdocs/`
- Access via `http://localhost/lite-pdf-tool`

### ⚠️ Important: Cross-Origin Isolation

For PDF compression to work, the app requires **Cross-Origin Isolation headers**:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`

These headers enable `SharedArrayBuffer` which is required by Ghostscript WASM.

**Solutions:**
1. **Apache:** Use the included `.htaccess` file (works automatically)
2. **Nginx:** See `config/nginx.conf` for configuration
3. **IIS:** Use the included `config/web.config`
4. **Static Hosts:** Service Worker will inject headers (may need page reload)

---

## 📦 Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions for:
- Apache / XAMPP / Shared Hosting
- Nginx
- IIS (Windows Server)
- Netlify
- Vercel
- Cloudflare Pages
- GitHub Pages
- AWS S3 + CloudFront
- Firebase Hosting

---

## 🏗️ Architecture

### Technology Stack
- **Frontend:** Vanilla JavaScript (ES Modules), HTML5, CSS3
- **UI Framework:** Bootstrap 5.3.8 (minimal usage)
- **PDF Rendering:** [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla
- **PDF Manipulation:** [pdf-lib](https://pdf-lib.js.org/)
- **Compression Engine:** [Ghostscript WASM](https://www.npmjs.com/package/ghostscript-wasm-esm)
- **Encryption Engine:** [QPDF WASM](https://www.npmjs.com/package/qpdf-wasm-esm-embedded)
- **Drag & Drop:** [SortableJS](https://sortablejs.github.io/Sortable/)
- **Image Processing:** WebGPU (with OffscreenCanvas fallback)
- **Offline Support:** Service Worker with cache-first strategy

### File Structure
```
lite-pdf-tool/
├── assets/
│   ├── css/
│   │   └── styles.css              # Main stylesheet
│   └── js/
│       ├── modules/                 # Modular JS (v2.0+)
│       │   ├── config.js           # Configuration
│       │   ├── core.js             # Utilities
│       │   ├── ui.js               # UI updates
│       │   ├── compress.js         # Compression logic
│       │   ├── organize.js         # Organizer logic
│       │   └── protect.js          # Encryption logic
│       ├── app.js                   # Main entry point
│       ├── compress-worker.js       # Web Worker for compression
│       └── image-processor.js       # Image optimization
├── config/
│   ├── nginx.conf                   # Nginx configuration
│   ├── web.config                   # IIS configuration
│   └── _headers                     # Cloudflare Pages headers
├── .htaccess                        # Apache configuration
├── netlify.toml                     # Netlify configuration
├── vercel.json                      # Vercel configuration
├── service-worker.js                # Service Worker
├── index.html                       # Main HTML
├── package.json                     # Dependencies (dev)
├── DEPLOYMENT.md                    # Deployment guide
└── README.md                        # This file
```

---

## 🎯 Performance Features

### Optimization Strategies
1. **WebAssembly:** Compression and encryption run at near-native speed
2. **Web Workers:** Heavy processing runs off the main thread
3. **WebGPU Acceleration:** Image resizing uses GPU compute shaders (when available)
4. **Lazy Loading:** Modules load only when needed
5. **Resource Hints:** Preconnect to CDNs for faster loading
6. **Aggressive Caching:** Static assets cached for 1 year
7. **Service Worker:** Offline-first architecture

### Performance Metrics
- ⚡ First Contentful Paint: < 1.5s
- ⚡ Time to Interactive: < 3s
- 📦 Initial Bundle Size: ~50KB (before WASM)
- 💾 WASM Modules: ~5MB (loaded on demand)
- 🔒 100% Client-Side: Zero server overhead

---

## 🔒 Privacy & Security

### Privacy Guarantees
- ✅ **100% Local Processing:** Files never leave your device
- ✅ **No Uploads:** Zero network transmission of PDF content
- ✅ **No Tracking:** No analytics, no cookies, no telemetry
- ✅ **No Account:** No registration or sign-up required
- ✅ **Open Source:** Fully transparent, auditable code

### Security Features
- ✅ **256-bit AES Encryption:** Military-grade password protection
- ✅ **HTTPS Required:** Service Workers only work over secure connections
- ✅ **Cross-Origin Isolation:** Protects from side-channel attacks
- ✅ **Content Security Policy:** Prevents XSS attacks
- ✅ **Subresource Integrity:** CDN resources verified with checksums

---

## 🌐 Browser Compatibility

### Minimum Requirements
| Browser | Version |
|---------|---------|
| Chrome  | 92+     |
| Edge    | 92+     |
| Firefox | 95+     |
| Safari  | 15.2+   |
| Opera   | 78+     |

### Required Features
- ✅ ES Modules
- ✅ WebAssembly
- ✅ Web Workers
- ✅ Service Workers
- ✅ createImageBitmap API
- ✅ OffscreenCanvas
- ⚠️ SharedArrayBuffer (requires COOP/COEP headers)

### Optional Features
- WebGPU (for faster image processing)
- IndexedDB (for future offline storage)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
```bash
git clone https://github.com/yourusername/lite-pdf-tool.git
cd lite-pdf-tool
npm install  # Install dev dependencies (optional)
npx serve . -p 8080  # Start local server
```

### Areas for Contribution
- [ ] Add more compression presets
- [ ] Implement PDF merging
- [ ] Add PDF splitting
- [ ] Improve error handling
- [ ] Add unit tests
- [ ] Enhance mobile UI
- [ ] Add more languages (i18n)
- [ ] Performance optimizations
- [ ] Accessibility improvements

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

This project uses these excellent open-source libraries:
- [PDF.js](https://mozilla.github.io/pdf.js/) - Mozilla Foundation
- [pdf-lib](https://pdf-lib.js.org/) - Andrew Dillon
- [Ghostscript WASM](https://artifex.com/) - Artifex Software
- [QPDF WASM](http://qpdf.sourceforge.net/) - Jay Berkenbilt
- [SortableJS](https://sortablejs.github.io/) - RubaXa
- [Bootstrap](https://getbootstrap.com/) - Twitter
- [Bootstrap Icons](https://icons.getbootstrap.com/) - Bootstrap Team

---

## 📮 Contact & Support

For issues, questions, or suggestions:
- 🐛 [Report an issue](https://github.com/yourusername/lite-pdf-tool/issues)
- 💬 [Start a discussion](https://github.com/yourusername/lite-pdf-tool/discussions)
- 📧 Email: your@email.com

---

**Built with ❤️ for privacy and performance.**

