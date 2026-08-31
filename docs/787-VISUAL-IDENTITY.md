# 787 Barber Studio — Identidad visual

Sistema **"Placa y oro"**. Este documento manda sobre cualquier preferencia
estética improvisada. Si una pantalla nueva no se puede construir con lo que
está aquí, primero se justifica por qué, después se amplía el sistema.

---

## 1. Concepto

787 Barber Studio no es un SaaS genérico con el logo encima. El logo es una
**máquina de tres carretes** con el número 787 en oro, rojo y negro: metal,
precisión y una jugada que sale bien. El sistema traduce eso a software:

- **Placa antes que tarjeta.** Lo que representa a la marca vive sobre una
  superficie de tinta con filete de oro, no sobre otra tarjeta blanca flotante.
- **Precisión antes que decoración.** Radios contenidos, filetes finos, cifras
  tabulares. Nada gira, nada brilla, nada parpadea.
- **El número es la firma.** 787 aparece como marca de agua, numeración y
  ritmo; nunca como animación de tragamonedas.

**Equilibrio buscado:** barbería premium + software moderno. No casino, no
banco, no cripto, no plantilla de dashboard.

## 2. Las tres leyes

1. **Consistencia sobre creatividad.** Un módulo nuevo compone primitivas
   existentes; no inventa lenguaje visual.
2. **El lujo es disciplina.** Se consigue con jerarquía tipográfica, espaciado
   honesto y contención de color. Nunca con efectos.
3. **Todo dato es real.** Nada de barras decorativas, porcentajes inventados,
   métricas de ejemplo ni controles sin handler.

## 3. Prohibiciones duras

Nunca, en ninguna superficie:

- Neón, `glow`, sombras de color, `text-shadow`.
- Degradados de color como fondo de página, tarjeta o botón.
- Glassmorphism decorativo (el `backdrop-filter` sólo se usa en barras fijas
  para que el contenido no se lea a través).
- Radios de 20px o más en tarjetas y paneles.
- Serif decorativa o cursiva de barbería. Nada de western.
- Emojis como iconografía.
- Morado/azul-violeta de plantilla, arcoíris de categorías.
- Mayúsculas en títulos. La única versalita tipográfica es la micro-etiqueta
  mono de 11px y el logotipo `.brand-word strong`.
- `window.alert`, `window.confirm`, `window.prompt`.
- Animaciones de entrada llamativas, carretes girando, luces, contadores.
- Tijeras como sustituto del logo. Las tijeras sólo ilustran "servicio/corte".

## 4. Color

Todos los tokens viven en `app/globals.css` bajo `:root`. **Nunca escribas un
hex literal en un componente ni en una regla nueva.** Si falta un color, se
agrega token.

### Tinta

| Token | Valor | Uso |
|---|---|---|
| `--ink-950` | `#08080A` | Sidebar, superficies de marca profundas |
| `--ink-900` | `#0C0C0E` | Placas, botón primario, tema del navegador |
| `--ink-850` | `#121216` | Workspace, variantes de placa |
| `--ink-800` | `#17171B` | Item activo del sidebar, hover oscuro |
| `--ink-700` | `#23232A` | Filetes sobre tinta, medidores |
| `--ink-600` | `#33333C` | Bordes sutiles sobre tinta |

### Superficie y texto

| Token | Valor | Uso |
|---|---|---|
| `--paper` | `#F3F2EF` | Fondo de la aplicación (papel cálido, nunca gris frío) |
| `--surface` | `#FFFFFF` | Paneles y campos |
| `--surface-sunken` | `#FAF9F6` | Cabeceras de tabla, vacíos, cajas internas |
| `--line` | `#E8E5DF` | Filete estándar |
| `--line-strong` | `#D6D2C9` | Borde de control |
| `--text-primary` | `#101014` | Texto principal |
| `--text-secondary` | `#6B6A72` | Texto auxiliar |
| `--text-faint` | `#97959D` | Placeholders y marcas de agua de texto |

### Oro 787 — tomado del cilindro del logo

