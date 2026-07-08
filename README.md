# Whamail Desktop

Desktop email broadcast application built with Electron + Next.js.

## One-Click Release Pipeline

```
git tag v1.0.1 && git push origin v1.0.1
```

That's it. GitHub Actions auto-builds the installer and publishes it.  
The landing page (GitHub Pages) automatically shows the latest download link.

---

## Requirements

| Dependency | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org/) | >= 18 | Next.js frontend & Electron |
| [npm](https://www.npmjs.com/) | >= 9 | Package management |
| [.NET SDK](https://dotnet.microsoft.com/download) | >= 8.0 | Backend API |
| [Git](https://git-scm.com/) | Any | Version control |

```bash
node -v       # >= 18
npm -v        # >= 9
dotnet --list-sdks  # shows 8.x or higher
```

## Directory Structure

```
whamail-desktop/              ← Git repo root
├── .github/workflows/
│   ├── release.yml           ← Builds installer on git tag push
│   └── landing.yml           ← Deploys landing page to GitHub Pages
├── landing/                  ← Download page (GitHub Pages)
│   └── index.html            ← Auto-detects latest version from GitHub API
├── desktop/                  ← Next.js + Electron source
│   ├── electron/
│   ├── src/
│   └── package.json
└── MailBridge.API/           ← .NET API (sibling, same repo)
    └── MailBridge.API/
        └── MailBridge.API.csproj
```

## Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Set your Supabase project credentials in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:5133/api
```

### 3. Run in development mode

```bash
npm run dev
```

This starts both Next.js (port 3000) and the .NET API concurrently.

Or run the Electron desktop version:

```bash
npm run electron:dev
```

This launches Next.js + Electron window with the .NET API running inside.

---

## Building the Desktop Installer

### Locally (Windows)

```bash
npm run electron:build:win
```

Output: `release/Whamail.Setup.1.0.0.exe`

### Locally (macOS)

```bash
npm run electron:build:mac
```

Output: `release/Whamail-1.0.0-arm64.dmg`

---

## CI/CD: Full One-Click Pipeline

### How it works

```
You push a tag                   GitHub Actions                    Users
─────────────                    ─────────────                     ─────
git tag v1.0.1
git push origin v1.0.1
        │
        ├──► Build Windows .exe ──► GitHub Release
        │
        └──► Build macOS .dmg  ──► GitHub Release
                                      │
                                      ▼
                              Landing page (GitHub Pages)
                              https://krishna-dharsandia.github.io/whamail-desktop/
                                      │
                                      ▼
                              "Download for Windows" / "Download for Mac"
                              (links auto-update to latest version)
```

### Step 1: Set up GitHub Pages

1. Go to repo **Settings → Pages**
2. Source: **GitHub Actions**
3. The `landing.yml` workflow will deploy `landing/` automatically

### Step 2: Push a release

```bash
# Bump version in package.json first
npm version patch   # or minor, or major
git push --tags
```

The `release.yml` workflow will:
1. Check out the desktop and API source
2. Run `npm ci` + `npm run icon-gen`
3. Run `npm run electron:build:win`
4. Upload `release/*.exe` to the GitHub Release

### Step 3: Users get the download

The landing page at `https://krishna-dharsandia.github.io/whamail-desktop/`  
auto-fetches the latest release from the GitHub API and shows the download buttons.

Direct download URLs (for embedding elsewhere):

```
https://github.com/krishna-dharsandia/whamail-desktop/releases/latest/download/Whamail.Setup.1.0.0.exe
https://github.com/krishna-dharsandia/whamail-desktop/releases/latest/download/Whamail-1.0.0-arm64.dmg
https://github.com/krishna-dharsandia/whamail-desktop/releases/latest/download/Whamail-1.0.0-x64.dmg
```

### API Repo in CI

The workflow expects the .NET API source at `MailBridge.API/MailBridge.API/`  
(either in the same repo as a sibling, or checked out via a second `actions/checkout` step).

---

## What's inside the installer

| Component | Source | Destination |
|---|---|---|
| Electron app | `out/`, `dist-electron/` | Program Files |
| .NET API | `api/publish/` | `resources/api/` inside app |
| Next.js frontend | `out/` | Served by Electron |

The .NET API is spawned as a child process by Electron on startup, runs on a random available port, and is health-checked before the window loads.

---

## License

MIT — see [LICENSE.txt](LICENSE.txt)
