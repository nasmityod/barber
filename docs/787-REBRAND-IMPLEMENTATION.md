# 787 Barber Studio — Reporte de implementación del rebrand

Fecha: 30 de agosto de 2026.

---

## 1. Estado anterior

El producto se llamaba **Corteza** y usaba un sistema visual propio llamado
"Acero y latón": latón (`--brass #B8862F`) como firma, tinta neutra fría,
tokens con nombres heredados (`--terra`, `--olive`, `--sand`, `--pole`) y unas
tijeras de Lucide haciendo de logotipo en el sidebar, el acceso, el registro,
la recuperación de clave, la reserva pública, el portal del cliente y el pie
de página.

Además del branding, la auditoría encontró estos problemas reales:

| Problema | Dónde | Efecto |
|---|---|---|
| El CSS del wizard de reserva no correspondía al marcado del componente | `.book-rail`, `.book-fills`, `.book-when`, `.book-svc`, `.book-barbers` | El paso 2 y el ticket se renderizaban con reglas pensadas para otra estructura |
| `.data-table` se estilaba como `<table>` pero el marcado eran divs | Citas, inventario | Cabecera y filas no compartían columnas: nada quedaba alineado |
| `.week-calendar-*` declaraba 7 columnas para 8 celdas | Agenda semanal | El domingo caía a una segunda fila y la columna de horas quedaba fuera |
| `.cash-due` servía a la vez de panel y de fila | Caja → "Sillas por cobrar" | El panel entero se volvía un flex horizontal |
| `.portal-cancel` servía a la vez de sección y de botón | Portal del cliente | El botón "Cancelar cita" perdía su caja |
| La regla base de campos tenía más peso que `.search-box input` | Todos los buscadores | Se dibujaba una caja dentro de otra |
| `.reports-actions` vivía dentro de la rejilla de filtros | Reportes | Los botones se apilaban dentro de una columna de 170px |
| `.month-day > b` no existía en el marcado (`<span>`) | Agenda mensual | El número del día quedaba sin estilo |
| Lógica de acento duplicada en dos archivos | `public-catalog.ts` y `api/public/catalog` | Dos fuentes de verdad para el mismo color |
| `rgba(198,161,91,…)` escrito a mano | `ReportsManager` (mapa de horas) | Color fuera del sistema de tokens |
| `og.png` de 1,2 MB | Open Graph | Peso innecesario en cada compartida |
| `app/globals.css.bak` (533 líneas del sistema anterior) | Repo | Ruido |
| SECURITY.md afirmaba login delegado por SIWC/Sites | Documentación | Descripción falsa del modelo de autenticación real |

## 2. Estrategia

1. **Marca primero, desde el asset real.** Se extrajeron los assets de 787
   directamente del logo oficial con un script reproducible, en vez de
   redibujar el logo con CSS.
2. **Un solo sistema de tokens.** `app/globals.css` se reescribió completo con
   nomenclatura nueva y coherente; no quedó ningún nombre heredado ni ningún
   hex suelto en componentes.
3. **Rebrand quirúrgico, no búsqueda y reemplazo.** Cada aparición de "Corteza"
   se clasificó en visible / documentación / identificador interno, y sólo se
   cambió lo que no rompe sesiones, enlaces ni despliegues.
4. **Arreglar mientras se migra.** Cada colisión de clases o desalineación
   encontrada durante la migración se corrigió en el mismo paso.
5. **Verificación real en navegador**, no sólo lectura de CSS.

## 3. Decisiones de identidad

| Decisión | Motivo |
|---|---|
| Sistema llamado **"Placa y oro"** | El logo es metal: placa de tinta con filete de oro en vez de "otra tarjeta blanca" |
| **La acción primaria sigue siendo tinta negra**, no oro | Evita la interfaz dorada por todas partes; el oro conserva valor de firma |
| **Oro de dos niveles**: `--gold` para superficie, `--gold-dark` para texto sobre blanco | El oro del logo no alcanza 4.5:1 como texto pequeño |
| **Rojo de marca separado de `--danger`** | El rojo 787 es firma; lo destructivo necesita su propio rojo, más oscuro, siempre con etiqueta |
| **Se mantiene Geist + Geist Mono** | Una segunda familia display costaría descarga y no aporta nada que escala, peso y tracking no resuelvan. El carácter lo pone el logo |
| **El lockup no repite "787" en texto** | La máquina del logo ya escribe el número; repetirlo al lado se leía redundante |
| **La máquina (sin el texto "BARBER STUDIO") es la marca compacta** | El texto del logo es negro y desaparecería sobre tinta; la máquina funciona sobre ambos fondos |
| **Filete 787 (`.rule-787`) como firma gráfica** | Oro / tinta / rojo en ritmo 7-8-7: identidad sin decorar |
| **Marca de agua "787" al 3,5 %** sólo en superficies de marca | El número como recurso, sin caer en tragamonedas |
| **Numeración con cero a la izquierda** (`07`, `08`) | Eco discreto de la numeración del logo |
| **Nada de tragamonedas**: sin giros, luces ni contadores | Petición explícita y criterio propio: es una barbería, no un casino |

