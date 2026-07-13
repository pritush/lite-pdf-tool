# Quick Start Guide

Get the PDF Tool running locally in under 5 minutes!

## 🚀 Option 1: XAMPP (Windows)

1. **Copy files to XAMPP:**
   ```cmd
   xcopy d:\xampp\htdocs\lite-pdf-tool d:\xampp\htdocs\pdf-tool /E /I
   ```

2. **Start Apache** in XAMPP Control Panel

3. **Open browser:**
   ```
   http://localhost/pdf-tool
   ```

✅ Done! The `.htaccess` file handles all server configuration.

---

## 🚀 Option 2: Python (Any OS)

1. **Navigate to folder:**
   ```bash
   cd d:\xampp\htdocs\lite-pdf-tool
   ```

2. **Start server:**
   ```bash
   python -m http.server 8080
   ```

3. **Open browser:**
   ```
   http://localhost:8080
   ```

⚠️ **Note:** Python's simple HTTP server doesn't support `.htaccess`. The Service Worker will inject required headers, but you may need to reload the page once.

---

## 🚀 Option 3: Node.js (Any OS)

1. **Navigate to folder:**
   ```bash
   cd d:\xampp\htdocs\lite-pdf-tool
   ```

2. **Start server:**
   ```bash
   npx serve . -p 8080
   ```

3. **Open browser:**
   ```
   http://localhost:8080
   ```

✅ Done! The `serve` package handles CORS properly.

---

## 🚀 Option 4: VS Code Live Server

1. **Install** [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)

2. **Open folder** in VS Code

3. **Right-click** `index.html` → "Open with Live Server"

4. **Browser opens automatically**

⚠️ **Note:** Live Server may not support `.htaccess`. Service Worker will handle headers.

---

## ✅ Verify Installation

After starting the server, check the browser console:

### Expected Output (Success):
```
✅ Cross-origin isolated: SharedArrayBuffer is available
[Service Worker] Installing...
[Service Worker] Activating...
[App] Feature detection: {serviceWorker: true, wasm: true, ...}
```

### Troubleshooting:
If you see:
```
⚠️ Not cross-origin isolated yet
```

**Solution:** Reload the page once. The Service Worker needs to activate first.

---

## 🧪 Test Compression

1. Go to the **Compress** tab (default)
2. Click "Select PDF" or drag-and-drop a PDF
3. Choose compression level (Medium recommended)
4. Click "Compress PDF"

### Expected Result:
- Progress bar shows loading
- Status shows "Compression complete"
- Download button activates
- Metrics show file size reduction

### If Compression Fails:
- Check browser console for errors
- Ensure Service Worker is active (reload page)
- Try a different PDF file
- Check browser compatibility (Chrome 92+, Firefox 95+, Safari 15.2+)

---

## 📁 Test Other Features

### Organize PDF
1. Go to **Organize** tab
2. Select a PDF file
3. Drag pages to reorder
4. Click save icon to download

### Protect PDF
1. Go to **Protect** tab
2. Select a PDF file
3. Enter password (twice)
4. Click "Protect PDF"
5. Download encrypted file

---

## 🔧 Development Mode

### Enable Console Logs
Open browser DevTools (F12) to see:
- Service Worker operations
- Feature detection
- Cache status
- API calls

### Hot Reload
For development, use a server with auto-reload:
```bash
npx browser-sync start --server --files "**/*"
```

---

## 🚢 Deploy to Production

### Netlify (Easiest)
```bash
npm install -g netlify-cli
netlify deploy --prod
```

### Vercel
```bash
npm install -g vercel
vercel --prod
```

### Manual Deploy
1. Copy all files to your server
2. Ensure `.htaccess` (Apache) or equivalent config is in place
3. Visit your domain
4. Done!

See [DEPLOYMENT.md](DEPLOYMENT.md) for platform-specific instructions.

---

## 🐛 Common Issues

### Issue: "Service Workers not supported"
**Solution:** Use HTTPS or localhost. Service Workers require secure context.

### Issue: "Compression fails with SharedArrayBuffer error"
**Solution:**
1. Reload the page (Service Worker needs to activate)
2. Check COOP/COEP headers are present
3. Ensure browser supports SharedArrayBuffer (Chrome 92+, Firefox 95+)

### Issue: "Page not loading"
**Solution:**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard reload (Ctrl+F5)
- Check server is running
- Check browser console for errors

### Issue: "PDF rendering is slow"
**Solution:**
- Large PDFs take time to render thumbnails
- This is normal and expected
- Progress is shown in status messages

---

## 📚 Next Steps

1. ✅ **Test all features** (Compress, Organize, Protect)
2. 📖 **Read** [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
3. 🎨 **Customize** colors in `assets/css/styles.css`
4. 🔧 **Extend** functionality in `assets/js/modules/`

---

## 🆘 Need Help?

- 📋 Check [README.md](README.md) for detailed documentation
- 🚀 Review [DEPLOYMENT.md](DEPLOYMENT.md) for deployment
- 🐛 Check browser console for error messages
- 💬 Search existing GitHub issues

---

## 🎉 You're Ready!

The PDF Tool is now running locally. Try compressing a PDF to verify everything works!

**Happy coding! 🚀**
