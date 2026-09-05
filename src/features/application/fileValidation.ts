import { Inflate } from 'fflate';
import { ALLOWED_FILE_TYPES, MAX_FILE_BYTES } from './schema';

export const FILE_REQUIRED_MESSAGE = '이력서를 첨부해주세요.';
export const FILE_SIZE_MESSAGE = '파일은 10MB 이하로 첨부해주세요.';
export const FILE_TYPE_MESSAGE = 'PDF, DOC, DOCX 파일만 첨부할 수 있습니다.';
export const FILE_SIGNATURE_MESSAGE = '파일 내용과 형식이 일치하지 않습니다.';

type AllowedMimeType = keyof typeof ALLOWED_FILE_TYPES;
export type AllowedFileExtension = (typeof ALLOWED_FILE_TYPES)[AllowedMimeType][number];
export type ValidatedApplicationFile = { file: File; extension: AllowedFileExtension; mimeType: AllowedMimeType; originalFilename: string; sizeBytes: number };
export type FileValidationErrorCode = 'FILE_REQUIRED' | 'FILE_TOO_LARGE' | 'FILE_TYPE_INVALID' | 'FILE_SIGNATURE_INVALID';
export type FileValidationResult = { ok: true; value: ValidatedApplicationFile | null } | { ok: false; code: FileValidationErrorCode; message: string };

const MIME_BY_EXTENSION: Record<AllowedFileExtension, AllowedMimeType> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const GENERIC_BROWSER_MIMES = new Set(['', 'application/octet-stream']);
const decoder = new TextDecoder('utf-8', { fatal: true });

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return (dot >= 0 ? name.slice(dot).toLowerCase() : '') as AllowedFileExtension;
}

function ascii(bytes: Uint8Array) {
  return new TextDecoder('latin1').decode(bytes);
}

function validPdf(bytes: Uint8Array) {
  if (bytes.length < 64 || !ascii(bytes.subarray(0, 8)).match(/^%PDF-1\.[0-7]/)) return false;
  const text = ascii(bytes);
  const eof = text.lastIndexOf('%%EOF');
  if (eof < 0 || text.slice(eof + 5).trim() !== '') return false;
  const tail = text.slice(Math.max(0, eof - 1024), eof);
  const startMatch = /startxref\s+(\d+)\s*$/.exec(tail);
  if (!startMatch) return false;
  const xrefOffset = Number(startMatch[1]);
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 8 || xrefOffset >= eof) return false;
  if (text.slice(xrefOffset, xrefOffset + 4) !== 'xref') return false;
  const trailerAt = text.lastIndexOf('trailer', eof);
  const trailer = text.slice(trailerAt, eof);
  if (trailerAt < xrefOffset || !/\/Root\s+\d+\s+\d+\s+R\b/.test(trailer) || /\/Encrypt\b/.test(trailer)) return false;
  const xrefBody = text.slice(xrefOffset + 4, trailerAt);
  const subsection = /\s*(\d+)\s+(\d+)\s*\r?\n/.exec(xrefBody);
  if (!subsection || Number(subsection[2]) < 2) return false;
  const lines = xrefBody.slice(subsection[0].length).split(/\r?\n/).filter(Boolean);
  if (lines.length < Number(subsection[2])) return false;
  for (const line of lines.slice(0, Number(subsection[2]))) {
    const match = /^(\d{10})\s+\d{5}\s+([nf])\s*$/.exec(line);
    if (!match) return false;
    if (match[2] === 'n') {
      const offset = Number(match[1]);
      if (offset <= 0 || offset >= xrefOffset || !/^\d+\s+\d+\s+obj\b/.test(text.slice(offset))) return false;
    }
  }
  return true;
}

const CFB_FREE = 0xffffffff;
const CFB_END = 0xfffffffe;
const CFB_FAT = 0xfffffffd;
const CFB_DIRECTORY_SECTOR_LIMIT = 64;

type CfbDirectoryEntry = { start: number; size: number };