## 4. Assets de marca

Generados por `scripts/build-brand-assets.mjs` (Node puro, sin dependencias: el
códec PNG mínimo vive en `scripts/_png.mjs` y sólo se ejecuta a mano).

| Archivo | Tamaño | Peso | Uso |
|---|---|---|---|
| `public/brand/787-logo-source.png` | 1000×1000 | 295 KB | Fuente original intacta |
| `public/brand/787-logo.png` | 480×323 | 110 KB | Logo completo, recortado y remuestreado |
| `public/brand/787-mark.png` | 384×234 | 74 KB | Sólo la máquina 787 |
| `public/brand/787-icon.svg` | 32×32 | 1,2 KB | Marca reducida (favicon y tamaños diminutos) |
| `public/brand/787-og.png` | 1200×630 | 168 KB | Open Graph / Twitter |
| `public/favicon.svg` | 32×32 | 1,2 KB | Copia del icono |

El logo original tiene fondo transparente, así que la máquina funciona sobre
tinta y sobre papel sin tratamiento. El texto "BARBER STUDIO" del logo es negro:
por eso sobre superficies oscuras se usa la máquina más el lockup tipográfico.

**Eliminados:** `public/og.png` (1,2 MB, marca anterior), `public/file.svg`,
`public/globe.svg`, `public/window.svg` (plantilla de Next, sin uso verificado),
`app/globals.css.bak`, y el `logo.png` de la raíz (conservado íntegro como
`public/brand/787-logo-source.png`).

## 5. Archivos importantes modificados

### Sistema visual

- **`app/globals.css`** — reescrito completo (3.400 líneas). Tokens nuevos,
  primitivas, marca 787, shell, módulos, superficies públicas, responsive.
  Cero hex sueltos, cero nombres heredados.

### Componentes creados

- **`app/components/Brand.tsx`** — `BrandLogo`, `BrandMark`, `BrandLockup` y
  `BRAND_NAME`. Único punto de verdad del logo en la aplicación.

### Shell y panel

- `app/components/AdminApp.tsx` — marca del sidebar, marca en el topbar móvil,
  filete 787, **rediseño del inicio** (ver §7), `data-label` por celda en la
  tabla de citas, tonos de métrica semánticos, copys migrados, eliminación de
  un estilo inline.
- `app/components/SettingsPanel.tsx` — reescrito: nueva sección **"Identidad
  pública"** con vista previa real y en vivo de la página de reservas.
- `app/components/CommerceManager.tsx` — `data-label` en el inventario.
- `app/components/ReportsManager.tsx` — mapa de horas por token (`--heat`).
- `app/components/CashManager.tsx`, `CommissionsManager.tsx`, `DayShift.tsx`,
  `GrowthManager.tsx`, `dialogs.tsx`, `LoginForm.tsx`, `RegisterForm.tsx` —
  copys y tonos.

### Superficies públicas

- `app/login/page.tsx` — nueva experiencia de acceso 787.
- `app/registro`, `app/recuperar-clave`, `app/restablecer-clave`,
  `app/cambiar-clave` — logo real, copy 787.
- `app/components/BookingApp.tsx` — cabecera, pie, héroe, póster de marca,
  ticket, estados de carga y error.
- `app/components/ClientPortal.tsx` — cabecera de marca.
- `app/pago/[token]/page.tsx` — reestructurada con cabecera de marca.
- `app/privacidad`, `app/terminos` — copy y metadata.

### Backend y datos

- `app/layout.tsx` — title, description, OpenGraph, Twitter, favicon, themeColor.
- `app/api/admin/receipts/route.ts` — recibo rediseñado (ver §9).
- `app/api/admin/backup/route.ts` — nombre de archivo y `format` del respaldo.
- `app/api/auth/register/route.ts` — texto de la alerta de bienvenida.
- `app/public-catalog.ts` — `barberAccent` exportado y ampliado.
- `app/api/public/catalog/route.ts` — usa `barberAccent` en vez de duplicarla.
- `db/init.ts` — semilla, valores por defecto y **migración de rebrand guardada**.
- `db/schema.ts` — valores por defecto alineados.

