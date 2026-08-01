# Corteza

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

The public booking flow is available at `/reservar/demo`. The administrative
dashboard uses Corteza credentials, secure server-side sessions, membership and
role checks, same-origin mutations, rate limits, and an audit trail.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the production build
- `npm run lint`: run ESLint
- `npm run test`: run rendered HTML tests
- `npm run db:generate`: generate Drizzle migrations after schema changes
