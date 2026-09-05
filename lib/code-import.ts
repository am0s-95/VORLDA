import { CODE_BYTES, CODE_FILES, codePath, encodeCodeFile, excludedCodePath, validateCodeProject, type CodeProject } from './code-project.ts';
export type ImportedFile = { path: string; bytes: Uint8Array };
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const b of bytes) { crc ^= b; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }

// The central directory is validated before inflation. Never extract to disk.
export async function readCodeZip(buffer: ArrayBuffer): Promise<ImportedFile[]> {
  if (buffer.byteLength > 12_000_000 || buffer.byteLength < 22) throw Error('ZIP size is invalid (12 MB compressed maximum).');
  const bytes = new Uint8Array(buffer), v = new DataView(buffer); let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  if (end < 0 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || v.getUint16(end + 8, true) !== v.getUint16(end + 10, true)) throw Error('Only a single-disk ZIP32 archive is supported.');
  const count = v.getUint16(end + 10, true), centralSize = v.getUint32(end + 12, true), centralOffset = v.getUint32(end + 16, true);
  if (count > 5000 || centralOffset + centralSize !== end) throw Error('Unsupported ZIP directory or too many entries.');
  const entries: { path: string; start: number; compressed: number; size: number; method: number; crc: number }[] = [], seen = new Set<string>();
  let offset = centralOffset, total = 0, retained = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || v.getUint32(offset, true) !== 0x02014b50) throw Error('Corrupt ZIP directory.');
    const flags = v.getUint16(offset + 8, true), method = v.getUint16(offset + 10, true), crc = v.getUint32(offset + 16, true), compressed = v.getUint32(offset + 20, true), size = v.getUint32(offset + 24, true), names = v.getUint16(offset + 28, true), extra = v.getUint16(offset + 30, true), comment = v.getUint16(offset + 32, true), local = v.getUint32(offset + 42, true);
    if (offset + 46 + names + extra + comment > end || !names || v.getUint16(offset + 34, true) || flags & ~0x80e || ![0, 8].includes(method) || [size, compressed, local].includes(0xffffffff)) throw Error('Encrypted, ZIP64 or unsupported ZIP entry.');
    const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + names)), directory = path.endsWith('/'); codePath(directory ? path.slice(0, -1) : path);
    const mode = v.getUint32(offset + 38, true) >>> 16;
    if ((mode & 0xf000) === 0xa000 || (mode & 0xf000) && ![0x8000, 0x4000].includes(mode & 0xf000)) throw Error('ZIP links and special files are not supported.');
    const key = path.normalize('NFC').toLowerCase(); if (seen.has(key)) throw Error('Duplicate ZIP path.'); seen.add(key);
    if (local + 30 > centralOffset || v.getUint32(local, true) !== 0x04034b50 || v.getUint16(local + 6, true) !== flags || v.getUint16(local + 8, true) !== method) throw Error('ZIP header mismatch.');
    const localNames = v.getUint16(local + 26, true), start = local + 30 + localNames + v.getUint16(local + 28, true);
    if (start + compressed > centralOffset || decoder.decode(bytes.subarray(local + 30, local + 30 + localNames)) !== path) throw Error('ZIP path or data range mismatch.');
    if (!directory && !excludedCodePath(path)) { total += size; if (size > CODE_BYTES || total > CODE_BYTES + 512000 || ++retained > CODE_FILES + 3) throw Error('Source exceeds 2 MB / 400 files. Remove generated dependencies or split the project.'); entries.push({ path, start, compressed, size, method, crc }); }
    else if (!directory) entries.push({ path, start: 0, compressed: 0, size: -1, method: 0, crc: 0 });
    offset += 46 + names + extra + comment;
  }
  if (offset !== end) throw Error('ZIP directory length mismatch.');
  const result: ImportedFile[] = [];
  for (const e of entries) {
    if (e.size === -1) { result.push({ path: e.path, bytes: new Uint8Array() }); continue; }
    let data = bytes.slice(e.start, e.start + e.compressed);
    if (e.method === 8) {
      const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(); const chunks: Uint8Array[] = []; let length = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > e.size || length > CODE_BYTES) throw Error('ZIP inflation exceeds declared size.'); chunks.push(value); } }
      finally { await reader.cancel().catch(() => {}); }
      data = new Uint8Array(length); let at = 0; for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
    }
    if (data.length !== e.size || crc32(data) !== e.crc) throw Error('ZIP data length or checksum mismatch.');
    result.push({ path: e.path, bytes: data });
  }
  return result;
}

export function importCodeFiles(input: ImportedFile[]) {
  if (input.length > 5000) throw Error('Too many archive entries.');
  const prefix = ''; // ZIP paths are preserved; folder uploads remove only the chosen outer folder in the UI.
  const skipped: string[] = [], files = [], paths = new Set<string>(); let tasks: CodeProject['tasks'] = [];
  for (const f of input) {
    codePath(f.path); const path = f.path.slice(prefix.length); codePath(path);
    const key = path.normalize('NFC').toLowerCase(); if (paths.has(key)) throw Error('Duplicate source file.'); paths.add(key);
    if (excludedCodePath(path)) { skipped.push(path); continue; }
    if (path === 'vorlda-tools/manifest.json') { const m = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(f.bytes)); if (m.version !== 1 || !Array.isArray(m.tasks)) throw Error('Invalid VORLDA task manifest.'); tasks = m.tasks; skipped.push(path); continue; }
    if (path.startsWith('vorlda-tools/')) { skipped.push(path); continue; }
    files.push(encodeCodeFile(path, f.bytes));
  }
  if (!files.length) throw Error('No source files remain after exclusions.');
  return { project: validateCodeProject({ version: 1, files, tasks }), skipped, root: prefix };
}
