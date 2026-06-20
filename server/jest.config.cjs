/**
 * model-runner - Jest 配置文件
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 10000,
  verbose: true,
  clearMocks: true,
};
