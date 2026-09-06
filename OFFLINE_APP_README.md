# GreenMind - Offline PWA Application

GreenMind is now available as a **Progressive Web App (PWA)** that can be installed and used offline on your device.

## 📦 Download & Installation

### Option 1: Direct Download (Recommended)

1. **Download the built application** from the `dist/` folder
2. The entire application is contained in these files:
   - `index.html` - Main application (674 KB, self-contained)
   - `manifest.webmanifest` - PWA manifest for installation
   - `sw.js` - Service worker for offline functionality
   - `workbox-835c8c05.js` - Workbox library for caching
   - `registerSW.js` - Service worker registration
   - `pwa-192x192.png` & `pwa-512x512.png` - App icons
   - `images/` - Application images

### Option 2: Build from Source

```bash
# Install dependencies
npm install

# Build the application
npm run build

# The built files will be in the dist/ folder
```

## 🚀 How to Install

### On Desktop (Chrome/Edge/Firefox)

1. **Open the application** in your browser
   - You can open `dist/index.html` directly, or
   - Serve the `dist/` folder using a local server:
     ```bash
     # Using Python
     cd dist && python3 -m http.server 8080
     
     # Using Node.js
     npx serve dist
     ```

2. **Install the PWA**:
   - **Chrome/Edge**: Look for the install icon (⊕) in the address bar
   - **Firefox**: Click the install button in the address bar
   - Or use the browser menu → "Install GreenMind"

3. **Launch from your desktop** - The app will appear in your applications list

### On Mobile (Android/iOS)

#### Android (Chrome)
1. Open the application in Chrome
2. Tap the menu (⋮) → "Install app" or "Add to Home screen"
3. Confirm installation
4. Access from your home screen like a native app

#### iOS (Safari)
1. Open the application in Safari
2. Tap the Share button (📤)
3. Scroll down and tap "Add to Home Screen"
4. Name it "GreenMind" and tap "Add"
5. Access from your home screen

## ✨ Features

### Offline Capabilities
- ✅ **Full offline functionality** after first load
- ✅ **Cached assets** - All JavaScript, CSS, and images stored locally
- ✅ **Offline-first architecture** - Works without internet connection
- ✅ **Auto-update** - App updates automatically when online

### What Works Offline
- ✅ Complete UI and navigation
- ✅ Device connection (USB serial communication)
- ✅ Sensor data visualization
- ✅ Local data storage
- ✅ Chat interface
- ✅ Historical data viewing

### What Requires Internet
- ✅ **Terminal Dynamic Threshold demo** - No internet required; runs with bundled local reasoning.
- ✅ **AI-style threshold responses** - The app now has an offline deterministic Dynamic Threshold fallback. Optional local LLM frameworks such as Ollama can be used on `localhost`, but cloud APIs are not required for the research demo.
- ⚠️ **External images / Google Fonts in the marketing UI** - Cached after first load; the terminal review demo avoids these dependencies.

## 📁 File Structure

```
dist/
├── index.html              # Main application (self-contained)
├── manifest.webmanifest    # PWA configuration
├── sw.js                   # Service worker
├── workbox-835c8c05.js    # Caching library
├── registerSW.js          # SW registration helper
├── pwa-192x192.png        # App icon (192x192)
├── pwa-512x512.png        # App icon (512x512)
└── images/                # Application images
    ├── card-sensing.jpg
    ├── card-insights.jpg
    ├── card-predictive.jpg
    ├── card-companion.jpg
    ├── hero-*.jpg
    └── section-wide.jpg
```

## 🔧 Advanced Usage

### Serving the Application Locally

For the best PWA experience, serve the files over HTTP:

```bash
# Using Python 3
cd dist
python3 -m http.server 8080

# Using Node.js
npx serve dist -p 8080

# Using PHP
php -S localhost:8080 -t dist
```

Then access at `http://localhost:8080`

### Deploying to Production

You can deploy the `dist/` folder to any static hosting service:
- **Netlify** - Drag & drop the dist folder
- **Vercel** - Connect your repository
- **GitHub Pages** - Push to gh-pages branch
- **Firebase Hosting** - Use Firebase CLI
- **Any web server** - Copy files to your server root

### Customization

To modify the PWA settings, edit `vite.config.ts`:

```typescript
VitePWA({
  manifest: {
    name: "Your App Name",
    short_name: "AppName",
    description: "Your description",
    theme_color: "#your-color",
    // ... other settings
  }
})
```

## 🛠️ Troubleshooting

### App won't install
- Make sure you're accessing via HTTPS (or localhost)
- Clear browser cache and reload
- Check browser console for errors

### Offline mode not working
- Ensure you've visited the app at least once while online
- Check if service worker is registered (DevTools → Application → Service Workers)
- Clear cache and reload if needed

### AI features not working offline
- The terminal demo and bundled Dynamic Threshold engine work offline.
- If an optional local LLM such as Ollama is not running, GreenMind falls back to deterministic local threshold reasoning instead of calling a cloud API.

## 📝 Notes

- The app uses **localStorage** for data persistence
- Sensor data is stored locally on your device
- Chat sessions are saved locally
- The terminal demo sends no data to servers. Optional local LLM calls target `localhost` only.

## 📄 License

See the main project license file.

---

**GreenMind v1.0.0** - AI-Powered Greenhouse Intelligence
