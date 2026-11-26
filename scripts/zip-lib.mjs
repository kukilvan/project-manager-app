// Zip writer and reader over Node's zlib: deterministic archives (entries sorted by name, fixed timestamps), no `zip` program needed.
// Used by scripts/nas-pack.mjs for the release `nas-build` (spec 4 § 4), by tools/pb-dev.mjs to unpack PocketBase, and by the Drive zip of the job runner (ticket 12).
// Limits: no zip64 (each file and the archive under 4 GB, at most 65,535 entries); entries are files only, folders are implied by the names.
//
// Contents:
// - crc32() — the CRC-32 of a buffer (zip's checksum)
// - zip(files) — { 'path/in/zip': Buffer|string } → a zip Buffer; the same input always gives the same bytes
// - unzip(buf) — a zip Buffer → { name: Buffer } (stored and deflated entries), each entry's CRC checked
// - filesOf(dir, prefix, skip) — the files of a folder as { 'prefix/relative/path': Buffer }, for zip()
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 1980-01-01 00:00, the earliest DOS date: every entry gets it, so the bytes do not depend on when or where the files were made
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

// Files → a zip Buffer. Names use forward slashes, sorted by code point; data is deflated at level 9 unless that does not make it smaller.
export function zip(files) {
  const names = Object.keys(files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (names.length > 0xffff) throw new Error(`zip-lib: ${names.length} entries is over the 65,535 a zip without zip64 holds`);
  const locals = [];
  const central = [];
  let offset = 0;
  for (const name of names) {
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error(`zip-lib: bad entry name ${JSON.stringify(name)}`);
    const data = Buffer.isBuffer(files[name]) ? files[name] : Buffer.from(String(files[name]), 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');
    if (data.length > 0xfffffffe || offset + 30 + nameBuf.length + body.length > 0xfffffffe) throw new Error(`zip-lib: ${name} makes the archive over 4 GB`);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);              // version needed: 2.0 (deflate)
    head.writeUInt16LE(UTF8_FLAG, 6);
    head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt16LE(DOS_TIME, 10);
    head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);               // made by: MS-DOS / FAT, so no Unix permission bits are carried
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(UTF8_FLAG, 8);
    dir.writeUInt16LE(stored ? 0 : 8, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);          // extra, comment, disk, attributes stay 0
    locals.push(head, nameBuf, body);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// A zip Buffer → { name: Buffer } (stored and deflated entries; folder entries skipped). Sizes and CRC come from the central directory.
export function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('zip-lib: not a zip file');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip-lib: broken zip directory');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28); const extraLen = buf.readUInt16LE(p + 30); const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (method !== 0 && method !== 8) throw new Error(`zip-lib: unsupported zip method ${method} for ${name}`);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (crc32(data) !== crc) throw new Error(`zip-lib: CRC mismatch for ${name}`);
    out[name] = data;
  }
  return out;
}

// The files under dir as { `${prefix}${relative path with /}`: Buffer }. skip(rel) → true leaves a file or folder out; symbolic links are left out.
export function filesOf(dir, prefix = '', skip = () => false) {
  const out = {};
  const walk = (abs, rel) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (skip(r, ent)) continue;
      const a = path.join(abs, ent.name);
      if (ent.isDirectory()) walk(a, r);
      else if (ent.isFile()) out[`${prefix}${r}`] = fs.readFileSync(a);
    }
  };
  walk(dir, '');
  return out;
}
