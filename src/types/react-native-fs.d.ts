declare module 'react-native-fs' {
  const RNFS: {
    readFile(filepath: string, encoding: string): Promise<string>;
  };
  export default RNFS;
}
