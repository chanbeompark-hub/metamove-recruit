import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES } from './schema';
import {
  FILE_REQUIRED_MESSAGE,
  FILE_SIGNATURE_MESSAGE,
  FILE_SIZE_MESSAGE,
  FILE_TYPE_MESSAGE,
  validateApplicationFile,
} from './fileValidation';

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const DOC_HEADER = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function docxBytes() {
  return new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...new TextEncoder().encode('[Content_Types].xml'),
    ...new TextEncoder().encode('word/document.xml'),
  ]);
}

describe('validateApplicationFile', () => {
  it.each([
    ['resume.pdf', 'application/pdf', PDF_HEADER, '.pdf'],
    ['resume.doc', 'application/msword', DOC_HEADER, '.doc'],
    [
      'resume.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      docxBytes(),
      '.docx',
    ],
  ])('accepts a matching %s declaration and signature', async (name, type, bytes, extension) => {
    const file = new File([bytes], name, { type });

    const result = await validateApplicationFile(file, { required: true });

    expect(result).toMatchObject({
      ok: true,
      value: {
        extension,
        mimeType: type,
        originalFilename: name,
        sizeBytes: bytes.byteLength,
      },
    });
  });

  it('rejects an executable renamed and declared as a PDF', async () => {
    const file = new File(['MZ executable'], 'resume.pdf', { type: 'application/pdf' });

    await expect(validateApplicationFile(file, { required: true })).resolves.toEqual({
      ok: false,
      code: 'FILE_SIGNATURE_INVALID',
      message: FILE_SIGNATURE_MESSAGE,
    });
  });

  it('rejects a matching signature when extension and declared MIME disagree', async () => {
    const file = new File([PDF_HEADER], 'resume.doc', { type: 'application/pdf' });

    await expect(validateApplicationFile(file, { required: true })).resolves.toEqual({
      ok: false,
      code: 'FILE_TYPE_INVALID',
      message: FILE_TYPE_MESSAGE,
    });
  });

  it('rejects a ZIP renamed as DOCX when required Office entries are absent', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], 'resume.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await expect(validateApplicationFile(file, { required: true })).resolves.toEqual({
      ok: false,
      code: 'FILE_SIGNATURE_INVALID',
      message: FILE_SIGNATURE_MESSAGE,
    });
  });

  it('rejects a file larger than 10 MiB before reading its contents', async () => {
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'resume.pdf', {
      type: 'application/pdf',
    });

    await expect(validateApplicationFile(file, { required: true })).resolves.toEqual({
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: FILE_SIZE_MESSAGE,
    });
  });

  it('requires a resume and permits a missing optional portfolio', async () => {
    await expect(validateApplicationFile(null, { required: true })).resolves.toEqual({
      ok: false,
      code: 'FILE_REQUIRED',
      message: FILE_REQUIRED_MESSAGE,
    });
    await expect(validateApplicationFile(null, { required: false })).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it('sanitizes the metadata name without changing the path-safe extension', async () => {
    const file = new File([PDF_HEADER], '..\\private/path\u0000resume.pdf', {
      type: 'application/pdf',
    });

    const result = await validateApplicationFile(file, { required: true });

    expect(result).toMatchObject({
      ok: true,
      value: { originalFilename: 'path_resume.pdf', extension: '.pdf' },
    });
  });
});
