import { ALLOWED_FILE_TYPES, MAX_FILE_BYTES } from './schema';

export const FILE_REQUIRED_MESSAGE = '이력서를 첨부해주세요.';
export const FILE_SIZE_MESSAGE = '파일은 10MB 이하로 첨부해주세요.';
export const FILE_TYPE_MESSAGE = 'PDF, DOC, DOCX 파일만 첨부할 수 있습니다.';
export const FILE_SIGNATURE_MESSAGE = '파일 내용과 형식이 일치하지 않습니다.';

type AllowedMimeType = keyof typeof ALLOWED_FILE_TYPES;
export type AllowedFileExtension = (typeof ALLOWED_FILE_TYPES)[AllowedMimeType][number];

export type ValidatedApplicationFile = {
  file: File;
  extension: AllowedFileExtension;
  mimeType: AllowedMimeType;
  originalFilename: string;
  sizeBytes: number;
};

export type FileValidationErrorCode =
  | 'FILE_REQUIRED'
  | 'FILE_TOO_LARGE'
  | 'FILE_TYPE_INVALID'
  | 'FILE_SIGNATURE_INVALID';

export type FileValidationResult =
  | { ok: true; value: ValidatedApplicationFile | null }
  | { ok: false; code: FileValidationErrorCode; message: string };

const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const DOC_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const CONTENT_TYPES_ENTRY = new TextEncoder().encode('[Content_Types].xml');
const WORD_DOCUMENT_ENTRY = new TextEncoder().encode('word/document.xml');

function hasBytesAt(bytes: Uint8Array, signature: Uint8Array, offset = 0) {
  if (offset + signature.length > bytes.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function containsBytes(bytes: Uint8Array, needle: Uint8Array, maximumStart = bytes.length) {
  const lastStart = Math.min(bytes.length - needle.length, maximumStart);
  for (let start = 0; start <= lastStart; start += 1) {
    if (hasBytesAt(bytes, needle, start)) return true;
  }
  return false;
}

function signatureMatches(bytes: Uint8Array, extension: AllowedFileExtension) {
  switch (extension) {
    case '.pdf':
      return containsBytes(bytes, PDF_SIGNATURE, 1024);
    case '.doc':
      return hasBytesAt(bytes, DOC_SIGNATURE);
    case '.docx':
      return hasBytesAt(bytes, ZIP_SIGNATURE)
        && containsBytes(bytes, CONTENT_TYPES_ENTRY)
        && containsBytes(bytes, WORD_DOCUMENT_ENTRY);
  }
}

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

export function sanitizeOriginalFilename(name: string, extension: AllowedFileExtension) {
  const basename = name.normalize('NFKC').split(/[\\/]/).at(-1) ?? '';
  const withoutControlCharacters = Array.from(basename, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? '_' : character;
  }).join('');
  const cleaned = withoutControlCharacters
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim();
  const characters = Array.from(cleaned || `upload${extension}`);
  if (characters.length <= 255) return characters.join('');

  const extensionLength = Array.from(extension).length;
  return `${characters.slice(0, 255 - extensionLength).join('')}${extension}`;
}

export async function validateApplicationFile(
  file: File | null,
  options: { required: boolean },
): Promise<FileValidationResult> {
  if (!file) {
    return options.required
      ? { ok: false, code: 'FILE_REQUIRED', message: FILE_REQUIRED_MESSAGE }
      : { ok: true, value: null };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: FILE_SIZE_MESSAGE };
  }

  const allowedExtensions = ALLOWED_FILE_TYPES[file.type as AllowedMimeType];
  const extension = fileExtension(file.name) as AllowedFileExtension;
  if (!allowedExtensions || !(allowedExtensions as readonly string[]).includes(extension)) {
    return { ok: false, code: 'FILE_TYPE_INVALID', message: FILE_TYPE_MESSAGE };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!signatureMatches(bytes, extension)) {
      return { ok: false, code: 'FILE_SIGNATURE_INVALID', message: FILE_SIGNATURE_MESSAGE };
    }
  } catch {
    return { ok: false, code: 'FILE_SIGNATURE_INVALID', message: FILE_SIGNATURE_MESSAGE };
  }

  return {
    ok: true,
    value: {
      file,
      extension,
      mimeType: file.type as AllowedMimeType,
      originalFilename: sanitizeOriginalFilename(file.name, extension),
      sizeBytes: file.size,
    },
  };
}
