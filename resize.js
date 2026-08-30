const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const cc = Buffer.concat([t, data]);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(cc));
  return Buffer.concat([len, cc, cr]);
}

// full PNG decode
function decodePNG(buf) {
  let pos = 8, idat = [], ihdr = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  const W = ihdr.readUInt32BE(0), H = ihdr.readUInt32BE(4), depth = ihdr[8], color = ihdr[9];
  const bpp = color === 6 ? 4 : color === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * bpp;
  const px = Buffer.alloc(W * H * bpp);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < bpp; c++) {
        const cur = row[x * bpp + c];
        const a = x > 0 ? px[y * stride + (x - 1) * bpp + c] : 0;
        const b = y > 0 ? px[(y - 1) * stride + x * bpp + c] : 0;
        const cc = (x > 0 && y > 0) ? px[(y - 1) * stride + (x - 1) * bpp + c] : 0;
        let v = cur;
        if (f === 1) v = (cur + a) & 255;
        else if (f === 2) v = (cur + b) & 255;
        else if (f === 3) v = (cur + ((a + b) >> 1)) & 255;
        else if (f === 4) {
          const p = a + b - cc;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
          const pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : cc);
          v = (cur + pred) & 255;
        }
        px[y * stride + x * bpp + c] = v;
      }
    }
  }
  return { W, H, bpp, px };
}

function encodePNG(W, H, bpp, px) {
  const stride = W * bpp + 1;
  const filtered = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    filtered[y * stride] = 0;
    px.copy(filtered, y * stride + 1, y * W * bpp, (y + 1) * W * bpp);
  }
  const idat = zlib.deflateSync(filtered);
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4);
  ih[8] = 8; ih[9] = bpp === 4 ? 6 : bpp === 3 ? 2 : 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const src = decodePNG(fs.readFileSync('desktop/icon.png'));
console.log('source', src.W + 'x' + src.H, 'bpp', src.bpp);

const S = 512;
const out = Buffer.alloc(S * S * src.bpp);
const scale = src.W / S;
// box average for quality
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const x0 = Math.floor(x * scale), x1 = Math.min(src.W - 1, Math.floor((x + 1) * scale));
    const y0 = Math.floor(y * scale), y1 = Math.min(src.H - 1, Math.floor((y + 1) * scale));
    for (let c = 0; c < src.bpp; c++) {
      let sum = 0, cnt = 0;
      for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
        sum += src.px[sy * src.W * src.bpp + sx * src.bpp + c];
        cnt++;
      }
      out[(y * S + x) * src.bpp + c] = Math.round(sum / cnt);
    }
  }
}
const png = encodePNG(S, S, src.bpp, out);
fs.writeFileSync('desktop/icon-512.png', png);
console.log('wrote desktop/icon-512.png', png.length, S + 'x' + S);
process.exit(0);