### Proyecto

- `eslint.config.mjs`, `package.json`, `.gitignore`, `README.md`, `SECURITY.md`,
  `tests/rendered-html.test.mjs`, `.claude/skills/787-design/SKILL.md`
  (sustituye a `corteza-design`), `.claude/launch.json`.

## 6. Migración de datos (guardada)

`db/init.ts` incorpora la migración `brand_787_v1`, que sólo toca valores que
siguen siendo los predeterminados del sistema anterior:

```sql
UPDATE businesses SET name='787 Barber Studio'
  WHERE id='biz_demo' AND name='Corteza Studio';
UPDATE booking_page_settings SET headline='Reserva tu silla. Sin llamadas, sin esperas.'
  WHERE headline='Tu mejor versión empieza aquí.';
UPDATE booking_page_settings SET primary_color='#C79A2B'
  WHERE upper(primary_color) IN ('#C6A15B','#2563EB');
UPDATE alerts SET title='Bienvenido a 787 Barber Studio'
  WHERE title='Bienvenido a Corteza';
```

Si el negocio ya personalizó su nombre, su titular o su color, **no se modifica
nada**. Además, `barberAccent()` migra los acentos heredados en lectura, así
que la página pública muestra el oro 787 aunque la fila todavía no se haya
actualizado.

## 7. Mejoras estructurales aplicadas por criterio propio

1. **Inicio rediseñado.** Se eliminó la fila de cuatro KPI genéricos y la
   franja de acciones separada. En su lugar hay una **placa de tinta** que
   responde de un vistazo "¿qué está pasando hoy?": un indicador dominante
   (cobrado hoy, 44px, mono tabular), tres cifras de apoyo (citas de hoy, por
   atender, próximas) y las acciones rápidas, todo en una sola superficie de
   marca. Menos tarjetas, más jerarquía.
2. **Tablas realmente tabulares.** Cabecera y filas comparten rejilla
   automática. Bajo 860px cada fila se convierte en ficha con la etiqueta de
   columna encima del valor (`data-label`), en vez de un scroll horizontal.
3. **Agenda semanal alineada** (columna de horas + 7 días) y vista mensual con
   el número del día realmente estilado.
4. **Wizard de reserva reconstruido** para que el CSS corresponda al marcado:
   ticket de marca con rail de pasos, medidor, resumen móvil, barra de acción
   fija en móvil que se retira en el último paso para no tapar el envío.
5. **Configuración reorganizada** en cuatro bloques con intención (Identidad
   pública / Ficha comercial / Reglas de operación / Bloques de la página) y
   barra de guardado fija.
6. **Vista previa real de la reserva pública** dentro de Configuración, que se
   actualiza mientras se escribe, sin backend nuevo: reutiliza el estado del
   formulario.
7. **Rejillas a prueba de desbordamiento**: las 25 definiciones de rejilla
   pasaron a `minmax(min(Npx, 100%), 1fr)`.
8. **Especificidad de campos corregida** con `:where()`, lo que arregla de una
   vez todos los buscadores y campos embebidos.
9. **Colisiones de clases resueltas** (`.cash-due`, `.portal-cancel`).
10. **Tonos de métrica semánticos** (`gold`/`ok`/`info`/`ink`/`danger`) en vez
    de nombres de color heredados (`terracotta`/`olive`/`sand`).
11. **Regla `no-img-element` desactivada a nivel de configuración** con su
    justificación, en lugar de repartir `eslint-disable` por los archivos.
12. **SECURITY.md corregido**: describía un login delegado por SIWC/Sites que
    no existe. Ahora describe la autenticación propia real (hash con sal única,
    sin proveedores externos).

## 8. Accesibilidad

- Foco visible unificado en `--gold-dark` (4.9:1 sobre blanco) y `--gold-bright`
  sobre superficies de tinta.
- El oro claro no se usa nunca como texto pequeño sobre blanco.
- Objetivo táctil de 44px en botones, campos y filas de navegación.
- Cabecera de tabla real en escritorio; en móvil, etiqueta por celda para que
  ninguna cifra quede huérfana.
- `aria-label` en el logo cuando actúa como identidad, `aria-hidden` cuando es
  decorativo; `aria-label` en la vista previa de configuración.
- Se retiró un `role="table"` incompleto que se había añadido y habría
  empeorado la lectura con lector de pantalla.
- `prefers-reduced-motion` anula todas las animaciones.

