module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'node',
  
  // Root directory for tests
  roots: ['<rootDir>/src'],
  
  // Test file pattern
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Module paths (helps with imports)
  modulePaths: ['<rootDir>/src'],
  
  // Collect coverage from these files
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts', // Exclude main entry point
    '!src/**/*.d.ts', // Exclude type definitions
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  
  // Verbose output
  verbose: true,
  
  // Timeout for tests (30 seconds for browser tests)
  testTimeout: 30000,
  
  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
