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
