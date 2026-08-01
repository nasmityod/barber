# vinext-starter

A full-stack barber management app running on
[vinext](https://github.com/cloudflare/vinext), Cloudflare Workers and D1.

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Deployment

```bash
npm run deploy
```

The dashboard is available at `/dashboard` and uses the Cloudflare deployment
administrator identity. It does not require ChatGPT login. Add Cloudflare
Access or another application authentication layer before exposing admin
actions publicly.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the production build
- `npm run lint`: run ESLint
- `npm run test`: run rendered HTML tests
- `npm run db:generate`: generate Drizzle migrations after schema changes
