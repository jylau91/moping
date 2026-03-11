# 墨評 Mòpíng — Chinese Calligraphy Analyser

AI-powered calligraphy analysis for intermediate students. Upload an image, get scored feedback across 6 stroke metrics, improvement guidance, and classical study references.

---

## Project Structure

```
moping/
├── public/
│   └── index.html          # Frontend (the full web app)
├── netlify/
│   └── functions/
│       └── analyse.js      # Netlify serverless function (API proxy)
├── api/
│   └── analyse.js          # Vercel serverless function (API proxy)
├── netlify.toml            # Netlify config
├── vercel.json             # Vercel config
└── README.md
```

---

## Deploy to Netlify (Recommended)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/moping.git
git push -u origin main
```

### 2. Connect to Netlify
1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Select your repo
3. Build settings are auto-detected from `netlify.toml`:
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
4. Click **Deploy site**

### 3. Add your API key
1. In Netlify dashboard → **Site configuration** → **Environment variables**
2. Click **Add a variable**
3. Key: `ANTHROPIC_API_KEY`
4. Value: your key from [console.anthropic.com](https://console.anthropic.com)
5. Click **Save** → **Trigger redeploy**

That's it. Your site is live.

---

## Deploy to Vercel (Alternative)

### 1. Push to GitHub (same as above)

### 2. Connect to Vercel
1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
2. Framework preset: **Other**
3. Root directory: `/` (leave default)
4. Click **Deploy**

### 3. Add your API key
1. In Vercel dashboard → **Settings** → **Environment Variables**
2. Add: `ANTHROPIC_API_KEY` = your key
3. Redeploy

> **Note for Vercel:** The `api/analyse.js` file is used (not the `netlify/functions` one).

---

## Local Development

### Netlify (with Netlify CLI)
```bash
npm install -g netlify-cli
netlify dev
```
Then open `http://localhost:8888`

### Vercel (with Vercel CLI)
```bash
npm install -g vercel
vercel dev
```
Then open `http://localhost:3000`

For local dev, create a `.env` file in the project root:
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## How It Works

```
Browser  →  POST /api/analyse  →  Serverless Function  →  Anthropic API
                (image + style)         (adds API key)         (Claude)
                                              ↓
Browser  ←  JSON result        ←  Serverless Function
```

The API key **never touches the browser** — it lives only in the server environment variable. This is safe for public deployment.

---

## Supported Image Formats
- JPEG / JPG
- PNG
- WEBP

Max recommended size: 5MB
