# 787 Barber Studio

Sistema de gestión y reservas de **787 Barber Studio**, sobre
[vinext](https://github.com/cloudflare/vinext), Cloudflare Workers y D1.

## Inicio rápido

```bash
npm install
npm run dev
npm run build
```

## Despliegue

```bash
npm run deploy
```

La reserva pública vive en `/reservar/<slug>` (`/reservar/demo` en la base
inicial). El panel administrativo usa credenciales propias, sesiones seguras en
servidor, comprobación de membresía y rol, mutaciones de mismo origen, límites
de tasa y registro de auditoría.

## Marca

Los assets de 787 viven en `public/brand/` y se generan desde el logo oficial:

```bash
node scripts/build-brand-assets.mjs
```

Reglas de uso, tokens y composición: [`docs/787-VISUAL-IDENTITY.md`](docs/787-VISUAL-IDENTITY.md).

## Comandos útiles

- `npm run dev`: desarrollo local
- `npm run build`: verifica el build de producción
- `npm run lint`: ESLint
- `npm run test`: build + pruebas de modelo y de HTML renderizado
- `npm run db:generate`: genera migraciones de Drizzle tras cambiar el esquema
- `node scripts/build-brand-assets.mjs`: regenera logo, marca y OG image
