const encoder = new TextEncoder();

function ascii(value: string) {
  return encoder.encode(value);
}

function concat(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<[string, string]>) {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = ascii(name);
    const data = ascii(text);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc32(data), true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc32(data), true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = concat(...centrals);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, centralDirectory.length, true);
  view.setUint32(16, offset, true);
  return concat(...locals, centralDirectory, end);
}

export function validPdfBytes(options: { encrypted?: boolean; literalEncryptText?: boolean } = {}) {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n',
  ];
  if (options.literalEncryptText) {
    objects.push('4 0 obj\n<< /Length 8 >>\nstream\n/Encrypt\nendstream\nendobj\n');
  }
  if (options.encrypted) {
    objects.push(`${objects.length + 1} 0 obj\n<< /Filter /Standard /V 1 /R 2 /O () /U () /P -4 >>\nendobj\n`);
  }
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(ascii(body).length);
    body += object;
  }
  const xrefOffset = ascii(body).length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}`;
  const encryptReference = options.encrypted ? ` /Encrypt ${objects.length} 0 R` : '';
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encryptReference} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return ascii(body);
}

export function validDocxBytes(extraEntries: Array<[string, string]> = []) {
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>'],
    ...extraEntries,
  ]);
}

function directoryEntry(name: string, type: number, startSector: number, size: number) {
  const entry = new Uint8Array(128);
  const view = new DataView(entry.buffer);
  const encoded = new Uint8Array((name.length + 1) * 2);
  for (let index = 0; index < name.length; index += 1) {
    encoded[index * 2] = name.charCodeAt(index);
  }
  entry.set(encoded.slice(0, 64));
  view.setUint16(64, Math.min(encoded.length, 64), true);
  entry[66] = type;
  entry[67] = 1;
  view.setUint32(68, 0xffffffff, true);
  view.setUint32(72, 0xffffffff, true);
  view.setUint32(76, 0xffffffff, true);
  view.setUint32(116, startSector >>> 0, true);
  view.setUint32(120, size, true);
  return entry;
}

export function validDocBytes(tableName: '0Table' | '1Table' = '1Table') {
  const sectorSize = 512;
  const sectorCount = 18;
  const output = new Uint8Array(sectorSize * (sectorCount + 1));
  const header = new DataView(output.buffer, 0, sectorSize);
  output.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  header.setUint16(24, 0x003e, true);
  header.setUint16(26, 0x0003, true);
  header.setUint16(28, 0xfffe, true);
  header.setUint16(30, 9, true);
  header.setUint16(32, 6, true);
  header.setUint32(44, 1, true);
  header.setUint32(48, 0, true);
  header.setUint32(56, 4096, true);
  header.setUint32(60, 0xfffffffe, true);
  header.setUint32(68, 0xfffffffe, true);
  header.setUint32(72, 0, true);
  for (let index = 0; index < 109; index += 1) header.setUint32(76 + (index * 4), 0xffffffff, true);
  header.setUint32(76, 17, true);

  const directory = output.subarray(sectorSize, sectorSize * 2);
  directory.set(directoryEntry('Root Entry', 5, 0xfffffffe, 0), 0);
  directory.set(directoryEntry('WordDocument', 2, 1, 4096), 128);
  directory.set(directoryEntry(tableName, 2, 9, 4096), 256);
  const word = output.subarray(sectorSize * 2, sectorSize * 10);
  word[0] = 0xec;
  word[1] = 0xa5;
  word[2] = 0xc1;
  word[3] = 0x00;
  const flags = tableName === '1Table' ? 0x0200 : 0;
  new DataView(word.buffer, word.byteOffset).setUint16(10, flags, true);

  const fat = new DataView(output.buffer, sectorSize * 18, sectorSize);
  fat.setUint32(0, 0xfffffffe, true);
  for (let sector = 1; sector <= 8; sector += 1) fat.setUint32(sector * 4, sector === 8 ? 0xfffffffe : sector + 1, true);
  for (let sector = 9; sector <= 16; sector += 1) fat.setUint32(sector * 4, sector === 16 ? 0xfffffffe : sector + 1, true);
  fat.setUint32(17 * 4, 0xfffffffd, true);
  for (let sector = 18; sector < 128; sector += 1) fat.setUint32(sector * 4, 0xffffffff, true);
  return output;
}

export function validEncryptedDocBytes() {
  const output = validDocBytes();
  const word = new DataView(output.buffer, 512 * 2, 512 * 8);
  word.setUint16(10, word.getUint16(10, true) | 0x0100, true);
  return output;
}

export function validMiniStreamDocBytes() {
  const sectorSize = 512;
  const sectorCount = 13;
  const output = new Uint8Array(sectorSize * (sectorCount + 1));
  const header = new DataView(output.buffer, 0, sectorSize);
  output.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  header.setUint16(24, 0x003e, true);
  header.setUint16(26, 0x0003, true);
  header.setUint16(28, 0xfffe, true);
  header.setUint16(30, 9, true);
  header.setUint16(32, 6, true);
  header.setUint32(44, 1, true);
  header.setUint32(48, 0, true);
  header.setUint32(56, 4096, true);
  header.setUint32(60, 11, true);
  header.setUint32(64, 1, true);
  header.setUint32(68, 0xfffffffe, true);
  for (let index = 0; index < 109; index += 1) header.setUint32(76 + (index * 4), 0xffffffff, true);
  header.setUint32(76, 12, true);

  const directory = output.subarray(sectorSize, sectorSize * 2);
  directory.set(directoryEntry('Root Entry', 5, 9, 1024), 0);
  directory.set(directoryEntry('WordDocument', 2, 1, 4096), 128);
  directory.set(directoryEntry('1Table', 2, 15, 64), 256);

  const word = output.subarray(sectorSize * 2, sectorSize * 10);
  word[0] = 0xec;
  word[1] = 0xa5;
  word[2] = 0xc1;
  word[3] = 0x00;
  new DataView(word.buffer, word.byteOffset).setUint16(10, 0x0200, true);

  const rootMiniStream = output.subarray(sectorSize * 10, sectorSize * 12);
  rootMiniStream[15 * 64] = 1;

  const miniFat = new DataView(output.buffer, sectorSize * 12, sectorSize);
  for (let index = 0; index < 128; index += 1) miniFat.setUint32(index * 4, 0xffffffff, true);
  miniFat.setUint32(15 * 4, 0xfffffffe, true);

  const fat = new DataView(output.buffer, sectorSize * 13, sectorSize);
  fat.setUint32(0, 0xfffffffe, true);
  for (let sector = 1; sector <= 8; sector += 1) fat.setUint32(sector * 4, sector === 8 ? 0xfffffffe : sector + 1, true);
  fat.setUint32(9 * 4, 10, true);
  fat.setUint32(10 * 4, 0xfffffffe, true);
  fat.setUint32(11 * 4, 0xfffffffe, true);
  fat.setUint32(12 * 4, 0xfffffffd, true);
  for (let sector = 13; sector < 128; sector += 1) fat.setUint32(sector * 4, 0xffffffff, true);
  return output;
}
