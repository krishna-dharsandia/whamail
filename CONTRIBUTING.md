# Contributing to Whamail

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/whamail.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Follow the [Development setup](#development-setup) below

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [.NET SDK](https://dotnet.microsoft.com/download) >= 8.0
- [Git](https://git-scm.com/)

### Install & Run

```bash
cd desktop
npm install
cp .env.example .env.local   # configure your Supabase credentials
npm run dev                   # web mode
npm run electron:dev          # desktop mode
```

## Submitting Changes

1. Commit with clear messages following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add audience import from CSV`
   - `fix: resolve auth redirect loop`
   - `docs: update setup instructions`
2. Push to your fork
3. Open a Pull Request against `main`
4. Describe what changed and why

## Reporting Bugs

Open an [issue](https://github.com/krishna-dharsandia/whamail/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- OS and app version

## Code Style

- TypeScript for frontend (Next.js + Electron)
- C# for backend (.NET API)
- Use existing patterns in the codebase

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
