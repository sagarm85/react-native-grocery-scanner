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
    ['list.pdf', 'application/pdf'],
  ])('returns correct MIME type for %s', (filename, expected) => {
    expect(getMimeType(filename)).toBe(expected);
  });

  it('throws UNSUPPORTED_FORMAT for unknown extension', () => {
    expect.assertions(2); // one per expect in catch block
    try {
      getMimeType('file.gif');
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

  it('throws INVALID_INPUT when file cannot be read', async () => {
    expect.assertions(2); // one per expect in catch block
    mockReadFile.mockRejectedValueOnce(new Error('File not found'));
    try {
      await fileToBase64('file:///missing.jpg');
    } catch (e) {
      expect(e).toBeInstanceOf(ScanError);
      expect((e as ScanError).code).toBe('INVALID_INPUT');
    }
  });
});