function validDoc(bytes: Uint8Array) {
  if (bytes.length < 1536 || bytes.length % 512 !== 0 || ![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(24, true) !== 0x003e || view.getUint16(26, true) !== 3 || view.getUint16(28, true) !== 0xfffe || view.getUint16(30, true) !== 9 || view.getUint16(32, true) !== 6
    || view.getUint32(40, true) !== 0 || view.getUint32(56, true) !== 4096 || view.getUint32(68, true) !== CFB_END || view.getUint32(72, true) !== 0) return false;
  const sectorSize = 512;
  const sectorCount = Math.floor(bytes.length / sectorSize) - 1;
  const fatSectorCount = view.getUint32(44, true);
  if (fatSectorCount < 1 || fatSectorCount > Math.min(109, sectorCount)) return false;
  const fat: number[] = [];
  const fatSectors = new Set<number>();
  for (let index = 0; index < fatSectorCount; index += 1) {
    const sector = view.getUint32(76 + index * 4, true);
    if (sector >= sectorCount || fatSectors.has(sector)) return false;
    fatSectors.add(sector);
    const fatView = new DataView(bytes.buffer, bytes.byteOffset + ((sector + 1) * sectorSize), sectorSize);
    for (let entry = 0; entry < 128; entry += 1) fat.push(fatView.getUint32(entry * 4, true));
  }
  for (const sector of fatSectors) if (fat[sector] !== CFB_FAT) return false;

  const chain = (start: number, allocationTable: number[], maximumIndex: number, maximumLength: number) => {
    const sectors: number[] = [];
    const seen = new Set<number>();
    let current = start;
    while (current !== CFB_END) {
      if (current === CFB_FREE || current >= maximumIndex || seen.has(current) || sectors.length >= maximumLength) return null;
      seen.add(current); sectors.push(current); current = allocationTable[current] ?? CFB_FREE;
    }
    return sectors;
  };

  const claimedRegularSectors = new Set(fatSectors);
  const claimRegularSectors = (sectors: number[]) => {
    if (sectors.some((sector) => claimedRegularSectors.has(sector))) return false;
    for (const sector of sectors) claimedRegularSectors.add(sector);
    return true;
  };

  const regularChain = (start: number, maximumLength = sectorCount) => chain(start, fat, sectorCount, maximumLength);
  const directoryChain = regularChain(view.getUint32(48, true), CFB_DIRECTORY_SECTOR_LIMIT);
  if (!directoryChain || !claimRegularSectors(directoryChain)) return false;
  const directoryBytes = new Uint8Array(directoryChain.length * sectorSize);
  directoryChain.forEach((sector, index) => directoryBytes.set(bytes.subarray((sector + 1) * sectorSize, (sector + 2) * sectorSize), index * sectorSize));
  const directoryView = new DataView(directoryBytes.buffer);
  const names = new Map<string, CfbDirectoryEntry>();
  let root: CfbDirectoryEntry | null = null;
  for (let offset = 0; offset < directoryBytes.length; offset += 128) {
      const length = directoryView.getUint16(offset + 64, true);
      const type = directoryBytes[offset + 66];
      if (type !== 2 || length < 2 || length > 64 || length % 2 !== 0) continue;
      let name = '';
      for (let char = 0; char < length - 2; char += 2) name += String.fromCharCode(directoryView.getUint16(offset + char, true));
      if (names.has(name) || directoryView.getUint32(offset + 124, true) !== 0) return false;
      names.set(name, { start: directoryView.getUint32(offset + 116, true), size: directoryView.getUint32(offset + 120, true) });
  }
  for (let offset = 0; offset < directoryBytes.length; offset += 128) {
    if (directoryBytes[offset + 66] !== 5) continue;
    const length = directoryView.getUint16(offset + 64, true);
    let name = '';
    for (let char = 0; char < length - 2; char += 2) name += String.fromCharCode(directoryView.getUint16(offset + char, true));
    if (name !== 'Root Entry' || root || directoryView.getUint32(offset + 124, true) !== 0) return false;
    root = { start: directoryView.getUint32(offset + 116, true), size: directoryView.getUint32(offset + 120, true) };
  }
  const word = names.get('WordDocument');
  const tableName = names.has('1Table') ? '1Table' : names.has('0Table') ? '0Table' : null;
  if (!root || !word || !tableName || word.size < 32 || names.get(tableName)!.size < 1) return false;

  const readRegularStream = (entry: CfbDirectoryEntry) => {
    if (entry.size < 1 || entry.size > MAX_FILE_BYTES) return null;
    const sectors = regularChain(entry.start);
    if (!sectors || sectors.length !== Math.ceil(entry.size / sectorSize) || !claimRegularSectors(sectors)) return null;
    const output = new Uint8Array(entry.size);
    sectors.forEach((sector, index) => output.set(bytes.subarray((sector + 1) * sectorSize, Math.min((sector + 2) * sectorSize, (sector + 1) * sectorSize + entry.size - index * sectorSize)), index * sectorSize));
    return output;
  };

  let miniFat: number[] | null = null;
  let rootMiniStream: Uint8Array | null = null;
  const readMiniStream = (entry: CfbDirectoryEntry) => {
    if (entry.size < 1 || entry.size >= 4096 || root.size < 1 || root.size > MAX_FILE_BYTES) return null;
    if (!miniFat || !rootMiniStream) {
      const miniFatSectorCount = view.getUint32(64, true);
      const miniFatChain = regularChain(view.getUint32(60, true), Math.max(1, miniFatSectorCount));
      if (miniFatSectorCount < 1 || !miniFatChain || miniFatChain.length !== miniFatSectorCount || !claimRegularSectors(miniFatChain)) return null;
      miniFat = [];
      for (const sector of miniFatChain) {
        const miniFatView = new DataView(bytes.buffer, bytes.byteOffset + ((sector + 1) * sectorSize), sectorSize);
        for (let index = 0; index < 128; index += 1) miniFat.push(miniFatView.getUint32(index * 4, true));
      }
      rootMiniStream = readRegularStream(root);
      if (!rootMiniStream) return null;
    }
    const miniSectorCount = Math.ceil(rootMiniStream.length / 64);
    const sectors = chain(entry.start, miniFat, miniSectorCount, miniSectorCount);
    if (!sectors || sectors.length !== Math.ceil(entry.size / 64)) return null;
    const output = new Uint8Array(entry.size);
    sectors.forEach((sector, index) => output.set(rootMiniStream!.subarray(sector * 64, Math.min((sector + 1) * 64, sector * 64 + entry.size - index * 64)), index * 64));
    return output;
  };

  const readStream = (entry: CfbDirectoryEntry) => entry.size < 4096 ? readMiniStream(entry) : readRegularStream(entry);
  const wordBytes = readStream(word);
  const tableBytes = readStream(names.get(tableName)!);
  if (!wordBytes || !tableBytes || tableBytes.length < 1) return false;
  const wordView = new DataView(wordBytes.buffer, wordBytes.byteOffset, wordBytes.byteLength);
  if (wordView.getUint16(0, true) !== 0xa5ec) return false;
  const flags = wordView.getUint16(10, true);
  if ((flags & 0x8100) !== 0) return false;
  const usesOneTable = (flags & 0x0200) !== 0;
  return usesOneTable === (tableName === '1Table');
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEocd(bytes: Uint8Array) {
  const start = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) return offset;
  }
  return -1;
}

