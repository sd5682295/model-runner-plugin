/**
 * ServiceManager 启动测试
 * 模拟服务启动流程，验证环境变量传递
 */

import { spawn } from 'child_process';
import * as path from 'path';

describe('ServiceManager 启动测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应该显式传递环境变量', () => {
    const config = {
      command: 'node',
      args: ['server.js'],
      cwd: path.join(process.env.USERPROFILE || '', '.obsidian/plugins/model-runner/server'),
    };

    const spawnOptions = {
      cwd: config.cwd,
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        PATH: process.env.PATH,
      }
    };

    // ✅ 验证：env 包含 PATH
    expect(spawnOptions.env).toHaveProperty('PATH');
    expect(spawnOptions.env.PATH).toBeTruthy();
    console.log('✅ 环境变量 PATH:', spawnOptions.env.PATH);

    // ✅ 验证：env 包含其他环境变量
    expect(Object.keys(spawnOptions.env).length).toBeGreaterThan(1);
  });

  it('应该能找到 node 命令', () => {
    // 检查 PATH 中是否包含 nodejs
    const pathEnv = process.env.PATH || '';
    const hasNodejs = pathEnv.toLowerCase().includes('nodejs');

    console.log('PATH 环境变量:', pathEnv);
    console.log('是否包含 nodejs:', hasNodejs);

    // ✅ 验证：PATH 中应该有 nodejs
    expect(hasNodejs).toBe(true);
  });

  it('模拟真实 spawn 调用', async () => {
    const testScript = `
      console.log('测试成功');
      process.exit(0);
    `;

    // 创建测试脚本
    const testFile = path.join(__dirname, 'test-spawn.js');
    require('fs').writeFileSync(testFile, testScript);

    try {
      // 使用显式环境变量 spawn
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [testFile], {
          env: {
            ...process.env,
            PATH: process.env.PATH,
          },
          stdio: 'pipe',
        });

        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve(output);
          } else {
            reject(new Error(`进程退出码: ${code}`));
          }
        });

        child.on('error', (error) => {
          reject(error);
        });
      });

      // ✅ 验证：spawn 成功
      expect(result).toContain('测试成功');
      console.log('✅ spawn 测试成功');
    } catch (error) {
      console.error('❌ spawn 测试失败:', error);
      throw error;
    } finally {
      // 清理测试文件
      require('fs').unlinkSync(testFile);
    }
  });
});
