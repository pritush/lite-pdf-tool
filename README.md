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





## 🚀 Getting Started & Local Development

No compilation or build step is required! You can open the project in any web server.

