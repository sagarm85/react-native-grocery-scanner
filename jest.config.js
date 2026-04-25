module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    'react-native-fs': '<rootDir>/src/__mocks__/react-native-fs.ts',
  },
  clearMocks: true,
};
