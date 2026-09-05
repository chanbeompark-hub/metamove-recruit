import { describe, expect, it } from 'vitest';
import {
  validDocBytes,
  validDocxBytes,
  validEncryptedDocBytes,
  validMiniStreamDocBytes,
  validPdfBytes,
} from '../../test/fixtures/documents';
import { MAX_FILE_BYTES } from './schema';
import {
  FILE_REQUIRED_MESSAGE, FILE_SIGNATURE_MESSAGE, FILE_SIZE_MESSAGE, FILE_TYPE_MESSAGE,
  validateApplicationFile,
} from './fileValidation';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function eocdOffset(bytes: Uint8Array) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true) === 0x06054b50) return offset;
  }
  throw new Error('fixture has no EOCD');
}

function prefixedDocxPolyglot(bytes: Uint8Array) {
  const prefix = new Uint8Array([0x4d, 0x5a]);
  const output = new Uint8Array(prefix.length + bytes.length);
  output.set(prefix);
  output.set(bytes, prefix.length);
  const view = new DataView(output.buffer);
  const eocd = eocdOffset(output);
  const centralOffset = view.getUint32(eocd + 16, true);
  const entries = view.getUint16(eocd + 10, true);
  view.setUint32(eocd + 16, centralOffset + prefix.length, true);
  let cursor = centralOffset + prefix.length;
  for (let index = 0; index < entries; index += 1) {
    view.setUint32(cursor + 42, view.getUint32(cursor + 42, true) + prefix.length, true);
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  return output;
}

function docxWithUnreferencedLocalGap(bytes: Uint8Array) {
  const eocd = eocdOffset(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralOffset = view.getUint32(eocd + 16, true);
  const output = new Uint8Array(bytes.length + 1);
  output.set(bytes.subarray(0, centralOffset));
  output[centralOffset] = 0;
  output.set(bytes.subarray(centralOffset), centralOffset + 1);
  new DataView(output.buffer).setUint32(eocd + 1 + 16, centralOffset + 1, true);
  return output;
}

function docxWithOutOfOrderCentralMembers(bytes: Uint8Array) {
  const output = bytes.slice();
  const view = new DataView(output.buffer);
  const eocd = eocdOffset(output);
  const centralOffset = view.getUint32(eocd + 16, true);
  const firstLength = 46 + view.getUint16(centralOffset + 28, true) + view.getUint16(centralOffset + 30, true) + view.getUint16(centralOffset + 32, true);
  const secondOffset = centralOffset + firstLength;
  const secondLength = 46 + view.getUint16(secondOffset + 28, true) + view.getUint16(secondOffset + 30, true) + view.getUint16(secondOffset + 32, true);
  const first = output.slice(centralOffset, secondOffset);
  const second = output.slice(secondOffset, secondOffset + secondLength);
  output.set(second, centralOffset);
  output.set(first, centralOffset + secondLength);
  return output;
}

function docxWithSignedDataDescriptors(bytes: Uint8Array) {
  const sourceView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = eocdOffset(bytes);
  const centralOffset = sourceView.getUint32(eocd + 16, true);
  const entries = sourceView.getUint16(eocd + 10, true);
  const locals: Uint8Array[] = [];
  const localOffsets: number[] = [];
  let centralCursor = centralOffset;
  let outputOffset = 0;
  for (let index = 0; index < entries; index += 1) {
    const localOffset = sourceView.getUint32(centralCursor + 42, true);
    const localNameLength = sourceView.getUint16(localOffset + 26, true);
    const localExtraLength = sourceView.getUint16(localOffset + 28, true);
    const compressedSize = sourceView.getUint32(centralCursor + 20, true);
    const localEnd = localOffset + 30 + localNameLength + localExtraLength + compressedSize;
    const descriptor = new Uint8Array(16);
    const descriptorView = new DataView(descriptor.buffer);
    descriptorView.setUint32(0, 0x08074b50, true);
    descriptorView.setUint32(4, sourceView.getUint32(centralCursor + 16, true), true);
    descriptorView.setUint32(8, compressedSize, true);
    descriptorView.setUint32(12, sourceView.getUint32(centralCursor + 24, true), true);
    const member = bytes.slice(localOffset, localEnd);
    new DataView(member.buffer).setUint16(6, sourceView.getUint16(localOffset + 6, true) | 8, true);
    new DataView(member.buffer).setUint32(14, 0, true);
    new DataView(member.buffer).setUint32(18, 0, true);
    new DataView(member.buffer).setUint32(22, 0, true);
    localOffsets.push(outputOffset);
    locals.push(member, descriptor);
    outputOffset += member.length + descriptor.length;
    centralCursor += 46 + sourceView.getUint16(centralCursor + 28, true) + sourceView.getUint16(centralCursor + 30, true) + sourceView.getUint16(centralCursor + 32, true);
  }
  const central = bytes.slice(centralOffset, eocd);
  const centralView = new DataView(central.buffer);
  centralCursor = 0;
  for (let index = 0; index < entries; index += 1) {
    centralView.setUint16(centralCursor + 8, centralView.getUint16(centralCursor + 8, true) | 8, true);
    centralView.setUint32(centralCursor + 42, localOffsets[index], true);
    centralCursor += 46 + centralView.getUint16(centralCursor + 28, true) + centralView.getUint16(centralCursor + 30, true) + centralView.getUint16(centralCursor + 32, true);
  }
  const end = bytes.slice(eocd);
  new DataView(end.buffer).setUint32(16, outputOffset, true);
  const output = new Uint8Array(outputOffset + central.length + end.length);
  let cursor = 0;
  for (const local of locals) {
    output.set(local, cursor);
    cursor += local.length;
  }
  output.set(central, cursor);
  output.set(end, cursor + central.length);
  return output;
}

describe('validateApplicationFile', () => {
  it.each([
    ['resume.pdf', 'application/pdf', validPdfBytes(), '.pdf'],
    ['resume.doc', 'application/msword', validDocBytes(), '.doc'],
    ['resume.docx', DOCX_MIME, validDocxBytes(), '.docx'],
  ])('accepts a structurally valid %s and stores the canonical MIME', async (name, type, bytes, extension) => {
    const result = await validateApplicationFile(new File([bytes], name, { type }), { required: true });
    expect(result).toMatchObject({ ok: true, value: { extension, mimeType: type, originalFilename: name, sizeBytes: bytes.byteLength } });
  });

  it.each([['empty MIME', ''], ['generic browser MIME', 'application/octet-stream']])('accepts %s only after authoritative format detection', async (_label, type) => {
    const result = await validateApplicationFile(new File([validPdfBytes()], 'resume.pdf', { type }), { required: true });
    expect(result).toMatchObject({ ok: true, value: { mimeType: 'application/pdf' } });
  });

  it('rejects an executable renamed and declared as a PDF', async () => {
    await expect(validateApplicationFile(new File(['MZ executable'], 'resume.pdf', { type: 'application/pdf' }), { required: true })).resolves.toEqual({ ok: false, code: 'FILE_SIGNATURE_INVALID', message: FILE_SIGNATURE_MESSAGE });
  });

  it.each([
    ['prefix-only PDF', new TextEncoder().encode('%PDF-1.7 fabricated')],
    ['PDF with forged EOF but no xref', new TextEncoder().encode('%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF')],
    ['encrypted PDF', new TextEncoder().encode('%PDF-1.7\n/Encrypt\nstartxref\n0\n%%EOF')],
  ])('rejects a %s', async (_label, bytes) => {
    await expect(validateApplicationFile(new File([bytes], 'resume.pdf', { type: 'application/pdf' }), { required: true })).resolves.toMatchObject({ ok: false, code: 'FILE_SIGNATURE_INVALID' });
  });

  it('accepts literal /Encrypt text when the PDF trailer has no encryption dictionary', async () => {
    await expect(validateApplicationFile(new File(
      [validPdfBytes({ literalEncryptText: true })],
      'resume.pdf',
      { type: 'application/pdf' },
    ), { required: true })).resolves.toMatchObject({ ok: true });
  });

  it('rejects a structurally valid PDF whose trailer declares encryption', async () => {
    await expect(validateApplicationFile(new File(
      [validPdfBytes({ encrypted: true })],
      'resume.pdf',
      { type: 'application/pdf' },
    ), { required: true })).resolves.toMatchObject({ ok: false, code: 'FILE_SIGNATURE_INVALID' });
  });

  it('rejects a matching signature when extension and declared MIME disagree', async () => {
    await expect(validateApplicationFile(new File([validPdfBytes()], 'resume.doc', { type: 'application/pdf' }), { required: true })).resolves.toEqual({ ok: false, code: 'FILE_TYPE_INVALID', message: FILE_TYPE_MESSAGE });
  });

  it('rejects XLS/PPT/generic OLE containers without the required Word streams', async () => {
    const genericOle = validDocBytes();
    genericOle.fill(0, 512 + 128, 512 + 256);
    await expect(validateApplicationFile(new File([genericOle], 'resume.doc', { type: 'application/msword' }), { required: true })).resolves.toMatchObject({ ok: false, code: 'FILE_SIGNATURE_INVALID' });
  });

  it('rejects a Word binary whose required streams overlap the same CFB sectors', async () => {
    const overlappingStreams = validDocBytes();
    new DataView(overlappingStreams.buffer).setUint32((512 + 256) + 116, 1, true);

    await expect(validateApplicationFile(new File(
      [overlappingStreams],
      'resume.doc',
      { type: 'application/msword' },
    ), { required: true })).resolves.toMatchObject({ ok: false, code: 'FILE_SIGNATURE_INVALID' });
  });

  it('accepts a Word binary whose table stream uses the CFB mini stream', async () => {
    await expect(validateApplicationFile(new File(
      [validMiniStreamDocBytes()],
      'resume.doc',
      { type: 'application/msword' },
    ), { required: true })).resolves.toMatchObject({ ok: true });
  });

  it('rejects an encrypted Word binary document', async () => {
    await expect(validateApplicationFile(new File(
      [validEncryptedDocBytes()],
      'resume.doc',
      { type: 'application/msword' },
    ), { required: true })).resolves.toMatchObject({ ok: false, code: 'FILE_SIGNATURE_INVALID' });
  });

  it.each([
    ['missing OPC entries', validDocxBytes().slice(0, 100)],
    ['path traversal', validDocxBytes([['../escape.xml', 'bad']])],
    ['duplicate required entry', validDocxBytes([['word/document.xml', '<w:document/>']])],
  ])('rejects a DOCX with %s', async (_label, bytes) => {
    await expect(validateApplicationFile(new File([bytes], 'resume.docx', { type: DOCX_MIME }), { required: true })).resolves.toMatchObject({ ok: false, code: 'FILE_SIGNATURE_INVALID' });
  });

  it('accepts an otherwise valid DOCX that uses signed ZIP data descriptors', async () => {
    await expect(validateApplicationFile(new File(
      [docxWithSignedDataDescriptors(validDocxBytes())],
      'resume.docx',
      { type: DOCX_MIME },
    ), { required: true })).resolves.toMatchObject({ ok: true, value: { mimeType: DOCX_MIME } });
  });

  it.each([
    ['MZ-prefixed DOCX polyglot', prefixedDocxPolyglot(validDocxBytes())],
    ['unreferenced bytes between the last member and the central directory', docxWithUnreferencedLocalGap(validDocxBytes())],
    ['central-directory members that reference overlapping/out-of-order local regions', docxWithOutOfOrderCentralMembers(validDocxBytes())],
  ])('rejects a DOCX with %s', async (_label, bytes) => {
    await expect(validateApplicationFile(new File([bytes], 'resume.docx', { type: DOCX_MIME }), { required: true })).resolves.toMatchObject({ ok: false, code: 'FILE_SIGNATURE_INVALID' });
  });

  it('rejects a file larger than 10 MiB before reading its contents', async () => {
    await expect(validateApplicationFile(new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'resume.pdf', { type: 'application/pdf' }), { required: true })).resolves.toEqual({ ok: false, code: 'FILE_TOO_LARGE', message: FILE_SIZE_MESSAGE });
  });

  it('requires a resume and permits a missing optional portfolio', async () => {
    await expect(validateApplicationFile(null, { required: true })).resolves.toEqual({ ok: false, code: 'FILE_REQUIRED', message: FILE_REQUIRED_MESSAGE });
    await expect(validateApplicationFile(null, { required: false })).resolves.toEqual({ ok: true, value: null });
  });

  it('removes path, control, format, separator, and bidi characters while preserving the extension', async () => {
    const file = new File([validPdfBytes()], '..\\private/path\u0000re\u202Esume\u2028.pdf', { type: 'application/pdf' });
    const result = await validateApplicationFile(file, { required: true });
    expect(result).toMatchObject({ ok: true, value: { originalFilename: 'path_re_sume_.pdf', extension: '.pdf' } });
  });
});
