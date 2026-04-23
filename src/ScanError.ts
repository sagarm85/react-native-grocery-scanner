import type { ScanErrorCode } from './types';

interface ScanErrorOptions {
  confidence?: number;
  rawText?: string;
}

export class ScanError extends Error {
  code: ScanErrorCode;
  confidence?: number;
  rawText?: string;

  constructor(code: ScanErrorCode, message: string, options?: ScanErrorOptions) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    this.confidence = options?.confidence;
    this.rawText = options?.rawText;
  }
}