function inflateBounded(bytes: Uint8Array, expectedSize: number) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  try {
    const inflater = new Inflate((chunk, final) => {
      total += chunk.length;
      if (total > expectedSize) throw new Error('inflated size exceeds declaration');
      chunks.push(chunk.slice());
      finished = final;
    });
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      const end = Math.min(bytes.length, offset + 4096);
      inflater.push(bytes.subarray(offset, end), end === bytes.length);
    }
  } catch { return null; }
  if (!finished || total !== expectedSize) return null;
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function xmlMarkup(bytes: Uint8Array) {
  try {
    const value = decoder.decode(bytes);
    if (/<!DOCTYPE\b|<!ENTITY\b|<!\[CDATA\[/i.test(value)) return null;
    const withoutComments = value.replace(/<!--[\s\S]*?-->/g, '');
    if (withoutComments.includes('<!--') || withoutComments.includes('-->')) return null;
    return withoutComments;
  } catch { return null; }
}

function validDocx(bytes: Uint8Array) {
  if (bytes.length < 22) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  if (eocd < 0 || view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0
    || view.getUint16(eocd + 8, true) !== view.getUint16(eocd + 10, true)
    || eocd + 22 + view.getUint16(eocd + 20, true) !== bytes.length) return false;
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entries < 3 || entries > 128 || centralOffset + centralSize !== eocd) return false;
  const files = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  let localMemberEnd = 0;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== 0x02014b50) return false;
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const hasDataDescriptor = (flags & 8) !== 0;
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || nameLength < 1 || cursor + 46 + nameLength + extraLength + commentLength > eocd) return false;
    let name: string;
    try { name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); } catch { return false; }
    if (name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some((part) => part === '..') || files.has(name)) return false;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > 20 * 1024 * 1024 || uncompressedSize > 16 * 1024 * 1024 || (compressedSize === 0 ? uncompressedSize !== 0 : uncompressedSize / compressedSize > 100)) return false;
    if (localOffset !== localMemberEnd || localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) return false;
    if (view.getUint16(localOffset + 6, true) !== flags || view.getUint16(localOffset + 8, true) !== method) return false;
    const localChecksum = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    if (!hasDataDescriptor && (localChecksum !== checksum || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize)) return false;
    if (hasDataDescriptor && ((localChecksum !== 0 && localChecksum !== checksum)
      || (localCompressedSize !== 0 && localCompressedSize !== compressedSize)
      || (localUncompressedSize !== 0 && localUncompressedSize !== uncompressedSize))) return false;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) return false;
    let localName: string;
    try { localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)); } catch { return false; }
    if (localName !== name) return false;
    let memberEnd = dataEnd;
    if (hasDataDescriptor) {
      if (dataEnd + 12 > centralOffset) return false;
      if (dataEnd + 16 <= centralOffset && view.getUint32(dataEnd, true) === 0x08074b50) {
        if (view.getUint32(dataEnd + 4, true) !== checksum || view.getUint32(dataEnd + 8, true) !== compressedSize || view.getUint32(dataEnd + 12, true) !== uncompressedSize) return false;
        memberEnd += 16;
      } else {
        if (view.getUint32(dataEnd, true) !== checksum || view.getUint32(dataEnd + 4, true) !== compressedSize || view.getUint32(dataEnd + 8, true) !== uncompressedSize) return false;
        memberEnd += 12;
      }
    }
    if (memberEnd > centralOffset) return false;
    let data: Uint8Array;
    if (method === 0) data = bytes.slice(dataStart, dataEnd);
    else {
      const inflated = inflateBounded(bytes.subarray(dataStart, dataEnd), uncompressedSize);
      if (!inflated) return false;
      data = inflated;
    }
    if (data.length !== uncompressedSize || crc32(data) !== checksum) return false;
    files.set(name, data);
    localMemberEnd = memberEnd;
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== eocd || localMemberEnd !== centralOffset || !files.has('[Content_Types].xml') || !files.has('_rels/.rels') || !files.has('word/document.xml')) return false;
  const contentTypes = xmlMarkup(files.get('[Content_Types].xml')!);
  const relationships = xmlMarkup(files.get('_rels/.rels')!);
  const document = xmlMarkup(files.get('word/document.xml')!);
  if (!contentTypes || !relationships || !document) return false;
  return /<Override\b(?=[^>]*\bPartName=["']\/word\/document\.xml["'])(?=[^>]*\bContentType=["']application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml["'])[^>]*\/?\s*>/i.test(contentTypes)
    && /<Relationship\b(?=[^>]*\bType=["']http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/officeDocument["'])(?=[^>]*\bTarget=["']\/?word\/document\.xml["'])(?![^>]*\bTargetMode=["']External["'])[^>]*\/?\s*>/i.test(relationships)
    && /<w:document\b/.test(document)
    && /xmlns:w=["']http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main["']/.test(document)
    && /<\/w:document\s*>/.test(document);
}

function signatureMatches(bytes: Uint8Array, extension: AllowedFileExtension) {
  if (extension === '.pdf') return validPdf(bytes);
  if (extension === '.doc') return validDoc(bytes);
  if (extension === '.docx') return validDocx(bytes);
  return false;
}

export function sanitizeOriginalFilename(name: string, extension: AllowedFileExtension) {
  const basename = name.normalize('NFKC').split(/[\\/]/).at(-1) ?? '';
  const cleanedBase = basename.slice(0, Math.max(0, basename.length - extension.length))
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '_')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim() || 'upload';
  const maximumBaseCharacters = 255 - Array.from(extension).length;
  return `${Array.from(cleanedBase).slice(0, maximumBaseCharacters).join('')}${extension}`;
}

export async function validateApplicationFile(file: File | null, options: { required: boolean }): Promise<FileValidationResult> {
  if (!file) return options.required ? { ok: false, code: 'FILE_REQUIRED', message: FILE_REQUIRED_MESSAGE } : { ok: true, value: null };
  if (file.size > MAX_FILE_BYTES) return { ok: false, code: 'FILE_TOO_LARGE', message: FILE_SIZE_MESSAGE };
  const extension = fileExtension(file.name);
  const canonicalMime = MIME_BY_EXTENSION[extension];
  if (!canonicalMime || (!GENERIC_BROWSER_MIMES.has(file.type) && file.type !== canonicalMime)) return { ok: false, code: 'FILE_TYPE_INVALID', message: FILE_TYPE_MESSAGE };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!signatureMatches(bytes, extension)) return { ok: false, code: 'FILE_SIGNATURE_INVALID', message: FILE_SIGNATURE_MESSAGE };
  } catch { return { ok: false, code: 'FILE_SIGNATURE_INVALID', message: FILE_SIGNATURE_MESSAGE }; }
  return { ok: true, value: { file, extension, mimeType: canonicalMime, originalFilename: sanitizeOriginalFilename(file.name, extension), sizeBytes: file.size } };
}
