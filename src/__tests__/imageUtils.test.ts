import RNFS from 'react-native-fs';
import { fileToBase64, getMimeType } from '../imageUtils';
import { ScanError } from '../ScanError';

const mockReadFile = RNFS.readFile as jest.MockedFunction<typeof RNFS.readFile>;

describe('getMimeType', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['photo.heic', 'image/heic'],
    ['list.pdf', 'application/pdf'],
  ])('returns correct MIME type for %s', (filename, expected) => {
    expect(getMimeType(filename)).toBe(expected);
  });

  it('throws UNSUPPORTED_FORMAT for unknown extension', () => {
    try {
      getMimeType('file.gif');
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('is case-insensitive', () => {
    expect(getMimeType('photo.JPG')).toBe('image/jpeg');
    expect(getMimeType('photo.PNG')).toBe('image/png');
  });
});

describe('fileToBase64', () => {
  it('reads file and returns base64 string', async () => {
    mockReadFile.mockResolvedValueOnce('abc123base64');
    const result = await fileToBase64('file:///path/to/image.jpg');
    expect(result).toBe('abc123base64');
    expect(mockReadFile).toHaveBeenCalledWith('file:///path/to/image.jpg', 'base64');
  });

  it('throws PROVIDER_ERROR when file cannot be read', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('File not found'));
    try {
      await fileToBase64('file:///missing.jpg');
      fail('expected ScanError');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('PROVIDER_ERROR');
    }
  });
});
