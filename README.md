<p align="center">
  <img src="desktop/build/icon.png" alt="Whamail" width="120" />
</p>

<h1 align="center">Whamail</h1>

<p align="center">
  Open-source desktop email broadcast platform.<br/>
  Built with Electron, Next.js, and .NET.
</p>

<p align="center">
  <a href="https://github.com/krishna-dharsandia/whamail/releases/latest">
    <img src="https://img.shields.io/github/v/release/krishna-dharsandia/whamail?style=flat-square" alt="Latest Release" />
  </a>
  <a href="https://github.com/krishna-dharsandia/whamail/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/krishna-dharsandia/whamail?style=flat-square" alt="License" />
  </a>
  <a href="https://github.com/krishna-dharsandia/whamail/actions/workflows/release.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/krishna-dharsandia/whamail/release.yml?style=flat-square&label=build" alt="Build Status" />
  </a>
  <a href="https://github.com/krishna-dharsandia/whamail/releases/latest">
    <img src="https://img.shields.io/github/downloads/krishna-dharsandia/whamail/total?style=flat-square" alt="Downloads" />
  </a>
</p>

---

## Features

- **Email Broadcasts** — Send bulk emails to your audience
- **Audience Management** — Import, organize, and segment contacts
- **Template Editor** — Create and reuse email templates
- **Google OAuth** — Sign in with Google
- **Metrics & Logs** — Track delivery and engagement
- **Cross-Platform** — Windows (.exe) and macOS (.dmg)
- **System Tray** — Runs in background with tray icon

## Download

Get the latest version from the [Releases page](https://github.com/krishna-dharsandia/whamail/releases/latest).

| Platform | Download |
|----------|----------|
| Windows (64-bit) | [Whamail-Setup-x64.exe](https://github.com/krishna-dharsandia/whamail/releases/latest) |
| macOS (Apple Silicon) | [Whamail-arm64.dmg](https://github.com/krishna-dharsandia/whamail/releases/latest) |
| macOS (Intel) | [Whamail-x64.dmg](https://github.com/krishna-dharsandia/whamail/releases/latest) |

Or visit [whamail.xyz](https://whamail.xyz) for the download page.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | [Electron](https://www.electronjs.org/) |
| Frontend | [Next.js](https://nextjs.org/) + [React](https://react.dev/) + [Tailwind CSS](https://tailwindcss.com/) |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) |
| Backend API | [.NET 8](https://dotnet.microsoft.com/) (C#) |
| Auth & Database | [Supabase](https://supabase.com/) |
| Installer | [NSIS](https://nsis.sourceforge.io/) (Windows) / DMG (macOS) |

## Project Structure

```
whamail/
├── desktop/              # Electron + Next.js app
│   ├── electron/         # Main process (Electron)
│   ├── src/              # Next.js frontend (React)
│   └── package.json
├── landing/              # Landing page (Astro)
├── MailBridge.API/       # .NET backend API
└── .github/workflows/   # CI/CD (GitHub Actions)
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [.NET SDK](https://dotnet.microsoft.com/download) >= 8.0

### Quick Start

```bash
# Clone the repo
git clone https://github.com/krishna-dharsandia/whamail.git
cd whamail/desktop

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
```

Set your Supabase credentials in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:5133/api
```

```bash
# Run in web mode (Next.js + .NET API)
npm run dev

# Run in desktop mode (Electron)
npm run electron:dev
```

### Building

```bash
# Windows
npm run electron:build:win
# Output: dist/Whamail-Setup-1.0.0-x64.exe

# macOS (Apple Silicon)
npm run electron:build:mac-arm64
# Output: dist/Whamail-1.0.0-arm64.dmg

# macOS (Intel)
npm run electron:build:mac-x64
# Output: dist/Whamail-1.0.0-x64.dmg
```

## Release Process

Push a version tag to trigger automated builds:

```bash
# Bump version in desktop/package.json, then:
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions builds installers for all platforms and uploads them to the [Releases page](https://github.com/krishna-dharsandia/whamail/releases).

## Architecture

```
┌─────────────────────────────────────────┐
│              Electron Shell             │
│  ┌───────────────┐  ┌───────────────┐  │
│  │   Next.js UI  │  │  .NET API     │  │
│  │   (Renderer)  │◄─┤  (Child Proc) │  │
│  └───────────────┘  └───────┬───────┘  │
│                             │          │
│                      ┌──────┴──────┐   │
│                      │  Supabase   │   │
│                      │  (Auth/DB)  │   │
│                      └─────────────┘   │
└─────────────────────────────────────────┘
```

The .NET API runs as a child process inside Electron, communicating over localhost on a random available port.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — Krishna Dharsandia
