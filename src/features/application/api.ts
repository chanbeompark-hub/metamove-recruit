export type ApplicationSubmissionErrorCode =
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'SUBMISSION_PENDING'
  | 'SUBMISSION_FAILED'
  | 'NETWORK_ERROR';

const ERROR_MESSAGES: Record<ApplicationSubmissionErrorCode, string> = {
  INVALID_REQUEST: '요청 내용을 확인해주세요.',
  PAYLOAD_TOO_LARGE: '첨부 파일 크기를 확인해주세요.',
  RATE_LIMITED: '잠시 후 다시 시도해주세요.',
  UNAVAILABLE: '현재 지원서를 제출할 수 없습니다.',
  SUBMISSION_PENDING: '접수 상태를 확인 중입니다. 잠시 후 같은 지원서를 다시 제출해주세요.',
  SUBMISSION_FAILED: '지원서 저장 중 문제가 발생했습니다.',
  NETWORK_ERROR: '네트워크 연결을 확인하고 다시 시도해주세요.',
};

export class ApplicationSubmissionError extends Error {
  readonly code: ApplicationSubmissionErrorCode;
  readonly status: number;

  constructor(code: ApplicationSubmissionErrorCode, status: number) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ApplicationSubmissionError';
    this.code = code;
    this.status = status;
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function errorForStatus(status: number) {
  if (status === 400) return new ApplicationSubmissionError('INVALID_REQUEST', status);
  if (status === 413) return new ApplicationSubmissionError('PAYLOAD_TOO_LARGE', status);
  if (status === 429) return new ApplicationSubmissionError('RATE_LIMITED', status);
  if (status === 202) return new ApplicationSubmissionError('SUBMISSION_PENDING', status);
  if (status === 503) return new ApplicationSubmissionError('UNAVAILABLE', status);
  return new ApplicationSubmissionError('SUBMISSION_FAILED', status);
}

function isReceiptResponse(value: unknown): value is { receiptCode: string } {
  return typeof value === 'object'
    && value !== null
    && 'receiptCode' in value
    && typeof value.receiptCode === 'string'
    && value.receiptCode.length > 0
    && value.receiptCode.length <= 64;
}

export async function submitApplication(
  formData: FormData,
  fetcher: Fetcher = fetch,
): Promise<{ receiptCode: string }> {
  if (typeof formData.get('submission_key') !== 'string') {
    formData.set('submission_key', crypto.randomUUID());
  }
  let response: Response;
  try {
    response = await fetcher('/api/applications', {
      method: 'POST',
      body: formData,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new ApplicationSubmissionError('NETWORK_ERROR', 0);
  }

  if (response.status !== 201) throw errorForStatus(response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApplicationSubmissionError('SUBMISSION_FAILED', response.status);
  }
  if (!isReceiptResponse(body)) {
    throw new ApplicationSubmissionError('SUBMISSION_FAILED', response.status);
  }
  return { receiptCode: body.receiptCode };
}
