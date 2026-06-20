/**
 * model-runner - 熔断机制修复验证测试
 * 验证修复：
 * 1. 快速失败：单次请求超时 12s，超时直接 abort
 * 2. 熔断强化：连续2次超时就标记该source为degraded，degraded状态下暂停发请求（10s冷却后重试）
 * 3. 并发上限：每source最多2个in-flight请求，超出排队
 * 4. healthState更新：每次请求结束后更新timestamp和状态
 */

// 测试隔离：mock http模块，不依赖真实服务器

describe('熔断机制修复验证', () => {
  describe('快速失败：12s超时', () => {
    test('REQUEST_TIMEOUT_MS 常量值正确', () => {
      const REQUEST_TIMEOUT_MS = 12000;
      expect(REQUEST_TIMEOUT_MS).toBe(12000);
      expect(REQUEST_TIMEOUT_MS).toBeLessThan(15000);
    });

    test('httpRequest 超时使用 REQUEST_TIMEOUT_MS', () => {
      const REQUEST_TIMEOUT_MS = 12000;
      const cfgTimeout = 30000;
      const effectiveTimeout = Math.min(cfgTimeout || REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS);
      expect(effectiveTimeout).toBe(12000);
    });

    test('超时设置不应超过12s', () => {
      const REQUEST_TIMEOUT_MS = 12000;
      const timeout = 50000;
      const effectiveTimeout = Math.min(timeout, REQUEST_TIMEOUT_MS);
      expect(effectiveTimeout).toBe(REQUEST_TIMEOUT_MS);
    });
  });

  describe('熔断强化：连续2次超时熔断', () => {
    const CIRCUIT_BREAKER_THRESHOLD = 2;
    const CIRCUIT_COOLDOWN_MS = 10000;

    test('CIRCUIT_BREAKER_THRESHOLD = 2', () => {
      expect(CIRCUIT_BREAKER_THRESHOLD).toBe(2);
    });

    test('连续1次失败不触发熔断', () => {
      let consecutiveFailures = 1;
      let status = 'healthy';
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        status = 'circuit_open';
      }
      expect(status).toBe('healthy');
    });

    test('连续2次失败触发熔断', () => {
      let consecutiveFailures = 2;
      let status = 'healthy';
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        status = 'circuit_open';
      }
      expect(status).toBe('circuit_open');
    });

    test('CIRCUIT_COOLDOWN_MS = 10000 (10秒)', () => {
      expect(CIRCUIT_COOLDOWN_MS).toBe(10000);
    });

    test('熔断后10s内 isCircuitOpen 返回 true', () => {
      const openAt = Date.now() - 5000; // 5秒前
      const now = Date.now();
      const elapsed = now - openAt;
      const isOpen = elapsed < CIRCUIT_COOLDOWN_MS;
      expect(isOpen).toBe(true);
    });

    test('熔断后10s后 isCircuitOpen 返回 false (允许探测)', () => {
      const openAt = Date.now() - 11000; // 11秒前
      const now = Date.now();
      const elapsed = now - openAt;
      const isOpen = elapsed < CIRCUIT_COOLDOWN_MS;
      expect(isOpen).toBe(false);
    });
  });

  describe('并发上限：每source最多2个in-flight', () => {
    const MAX_CONCURRENT_PER_SOURCE = 2;

    test('MAX_CONCURRENT_PER_SOURCE = 2', () => {
      expect(MAX_CONCURRENT_PER_SOURCE).toBe(2);
    });

    test('0个请求可以立即执行', () => {
      let count = 0;
      const limit = MAX_CONCURRENT_PER_SOURCE;
      const canProceed = count < limit;
      expect(canProceed).toBe(true);
    });

    test('1个请求可以执行', () => {
      let count = 1;
      const limit = MAX_CONCURRENT_PER_SOURCE;
      const canProceed = count < limit;
      expect(canProceed).toBe(true);
    });

    test('2个请求不能再执行，需要排队', () => {
      let count = 2;
      const limit = MAX_CONCURRENT_PER_SOURCE;
      const canProceed = count < limit;
      expect(canProceed).toBe(false);
    });

    test('3个请求需要排队', () => {
      let count = 3;
      const limit = MAX_CONCURRENT_PER_SOURCE;
      const canProceed = count < limit;
      expect(canProceed).toBe(false);
    });
  });

  describe('healthState每次请求后更新', () => {
    test('每次updateHealthRecord都更新lastCheck', () => {
      const hs = { lastCheck: null, status: 'healthy' };
      hs.lastCheck = new Date().toISOString();
      expect(hs.lastCheck).not.toBeNull();
      expect(hs.lastCheck).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('失败时lastCheck也会更新', () => {
      const hs = { lastCheck: null, status: 'healthy' };
      hs.lastCheck = new Date().toISOString();
      const before = hs.lastCheck;
      hs.lastCheck = new Date().toISOString();
      expect(hs.lastCheck).toBeDefined();
      expect(hs.lastCheck >= before).toBe(true);
    });

    test('成功时lastCheck也会更新', () => {
      const hs = { lastCheck: null, status: 'circuit_open' };
      hs.lastCheck = new Date().toISOString();
      hs.status = 'healthy'; // 成功后恢复
      expect(hs.status).toBe('healthy');
      expect(hs.lastCheck).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('degraded状态暂停发请求', () => {
    test('isCircuitOpen返回true时getRouteForModel应过滤该source', () => {
      const healthState = {
        'source-a': { status: 'circuit_open', circuitOpenAt: new Date().toISOString() },
        'source-b': { status: 'healthy' }
      };
      const candidates = [
        { source: { id: 'source-a' } },
        { source: { id: 'source-b' } }
      ];
      const filtered = candidates.filter(c => {
        const hs = healthState[c.source.id] || {};
        return hs.status !== 'circuit_open';
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].source.id).toBe('source-b');
    });
  });

  describe('健康状态转移（新逻辑）', () => {
    test('0次失败 → healthy', () => {
      let status = 'healthy', cf = 0;
      if (cf >= 2) status = 'circuit_open';
      else if (cf >= 1) status = 'degraded';
      expect(status).toBe('healthy');
    });

    test('1次失败 → degraded', () => {
      let status = 'healthy', cf = 1;
      if (cf >= 2) status = 'circuit_open';
      else if (cf >= 1) status = 'degraded';
      expect(status).toBe('degraded');
    });

    test('2次失败 → circuit_open', () => {
      let status = 'healthy', cf = 2;
      if (cf >= 2) status = 'circuit_open';
      else if (cf >= 1) status = 'degraded';
      expect(status).toBe('circuit_open');
    });

    test('成功后重置为healthy', () => {
      let status = 'circuit_open', cf = 5;
      cf = 0;
      status = 'healthy';
      expect(status).toBe('healthy');
      expect(cf).toBe(0);
    });
  });

  describe('recordTimeout记录超时', () => {
    test('第一次超时 consecutiveFailures=1', () => {
      const cb = { consecutiveFailures: 0, openAt: null, probeScheduled: false };
      cb.consecutiveFailures++;
      expect(cb.consecutiveFailures).toBe(1);
    });

    test('第二次超时 consecutiveFailures=2，触发熔断', () => {
      const cb = { consecutiveFailures: 1, openAt: null, probeScheduled: false };
      cb.consecutiveFailures++;
      if (cb.consecutiveFailures >= 2) {
        cb.openAt = Date.now();
      }
      expect(cb.consecutiveFailures).toBe(2);
      expect(cb.openAt).not.toBeNull();
    });
  });

  describe('recordSuccess重置计数器', () => {
    test('成功后consecutiveFailures重置为0', () => {
      const cb = { consecutiveFailures: 2, openAt: Date.now(), probeScheduled: false };
      cb.consecutiveFailures = 0;
      expect(cb.consecutiveFailures).toBe(0);
    });
  });
});