| Token | Valor | Uso |
|---|---|---|
| `--gold` | `#C79A2B` | Superficie y filete de marca, botón `accent`, foco de campo |
| `--gold-hover` | `#B0851F` | Hover del oro sólido |
| `--gold-dark` | `#8A6412` | **El único oro admitido como texto sobre blanco** (contraste ≥ 4.5:1) |
| `--gold-bright` | `#E7C36B` | Oro sobre tinta: iconos, cifras y etiquetas en placas |
| `--gold-soft` | `#FBF3E1` | Fondo de chip, fila en atención, anillo de foco |
| `--gold-line` | `#EBD9AC` | Borde de chip dorado |

### Rojo 787 — firma, nunca acción

| Token | Valor | Uso |
|---|---|---|
| `--red-787` | `#D71E1E` | Segmento del filete, badge de alertas, detalle de placa |
| `--red-787-ink` | `#A5150F` | Rojo de marca legible sobre claro (uso excepcional) |

**El rojo de marca no se usa nunca en un botón, un estado ni un mensaje.**
Para lo destructivo existe `--danger` (`#A82232`), más oscuro y menos saturado,
y siempre acompañado de etiqueta explícita ("Cancelar la cita", "Eliminar").
Confundirlos sería el peor error del sistema.

### Semánticos

`--ok #17694A` · `--warn #8A5D0C` · `--danger #A82232` · `--info #24457E`,
cada uno con `-ink`, `-soft` y `-line`. Los estados de cita (`programada`,
`confirmada`, `en_progreso`, `completada`, `cancelada`, `no_asistio`) se leen
por color **y** por texto, nunca sólo por color.

### Reparto de color

Orientación, no regla matemática:

- 65-75 % papel y superficies claras
- 15-20 % tinta (sidebar, placas, botón primario)
- 5-10 % oro
- < 5 % rojo de marca

**La acción primaria es tinta negra, no oro.** El oro es firma: rail activo del
sidebar, filete bajo la eyebrow, dato vigente de la gráfica, CTA público de
reserva. Si el oro aparece en más de tres lugares de una pantalla, sobra en dos.

## 5. Tipografía

Una sola familia: **Geist** (texto) y **Geist Mono** (cifras y micro-etiquetas).
No se añaden fuentes: una segunda familia display costaría descarga y no aporta
nada que la escala, el peso y el tracking no resuelvan. El carácter de marca lo
pone el logo, no una tipografía extravagante.

| Rol | Tamaño | Peso | Tracking |
|---|---|---|---|
| Micro-etiqueta mono (`.eyebrow`, cabecera de tabla) | 11px | 600 | `+0.14em`, versalitas |
| Auxiliar | 13px | 400–500 | 0 |
| Cuerpo | 15px | 400–500 | 0 |
| Subtítulo | 17px | 500 | `-0.01em` |
| Título de panel | 20px | 600 | `-0.02em` |
| Métrica | 28px | 600 | `-0.02em`, mono tabular |
| Indicador principal (placa de hoy) | 44px | 600 | `-0.035em`, mono tabular |
| Título de página | 32px | 600 | `-0.028em` |
| Héroe público | 52px | 600 | `-0.035em` |

**Toda cifra de dinero, hora, duración o conteo va en Geist Mono con
`font-variant-numeric: tabular-nums`.** Es el detalle que más "software serio"
comunica y el que conecta con la numeración del logo.

## 6. Uso del logo

Los assets viven en `public/brand/` y se generan con
`node scripts/build-brand-assets.mjs` a partir de `787-logo-source.png`.

| Asset | Qué es | Dónde |
|---|---|---|
| `787-logo.png` | Logo completo: máquina + "BARBER STUDIO" | Acceso, registro, recuperación de clave |
| `787-mark.png` | Sólo la máquina 787 | Sidebar, topbar móvil, cabecera pública, ticket de reserva, portal, pago, vista previa |
| `787-icon.svg` | Marca reducida geométrica (placa + carretes) | Favicon y tamaños diminutos |
| `787-og.png` | 1200×630 | Open Graph y Twitter |

Se usan siempre a través de `app/components/Brand.tsx`
(`<BrandLogo />`, `<BrandMark />`, `<BrandLockup />`). Un solo punto de verdad.

### Reglas de marca

