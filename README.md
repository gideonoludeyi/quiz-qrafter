# Quiz Qrafter

### Requirement(s)

- [Node.js](https://nodejs.org/) with `npm`
- [Docker](https://www.docker.com/)

### Development Setup

```bash
# Initialize environment variable file
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Start postgres and redis containers
docker compose up -d

# Start application(s)
npm install
npm run dev

# ClEAN UP
# docker compose down
```

### Checks

This project uses [Vite+](https://viteplus.dev/) (`vp`) for task running, formatting, linting, and type checking.

```bash
npx vp check        # format, lint, and type check
npx vp check --fix  # apply formatting and lint fixes
npm run build       # build every workspace package (vp run -r build)
```

Installing the global [`vp` CLI](https://viteplus.dev/guide/) lets you drop the `npx` prefix.
