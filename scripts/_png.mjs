// Minimal PNG decode/encode (8-bit RGBA, non-interlaced) used by the brand
// asset pipeline. No runtime dependency: it only runs from `npm run brand`.
import { deflateSync, inflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function decodePng(file) {
  let offset = 8;
  const chunks = [];
  let width = 0; let height = 0; let depth = 0; let colorType = 0; let interlace = 0;
  let palette = null; let transparency = null;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") transparency = Buffer.from(data);
    else if (type === "IDAT") chunks.push(Buffer.from(data));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`PNG no soportado (depth ${depth}, interlace ${interlace}).`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Tipo de color PNG no soportado: ${colorType}`);
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks));
  const lines = Buffer.alloc(height * stride);
  let pointer = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pointer]; pointer += 1;
    const line = raw.subarray(pointer, pointer + stride); pointer += stride;
    const current = lines.subarray(y * stride, (y + 1) * stride);
    const previous = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? current[i - channels] : 0;
      const b = previous ? previous[i] : 0;
      const c = previous && i >= channels ? previous[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      current[i] = value & 0xff;
    }
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i += 1) {
    const s = i * channels;
    if (colorType === 6) { pixels[p] = lines[s]; pixels[p + 1] = lines[s + 1]; pixels[p + 2] = lines[s + 2]; pixels[p + 3] = lines[s + 3]; }
    else if (colorType === 2) { pixels[p] = lines[s]; pixels[p + 1] = lines[s + 1]; pixels[p + 2] = lines[s + 2]; pixels[p + 3] = 255; }
    else if (colorType === 0) { pixels[p] = pixels[p + 1] = pixels[p + 2] = lines[s]; pixels[p + 3] = 255; }
    else if (colorType === 4) { pixels[p] = pixels[p + 1] = pixels[p + 2] = lines[s]; pixels[p + 3] = lines[s + 1]; }
    else { const index = lines[s]; pixels[p] = palette[index * 3]; pixels[p + 1] = palette[index * 3 + 1]; pixels[p + 2] = palette[index * 3 + 2]; pixels[p + 3] = transparency && index < transparency.length ? transparency[index] : 255; }
    p += 4;
  }
  return { width, height, pixels };
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodePng({ width, height, pixels }, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const rows = Buffer.alloc(height * (stride + 1));
  const scratch = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 4; const d = x * channels;
      scratch[d] = pixels[s]; scratch[d + 1] = pixels[s + 1]; scratch[d + 2] = pixels[s + 2];
      if (alpha) scratch[d + 3] = pixels[s + 3];
    }
    // Pick the cheapest of the three filters that matter for flat artwork.
    const previous = y ? rows.subarray((y - 1) * (stride + 1) + 1, y * (stride + 1)) : null;
    const previousRaw = Buffer.alloc(stride);
    if (y) {
      const prevStart = (y - 1) * width * 4;
      for (let x = 0; x < width; x += 1) {
        const s = prevStart + x * 4; const d = x * channels;
        previousRaw[d] = pixels[s]; previousRaw[d + 1] = pixels[s + 1]; previousRaw[d + 2] = pixels[s + 2];
        if (alpha) previousRaw[d + 3] = pixels[s + 3];
      }
    }
    void previous;
    const candidates = [];
    for (const filter of [0, 1, 2]) {
      const out = Buffer.alloc(stride); let cost = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= channels ? scratch[i - channels] : 0;
        const b = y ? previousRaw[i] : 0;
        const value = filter === 0 ? scratch[i] : filter === 1 ? scratch[i] - a : scratch[i] - b;
        out[i] = value & 0xff;
        cost += Math.min(out[i], 256 - out[i]);
      }
      candidates.push({ filter, out, cost });
    }
    const best = candidates.reduce((a, b) => (b.cost < a.cost ? b : a));
    rows[y * (stride + 1)] = best.filter;
    best.out.copy(rows, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
