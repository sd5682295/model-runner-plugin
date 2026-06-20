/**
 * 诊断脚本 - 找到 Obsidian 中的 Node.js 路径
 *
 * 在 Obsidian Console 中执行此代码
 */

console.log('=== Obsidian Node.js 路径诊断 ===\n');

console.log('1. process.execPath:', process.execPath);
console.log('2. process.version:', process.version);
console.log('3. process.cwd():', process.cwd());
console.log('4. __dirname:', typeof __dirname !== 'undefined' ? __dirname : 'undefined');

// 检查可能的 Node.js 位置
const path = require('path');
const fs = require('fs');

const obsidianDir = path.dirname(process.execPath);
console.log('\n5. Obsidian 目录:', obsidianDir);

const possiblePaths = [
  path.join(obsidianDir, 'node.exe'),
  path.join(obsidianDir, 'resources', 'node.exe'),
  path.join(obsidianDir, 'resources', 'app', 'node.exe'),
  path.join(obsidianDir, 'resources', 'app.asar.unpacked', 'node.exe'),
  path.join(obsidianDir, 'resources', 'app.asar.unpacked', 'node_modules', 'electron', 'dist', 'node.exe'),
];

console.log('\n6. 检查可能的 Node.js 路径:');
possiblePaths.forEach((testPath, index) => {
  const exists = fs.existsSync(testPath);
  console.log(`   ${index + 1}) ${exists ? '✅' : '❌'} ${testPath}`);
});

// 检查环境变量
console.log('\n7. PATH 环境变量:');
const pathEnv = process.env.PATH || '';
pathEnv.split(path.delimiter).forEach((p, index) => {
  console.log(`   ${index + 1}) ${p}`);
});

// 尝试找到 node
console.log('\n8. 尝试执行 node --version:');
const { exec } = require('child_process');
exec('node --version', (error, stdout, stderr) => {
  if (error) {
    console.log('   ❌ 错误:', error.message);
  } else {
    console.log('   ✅ 成功:', stdout.trim());
  }
});

// 尝试 where node (Windows)
console.log('\n9. 尝试 where node:');
exec('where node', (error, stdout, stderr) => {
  if (error) {
    console.log('   ❌ 错误:', error.message);
  } else {
    console.log('   ✅ 找到:\n', stdout);
  }
});

console.log('\n=== 诊断完成 ===');
console.log('请复制以上所有输出发给开发者');
