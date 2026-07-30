/**
 * Error codes shared by the API and the client.
 *
 * The client keys retry and conflict-resolution behaviour off these codes, so
 * they are part of the public contract: add freely, never repurpose.
 */

export const ErrorCode = {
  // Validation and request shape
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // Authentication and authorisation
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  TWO_FACTOR_INVALID: 'TWO_FACTOR_INVALID',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  GONE: 'GONE',

  // Domain rules
  IMPREST_NOT_SPENDABLE: 'IMPREST_NOT_SPENDABLE',
  EXCEEDS_IMPREST: 'EXCEEDS_IMPREST',
  IMPREST_HAS_EXPENDITURE: 'IMPREST_HAS_EXPENDITURE',
  RECEIPT_REQUIRED: 'RECEIPT_REQUIRED',
  RETIREMENT_ALREADY_EXISTS: 'RETIREMENT_ALREADY_EXISTS',
  RETIREMENT_EMPTY: 'RETIREMENT_EMPTY',
  RETIREMENT_LOCKED: 'RETIREMENT_LOCKED',
  WORKFLOW_TERMINAL: 'WORKFLOW_TERMINAL',
  WORKFLOW_NOT_REVIEWABLE: 'WORKFLOW_NOT_REVIEWABLE',
  WORKFLOW_FORBIDDEN: 'WORKFLOW_FORBIDDEN',
  WORKFLOW_NO_NEXT_STAGE: 'WORKFLOW_NO_NEXT_STAGE',
  WORKFLOW_NOT_SUBMITTABLE: 'WORKFLOW_NOT_SUBMITTABLE',
  WORKFLOW_NOT_CLOSEABLE: 'WORKFLOW_NOT_CLOSEABLE',
  WORKFLOW_UNKNOWN_DECISION: 'WORKFLOW_UNKNOWN_DECISION',
  SIGNATURE_REQUIRED: 'SIGNATURE_REQUIRED',
  FINANCIAL_YEAR_CLOSED: 'FINANCIAL_YEAR_CLOSED',
  IMMUTABLE_RECORD: 'IMMUTABLE_RECORD',

  // Concurrency and sync
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  DUPLICATE_MUTATION: 'DUPLICATE_MUTATION',

  // Infrastructure
  RATE_LIMITED: 'RATE_LIMITED',
  STORAGE_FAILURE: 'STORAGE_FAILURE',
  PDF_GENERATION_FAILED: 'PDF_GENERATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Client-only
  OFFLINE: 'OFFLINE',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 422,
  MALFORMED_REQUEST: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,

  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  ACCOUNT_INACTIVE: 403,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  SESSION_EXPIRED: 401,
  TWO_FACTOR_REQUIRED: 401,
  TWO_FACTOR_INVALID: 401,
  PASSWORD_CHANGE_REQUIRED: 403,
  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSION: 403,

  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  GONE: 410,

  IMPREST_NOT_SPENDABLE: 409,
  EXCEEDS_IMPREST: 422,
  IMPREST_HAS_EXPENDITURE: 409,
  RECEIPT_REQUIRED: 422,
  RETIREMENT_ALREADY_EXISTS: 409,
  RETIREMENT_EMPTY: 422,
  RETIREMENT_LOCKED: 409,
  WORKFLOW_TERMINAL: 409,
  WORKFLOW_NOT_REVIEWABLE: 409,
  WORKFLOW_FORBIDDEN: 403,
  WORKFLOW_NO_NEXT_STAGE: 409,
  WORKFLOW_NOT_SUBMITTABLE: 409,
  WORKFLOW_NOT_CLOSEABLE: 409,
  WORKFLOW_UNKNOWN_DECISION: 400,
  SIGNATURE_REQUIRED: 422,
  FINANCIAL_YEAR_CLOSED: 409,
  IMMUTABLE_RECORD: 409,

  VERSION_CONFLICT: 409,
  SYNC_CONFLICT: 409,
  DUPLICATE_MUTATION: 200,

  RATE_LIMITED: 429,
  STORAGE_FAILURE: 502,
  PDF_GENERATION_FAILED: 500,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/** Operator-facing wording. The UI shows these verbatim. */
export const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Some entries are not valid. Please correct the highlighted fields.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  INVALID_CREDENTIALS: 'The staff number or password is incorrect.',
  ACCOUNT_LOCKED: 'This account is temporarily locked after repeated failed sign-in attempts.',
  ACCOUNT_INACTIVE: 'This account has been deactivated. Contact the Administrator.',
  SESSION_EXPIRED: 'Your session has timed out. Please sign in again.',
  TWO_FACTOR_REQUIRED: 'Enter the verification code from your authenticator app.',
  TWO_FACTOR_INVALID: 'That verification code is not valid or has expired.',
  INSUFFICIENT_PERMISSION: 'Your role does not permit this action.',
  NOT_FOUND: 'The requested record could not be found.',
  EXCEEDS_IMPREST: 'This expenditure would exceed the imprest value.',
  IMPREST_NOT_SPENDABLE: 'Expenditure cannot be posted against this imprest in its current status.',
  RETIREMENT_EMPTY: 'A retirement requires at least one posted expenditure.',
  RETIREMENT_LOCKED: 'This retirement has entered the approval chain and can no longer be edited.',
  VERSION_CONFLICT: 'Another user has changed this record. Review their changes before saving.',
  SYNC_CONFLICT: 'A change made on this device conflicts with the server copy.',
  OFFLINE: 'You are offline. This change is queued and will sync automatically.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL_ERROR: 'An unexpected error occurred. The incident has been logged.',
};

export function httpStatusFor(code: string): number {
  return ERROR_HTTP_STATUS[code as ErrorCode] ?? 500;
}

export function messageFor(code: string, fallback = 'An unexpected error occurred.'): string {
  return ERROR_MESSAGES[code as ErrorCode] ?? fallback;
}

/** Codes worth retrying automatically once connectivity returns. */
export const RETRYABLE_ERROR_CODES: ErrorCode[] = [
  ErrorCode.NETWORK_ERROR,
  ErrorCode.OFFLINE,
  ErrorCode.RATE_LIMITED,
  ErrorCode.SERVICE_UNAVAILABLE,
  ErrorCode.STORAGE_FAILURE,
  ErrorCode.INTERNAL_ERROR,
];

export function isRetryable(code: string): boolean {
  return RETRYABLE_ERROR_CODES.includes(code as ErrorCode);
}
