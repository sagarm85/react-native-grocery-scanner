import RNFS from 'react-native-fs';
import { ScanError } from './ScanError';

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

export function getMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME_MAP[ext];
  if (!mime) {
    throw new ScanError(
      'UNSUPPORTED_FORMAT',
      `Unsupported file format: .${ext}. Supported formats: JPEG, PNG, WebP, PDF`,
    );
  }
  return mime;
}

export async function fileToBase64(uri: string): Promise<string> {
  try {
    return await RNFS.readFile(uri, 'base64');
  } catch {
    throw new ScanError('INVALID_INPUT', `Cannot read file at: ${uri}`);
  }
}