## 9. Recibos

`app/api/admin/receipts/route.ts` genera un recibo sobrio, sin imágenes:
nombre del negocio en versalitas, filete 787, número de recibo y fecha en mono,
detalle, subtotal, propina, reembolsos y total neto destacado. Se decidió **no
incrustar el logo**: una máquina dorada se imprime como una mancha gris en una
impresora sencilla, mientras que el filete y la tipografía se leen igual en
blanco y negro. `print-color-adjust: exact` conserva el filete al imprimir y el
botón "Imprimir recibo" desaparece en la hoja.

## 10. Rendimiento

- Open Graph: **1,2 MB → 168 KB**.
- Se eliminaron cuatro assets sin uso de la plantilla de Next.
- No se añadió ninguna dependencia: cero librerías de animación, cero fuentes
  nuevas, cero iconos nuevos. `lucide-react` sigue siendo la única iconografía.
- Los assets de marca llevan `width`/`height` reales: no hay salto de layout.
- Los efectos son CSS; no se añadió JavaScript decorativo.
- El script de assets es Node puro y nunca se ejecuta en el runtime de Workers.

## 11. Referencias internas de Corteza conservadas deliberadamente

| Identificador | Dónde | Por qué se conserva |
|---|---|---|
| `corteza_session` | `app/auth.ts` | Renombrar la cookie cierra la sesión de todo el equipo en el siguiente despliegue |
| `corteza-appointment-portal:` | `app/portal.ts` | Es la semilla del token del portal: cambiarla invalida **todos** los enlaces de cita ya enviados a clientes |
| `corteza.onboarding` | `app/components/AdminApp.tsx` | Clave de `localStorage`: renombrarla haría reaparecer el panel de puesta en marcha a quien ya lo ocultó |
| `x-corteza-currency` | `app/api/admin/cash/route.ts` | Cabecera HTTP interna de la exportación CSV; invisible y sin beneficio en cambiarla |
| `x-corteza-local-recovery` | `app/api/auth/forgot-password/route.ts` y `ForgotPasswordForm.tsx` | Cabecera de conveniencia sólo para localhost |
| `"name": "corteza-barber"` | `wrangler.jsonc` | Es el nombre del servicio de Cloudflare Workers. Cambiarlo crea un Worker nuevo y deja huérfanos el binding de D1, los cron triggers y el dominio |
| `'Corteza Studio'`, `'Bienvenido a Corteza'` | `db/init.ts` | Aparecen sólo como **guarda** de la migración de rebrand: identifican el valor antiguo que hay que sustituir |

Sí se cambiaron, por ser artefactos que el usuario ve o por riesgo nulo:
el nombre del archivo de respaldo y su campo `format` (`787-backup`; un futuro
importador debe aceptar también `corteza-backup`), el `id` del diálogo de
confirmación, la variable de entorno `CORTEZA_TEST_PORT` → `BARBER_TEST_PORT`,
el nombre en `package.json` y el nombre de la configuración de arranque local.

## 12. Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm run lint` | **0 errores, 0 advertencias** |
| `npx tsc --noEmit` | **Sin errores** |
| `npm run build` | **Correcto** (ejecutado en cada iteración) |
| `npm test` (build + 36 pruebas) | **36 pasan, 0 fallan** (8,5 s) |

Las pruebas de HTML renderizado se actualizaron a las cadenas nuevas: "Entra a
787 Barber Studio", "Entrar al panel", "Reserva tu silla". La comprobación de
"servidor propio" del arranque de pruebas pasó de buscar `Corteza` a buscar
`787 Barber Studio`.

## 13. Rutas verificadas en el navegador

Servidor local (`wrangler dev`, build de producción), sesión de propietario
real sobre la base D1 local con datos sembrados.

**Escritorio (1440 × 900):** `/login`, `/dashboard`, `/agenda`, `/citas`,
`/caja`, `/servicios`, `/turno`, `/reportes`, `/configuracion`,
`/reservar/demo`, `/api/admin/receipts?appointmentId=…` (800px).

**Móvil (390 × 844):** `/dashboard`, `/citas` (tabla → fichas), `/reservar/demo`
(portada), wizard pasos 1-2-3, `/cita/<token>` (portal del cliente),
`/pago/<token>`, y el cajón de navegación abierto.

**Auditoría de desbordamiento** (`scrollWidth` vs `clientWidth` más los
elementos que sobresalen) ejecutada en cada ruta y ancho: **sin desbordamiento
horizontal**. Además, las 23 rutas del panel se comprobaron por HTTP: todas
responden 200 y **ninguna contiene la cadena "corteza"**.