- **No se deforma.** El tamaño lo fija el CSS del contenedor; los atributos
  `width`/`height` llevan la proporción real para que no haya salto de layout.
- **No se recolorea** ni se le aplican filtros.
- **No se repite** dentro de una misma superficie. Una marca por pantalla.
- **No se reconstruye con CSS.** El único dibujo propio es `787-icon.svg`, y es
  una abstracción declarada para 16–32px, no una copia del logo.
- **No se acompaña del texto "787".** La máquina ya lo dice: el lockup escribe
  "BARBER STUDIO" y una bajada de contexto ("Panel operativo", "Sistema
  interno", "Portal de cita").
- **Fallback:** cuando un negocio no tiene `logoUrl` configurado, la reserva
  pública muestra la marca 787. Nunca un icono genérico de tijeras.

## 7. Recursos de identidad

### El filete 787 (`.rule-787`)

Regla de 2px con segmentos oro / tinta / rojo en ritmo 7-8-7 (56px / 64px /
56px). Es la firma gráfica del sistema. **Una por pantalla**, como separador
entre la cabecera y el contenido. También encabeza el recibo impreso.

### La placa (`.plate`)

Superficie de tinta con filete de oro superior. Sustituye a "otra tarjeta
blanca más" cuando un bloque debe leerse como marca y no como dato:

- `.today-plate` — resumen de hoy en el inicio
- `.book-ticket` — resumen de la reserva pública
- `.poster-card` — pieza del héroe público
- `.cash-close-hero` — cierre de caja
- `.security-summary` — centro de seguridad

### La marca de agua (`.watermark-787`)

"787" en mono a 124px con 3,5 % de opacidad, abajo a la derecha de una placa.
Sólo en superficies de marca (acceso, placa de hoy, póster). Nunca sobre datos.

### Numeración

Los conteos cortos se escriben con cero a la izquierda (`07`, `08`) en la placa
de hoy, el arte de servicio público y las listas ordenadas. Es el eco discreto
del número de la marca.

## 8. Primitivas

Toda pantalla se compone con estas. Están definidas en `globals.css` y las
clases heredadas están mapeadas a ellas por selectores agrupados.

1. `.panel` — la única tarjeta. Cabecera con `.panel-title`.
2. `.metric-card` dentro de `.metric-grid` — el único KPI.
3. `.data-table` / `.inventory-table` — la única tabla. Cabecera y filas
   comparten rejilla automática; bajo 860px cada fila se convierte en ficha
   etiquetada mediante `data-label` por celda.
4. `.toolbar` — la única barra de filtros.
5. `.tabs` — el único conmutador de vistas.
6. `.form-grid` + `label > input|select|textarea` — el único formulario.
7. `.status` + modificador semántico — el único chip de estado.
8. `.empty-state` — el único vacío. Icono, frase, acción sugerida.
9. `.modal` / `.confirm-modal` — el único diálogo.
10. `.chart` — la única gráfica. Serie neutra, dato vigente en oro.
11. `.skeleton` — el único estado de carga.
12. `.plate` — la única superficie de marca.

## 9. Botones

Cuatro roles, ni uno más:

| Clase | Aspecto | Cuándo |
|---|---|---|
| `.primary` | Tinta, texto blanco | Acción operativa por defecto del panel |
| `.accent` / `.booking-primary` | Oro, texto tinta | Marca: reservar, empezar. **Máximo uno por pantalla** |
| `.secondary` | Contorno sobre blanco | Acción alternativa |
| `.ghost-action` | Sin caja | Acción terciaria |
| `.danger` | Contorno, texto `--danger` | Destructivo, siempre con etiqueta explícita |

Variantes de tamaño: `.compact` (38px) y `.large` (52px). Nada más.
Altura estándar 44px, que es también el objetivo táctil mínimo.

## 10. Radios y sombras

| Token | Valor | Uso |
|---|---|---|
| `--r-chip` | 5px | Chips, badges, teclas |
| `--r-control` | 9px | Botones, campos, filas de navegación |
| `--r-panel` | 12px | Paneles y tarjetas |
| `--r-plate` | 14px | Placas, modales, tarjetas de acceso |
| `--r-full` | 999px | Sólo medidores y pastillas de filtro |

787 es preciso: nada de interfaz llena de pastillas. Las sombras son mínimas
(`--shadow-sm/md/lg`); **primero el filete, después la sombra**.

## 11. Superficies

- **Sidebar** 264px, `--ink-950`, fijo, con filete derecho. Grupo = etiqueta
  mono + enlaces de 40px. Activo = rail de 3px en oro + fondo `--ink-800` +
  icono `--gold-bright`.
- **Topbar** 64px, blanca, `sticky`, filete inferior, buscador global real.
  Bajo 1024px muestra la marca compacta porque el sidebar se oculta.
- **La cabecera de página la dibuja el shell, no el módulo.** Un módulo nunca
  renderiza su propio `h1`.
- **Contenido**: `max-width` 1440px, padding 24px (16px en móvil), `gap` 20px.
- **Jerarquía real**: no todo es una tarjeta blanca. Hay contenido que vive
  directamente sobre la página, filas separadas por filete, y placas de tinta.

## 12. Estados obligatorios

Cada vista de datos implementa los cuatro: **cargando** (`.skeleton` o
`.loading-line`), **vacío** (`.empty-state` con acción), **error**
(`.form-error` con `role="alert"`) y **lleno**.

## 13. Movimiento

- 120ms para color y borde, 180ms para transformaciones, 220ms para entradas.
- Curva única: `cubic-bezier(0.2, 0, 0, 1)`.
- Entradas permitidas: `fade`, `rise` (8px), `pane-in` (6px), `toast-in`.
- `@media (prefers-reduced-motion: reduce)` anula todo.

## 14. Responsive

Puntos de control auditados: 360, 375, 390, 430, 768, 1024, 1280, 1440+.

- Nunca puede existir desplazamiento horizontal accidental. Todas las rejillas
  usan `minmax(min(Npx, 100%), 1fr)` para que ninguna columna exija más ancho
  que su contenedor.
- Objetivo táctil mínimo 44px.
- Bajo 720px los campos van a 16px para que iOS no haga zoom al enfocar.
- Las tablas no se comprimen: se convierten en fichas con etiqueta.
- El wizard de reserva lleva barra de acción fija en móvil, salvo en el último
  paso, donde el envío vive dentro del formulario.

## 15. Accesibilidad

- Foco visible siempre: `outline: 2px solid var(--gold-dark); outline-offset: 2px`.
  Sobre tinta, `--gold-bright`.
- Botones de sólo icono con `aria-label`.
- Contraste mínimo 4.5:1 en texto. El oro **no** se usa como texto pequeño
  sobre blanco; para eso está `--gold-dark`.
- Modales: `role="dialog"`, `aria-modal`, cierre con Escape, foco atrapado.
- El color nunca es el único portador de significado.

## 16. Idioma y contenido

- Español de Venezuela, tuteo, tono directo y profesional.
- **Panel**: copy corto, funcional, operativo.
- **Reserva pública**: cercano, premium, sin ruido publicitario.
- Los vacíos explican qué hacer; los errores dicen qué pasó y cómo seguir.
- La moneda sale de `business.currency`. Nunca se fija `USD` a mano.
- **No se inventan datos de la barbería**: ni años de experiencia, ni número de
  clientes, ni premios, ni reseñas, ni ubicaciones.

## 17. Lo que NO se debe hacer

- Poner el logo encima de una interfaz que sigue siendo de otro producto.
- Volver todos los botones dorados o todas las tarjetas negras.
- Usar el rojo de marca como color de estado o de acción.
- Escribir un hex suelto en un componente.
- Que un módulo dibuje su propio `h1` o su propio héroe.
- Añadir una librería de animación o de iconos.
- Colapsar una tabla a móvil sin `data-label` por celda.
- Repetir el logo en cada tarjeta.

## 18. Antes de dar por terminado

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
```

`tests/rendered-html.test.mjs` verifica cadenas literales:
**"Entra a 787 Barber Studio"**, **"Entrar al panel"**, **"Correo
electrónico"**, **"Reserva tu silla"**, **"Reservar ahora"**, **"Corte
Signature"**. No las cambies sin actualizar la prueba.
