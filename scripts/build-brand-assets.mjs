/**
 * Genera los assets de marca de 787 Barber Studio a partir del logo oficial.
 *
 *   node scripts/build-brand-assets.mjs
 *
 * Entrada: public/brand/787-logo-source.png (o ./logo.png la primera vez).
 * Salidas:
 *   public/brand/787-logo.png  Logo completo recortado y optimizado (fondo transparente).
 *   public/brand/787-mark.png  Solo la máquina 787, sin el texto "BARBER STUDIO".
 *   public/brand/787-og.png    Imagen social 1200x630.
 *
 * No hay dependencias: el códec PNG mínimo vive en scripts/_png.mjs y sólo se
 * ejecuta a mano, nunca en el runtime de Cloudflare.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./_png.mjs";

const OUT_DIR = "public/brand";
const SOURCE = existsSync(`${OUT_DIR}/787-logo-source.png`) ? `${OUT_DIR}/787-logo-source.png` : "logo.png";

const PAPER = [0xf5, 0xf3, 0xef];
const INK = [0x0c, 0x0c, 0x0e];
const GOLD = [0xc7, 0x9a, 0x2b];
const RED = [0xd7, 0x1e, 0x1e];

function bounds(image, fromY = 0, toY = image.height - 1) {
  let x0 = image.width; let y0 = image.height; let x1 = -1; let y1 = -1;
  for (let y = fromY; y <= toY; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] <= 12) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function crop(image, box) {
  const pixels = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const source = ((box.y0 + y) * image.width + box.x0) * 4;
    image.pixels.copy(pixels, y * box.width * 4, source, source + box.width * 4);
  }
  return { width: box.width, height: box.height, pixels };
}

/** Reducción por caja con alfa premultiplicado: sin halos en los bordes. */
function resize(image, width) {
  const height = Math.max(1, Math.round((image.height * width) / image.width));
  const pixels = Buffer.alloc(width * height * 4);
  const sx = image.width / width; const sy = image.height / height;
  for (let y = 0; y < height; y += 1) {
    const fromY = Math.floor(y * sy); const toY = Math.min(image.height, Math.ceil((y + 1) * sy));
    for (let x = 0; x < width; x += 1) {
      const fromX = Math.floor(x * sx); const toX = Math.min(image.width, Math.ceil((x + 1) * sx));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let yy = fromY; yy < toY; yy += 1) {
        for (let xx = fromX; xx < toX; xx += 1) {
          const s = (yy * image.width + xx) * 4; const alpha = image.pixels[s + 3];
          r += image.pixels[s] * alpha; g += image.pixels[s + 1] * alpha; b += image.pixels[s + 2] * alpha;
          a += alpha; n += 1;
        }
      }
      const d = (y * width + x) * 4;
      if (a === 0) { pixels[d] = pixels[d + 1] = pixels[d + 2] = pixels[d + 3] = 0; continue; }
      pixels[d] = Math.round(r / a); pixels[d + 1] = Math.round(g / a); pixels[d + 2] = Math.round(b / a);
      pixels[d + 3] = Math.round(a / n);
    }
  }
  return { width, height, pixels };
}

function canvas(width, height, [r, g, b]) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = 255;
  }
  return { width, height, pixels };
}

function fill(target, x0, y0, width, height, [r, g, b], alpha = 1) {
  for (let y = Math.max(0, y0); y < Math.min(target.height, y0 + height); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(target.width, x0 + width); x += 1) {
      const d = (y * target.width + x) * 4;
      target.pixels[d] = Math.round(target.pixels[d] * (1 - alpha) + r * alpha);
      target.pixels[d + 1] = Math.round(target.pixels[d + 1] * (1 - alpha) + g * alpha);
      target.pixels[d + 2] = Math.round(target.pixels[d + 2] * (1 - alpha) + b * alpha);
    }
  }
}

function compose(target, image, x0, y0) {
  for (let y = 0; y < image.height; y += 1) {
    const ty = y0 + y; if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < image.width; x += 1) {
      const tx = x0 + x; if (tx < 0 || tx >= target.width) continue;
      const s = (y * image.width + x) * 4; const d = (ty * target.width + tx) * 4;
      const alpha = image.pixels[s + 3] / 255; if (!alpha) continue;
      target.pixels[d] = Math.round(target.pixels[d] * (1 - alpha) + image.pixels[s] * alpha);
      target.pixels[d + 1] = Math.round(target.pixels[d + 1] * (1 - alpha) + image.pixels[s + 1] * alpha);
      target.pixels[d + 2] = Math.round(target.pixels[d + 2] * (1 - alpha) + image.pixels[s + 2] * alpha);
      target.pixels[d + 3] = 255;
    }
  }
}

/** El filete 787: oro, tinta y rojo en ritmo 7 / 8 / 7. */
function filete(target, y, height) {
  const unit = target.width / 110;
  let x = 0; let index = 0;
  const cycle = [[GOLD, 7], [INK, 8], [RED, 7]];
  while (x < target.width) {
    const [color, span] = cycle[index % 3];
    fill(target, Math.round(x), y, Math.ceil(unit * span), height, color);
    x += unit * span; index += 1;
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const source = decodePng(readFileSync(SOURCE));
if (SOURCE !== `${OUT_DIR}/787-logo-source.png`) writeFileSync(`${OUT_DIR}/787-logo-source.png`, readFileSync(SOURCE));

const full = bounds(source);
const logo = resize(crop(source, full), 480);
writeFileSync(`${OUT_DIR}/787-logo.png`, encodePng(logo));

// La máquina termina antes del texto "BARBER STUDIO": buscamos el corte real.
const rowHasInk = [];
for (let y = 0; y < source.height; y += 1) {
  let count = 0;
  for (let x = 0; x < source.width; x += 1) if (source.pixels[(y * source.width + x) * 4 + 3] > 12) count += 1;
  rowHasInk.push(count > 0);
}
let machineEnd = full.y1;
for (let y = full.y0; y <= full.y1; y += 1) {
  if (!rowHasInk[y] && y > full.y0 + 40) { machineEnd = y - 1; break; }
}
const mark = resize(crop(source, bounds(source, full.y0, machineEnd)), 384);
writeFileSync(`${OUT_DIR}/787-mark.png`, encodePng(mark));

// Imagen social: papel 787, logo centrado, filete de marca abajo.
const og = canvas(1200, 630, PAPER);
fill(og, 0, 0, 1200, 630, INK, 0.02);
const ogLogo = resize(crop(source, full), 640);
compose(og, ogLogo, Math.round((1200 - ogLogo.width) / 2), Math.round((630 - ogLogo.height) / 2) - 14);
fill(og, 56, 44, 1088, 1, INK, 0.12);
fill(og, 56, 44, 1, 542, INK, 0.12);
fill(og, 1143, 44, 1, 542, INK, 0.12);
fill(og, 56, 585, 1088, 1, INK, 0.12);
filete(og, 624, 6);
writeFileSync(`${OUT_DIR}/787-og.png`, encodePng(og, { alpha: false }));

const report = [
  ["787-logo.png", logo.width, logo.height],
  ["787-mark.png", mark.width, mark.height],
  ["787-og.png", og.width, og.height],
];
for (const [name, width, height] of report) {
  const size = readFileSync(`${OUT_DIR}/${name}`).length;
  console.log(`${name.padEnd(20)} ${width}x${height}  ${(size / 1024).toFixed(1)} KB`);
}