Se ejecutó también un flujo real de reserva pública (catálogo →
disponibilidad → `POST /api/public/bookings`) que devolvió 201 y un enlace de
portal válido, verificando que el rediseño no rompió la lógica.

## 14. Problemas encontrados y solución aplicada

| Problema | Solución |
|---|---|
| `.booking-site` como contenedor flex impedía que sus hijos se encogieran y el documento crecía a 792px en móvil | Se devolvió a `display: block`; además todas las rejillas usan `minmax(min(…), 1fr)` |
| La regla base de campos ganaba en especificidad a `.search-box input` | La cadena de `:not()` se envolvió en `:where()` |
| Cabecera y filas de tabla sin columnas comunes | Rejilla automática compartida |
| Agenda semanal desalineada (7 columnas para 8 celdas) | `62px repeat(7, …)` |
| `.cash-due` y `.portal-cancel` con doble significado | Selectores separados |
| Botones de Reportes apilados dentro de una columna de filtro | `grid-column: 1 / -1` |
| El filete 787 se leía como un poste de barbería a rayas | Segmentos de 56/64/56px y 2px de alto |
| El lockup repetía "787" junto a la máquina | El texto pasó a "BARBER STUDIO" + bajada de contexto |
| La vista previa de configuración recortaba la marca | La regla de portada se limitó a la foto, no a la marca |
| La migración de color no encontraba `#2563EB` | `upper()` en la comparación (SQLite distingue mayúsculas) |
| La barra fija del wizard tapaba el envío en el paso 3 | `:not(:has(.booking-primary))` la vuelve estática |
| El aspa de cerrar se pegaba a la marca en el cajón móvil | `padding-right: 48px` en la marca bajo 1024px |

## 15. Riesgos pendientes y notas operativas

1. **El nombre comercial en producción.** La migración renombra el negocio sólo
   si todavía se llama exactamente `Corteza Studio`. Si alguien ya lo cambió,
   hay que ajustarlo desde **Configuración → Ficha comercial → Nombre
   comercial**. Lo mismo aplica al titular y al color.
2. **El slug público sigue siendo `demo`** (`/reservar/demo`). Cambiarlo altera
   una URL que los clientes ya pueden tener guardada, así que se dejó como está;
   es editable desde la configuración del negocio cuando se decida.
3. **`compatibility_date` de `wrangler.jsonc` (2026-08-01) es posterior a lo que
   soporta el binario de Wrangler instalado (2026-05-22).** Por eso `vinext dev`
   no arranca en este entorno y la verificación se hizo con `npm run build` +
   `wrangler dev`. Es una condición previa al rebrand, no una regresión; se
   resuelve actualizando Wrangler.
4. **Las fuentes Geist se resuelven a rutas `file://` al servir el build con
   `wrangler dev` local**, así que las capturas usan la tipografía de respaldo.
   El CSS compilado no contiene rutas `file://`; es un artefacto de la
   integración `next/font` + vinext en local, previo a este trabajo y ajeno al
   rebrand, pero conviene confirmarlo en el despliegue real.
5. **Los datos de demostración de la base local** incluyen nombres de cliente
   raros ("Intercomunicador Bluetooth Q58 Max…") procedentes de pruebas
   anteriores. No afectan al código.
6. **Backups anteriores** llevan `format: "corteza-backup"`. Si algún día se
   implementa la importación, debe aceptar ambos valores.

## 16. Criterios de terminado

| Criterio | Estado |
|---|---|
| El panel parece software propio de 787 | ✅ |
| El acceso es inequívocamente 787 | ✅ |
| La reserva pública tiene identidad 787 propia | ✅ |
| Pagos y portal del cliente pertenecen al mismo sistema visual | ✅ |
| Los recibos están correctamente identificados | ✅ |
| Favicon, metadata y OpenGraph son 787 | ✅ |
| No quedan referencias visibles a Corteza | ✅ (las internas están documentadas en §11) |
| El logo está correctamente incorporado y con jerarquía de uso | ✅ |
| Existe un design system real, no colores sueltos | ✅ `docs/787-VISUAL-IDENTITY.md` |
| Escritorio correcto | ✅ verificado a 1440 |
| Móvil correcto | ✅ verificado a 390, sin desbordamiento |
| Sin regresiones funcionales | ✅ 36/36 pruebas, reserva real end-to-end |
| Lint y pruebas verificados | ✅ |
| Documentación | ✅ identidad + implementación + skill de diseño |
