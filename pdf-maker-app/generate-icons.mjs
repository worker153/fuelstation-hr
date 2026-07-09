// Generates solid-colour PNG icons for the PWA without any extra dependencies.
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

function solidPng(size, r, g, b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const rows = [];
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0; // filter = None
  for (let x = 0; x < size; x++) {
    row[1 + x * 3]     = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  for (let y = 0; y < size; y++) rows.push(row);
  const raw = Buffer.concat(rows);
  const idat = deflateSync(raw);

  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.concat([t, data]);
    let crc = 0xffffffff;
    for (const byte of crcBuf) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const crcOut = Buffer.alloc(4); crcOut.writeUInt32BE(crc);
    return Buffer.concat([len, t, data, crcOut]);
  }

  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n'),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
// Sage Energy green: #16a34a  = rgb(22, 163, 74)
writeFileSync('public/pwa-64x64.png',     solidPng(64,  22, 163, 74));
writeFileSync('public/pwa-192x192.png',   solidPng(192, 22, 163, 74));
writeFileSync('public/pwa-512x512.png',   solidPng(512, 22, 163, 74));
writeFileSync('public/apple-touch-icon.png', solidPng(180, 22, 163, 74));
console.log('Icons generated in public/');
