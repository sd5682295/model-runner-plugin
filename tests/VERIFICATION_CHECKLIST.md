# 测试验证清单

## 测试反作弊检查清单

在运行测试之前，请确保：

### ✅ 1. 没有空函数测试

**检查项**:
- [ ] 所有测试用例都有实际的断言（expect）
- [ ] 没有只包含 `test.skip()` 的用例
- [ ] 没有空的 `test()` 函数

**验证方法**:
```bash
# 搜索空测试
grep -r "test\(.*\) {}" tests/
grep -r "test.skip" tests/
```

### ✅ 2. 没有使用模拟数据代替真实测试

**检查项**:
- [ ] 单元测试使用 Mock，但验证了调用和参数
- [ ] 集成测试使用真实的文件系统和进程
- [ ] 没有硬编码的"成功"返回值

**验证方法**:
- 检查集成测试是否真实启动了进程
- 检查是否真实读写了文件
- 验证 Mock 是否有 `toHaveBeenCalled()` 断言

### ✅ 3. 测试覆盖了实际代码

**检查项**:
- [ ] 测试文件导入了真实的源代码
- [ ] 测试执行了源代码的方法
- [ ] 覆盖率报告显示 >70% 覆盖率

**验证方法**:
```bash
# 运行覆盖率测试
npm test -- --coverage

# 检查覆盖率报告
cat coverage/coverage-summary.json
```

### ✅ 4. 测试确实运行了

**检查项**:
- [ ] Jest 输出显示测试执行
- [ ] 测试有成功/失败的结果
- [ ] 没有所有测试都被跳过

**验证方法**:
- 查看 Jest 输出
- 确认有 "Tests: X passed" 或 "Tests: X failed"

### ✅ 5. 断言是有效的

**检查项**:
- [ ] 使用了正确的 Jest 断言（expect）
- [ ] 断言检查了有意义的值
- [ ] 没有 `expect(true).toBe(true)` 这样的无意义断言

**示例 - 无效断言**:
```javascript
// ❌ 无意义
test('something', () => {
  expect(true).toBe(true);
});

// ❌ 总是通过
test('something', () => {
  const result = myFunction();
  expect(result).toBeDefined(); // 任何返回值都会通过
});
```

**示例 - 有效断言**:
```javascript
// ✅ 检查具体值
test('something', () => {
  const result = myFunction();
  expect(result.status).toBe('success');
  expect(result.data).toHaveLength(3);
});

// ✅ 检查调用
test('something', () => {
  const mockFn = jest.fn();
  myFunction(mockFn);
  expect(mockFn).toHaveBeenCalledWith('expected-arg');
});
```

---

## 测试执行检查清单

### 执行前

- [ ] 关闭所有运行中的 model-runner 实例
- [ ] 确保端口 4000-4010 空闲
- [ ] 备份重要的配置文件
- [ ] 设置测试环境变量（如果需要）

### 执行中

- [ ] 观察测试输出，确保测试在运行
- [ ] 检查是否有意外的错误日志
- [ ] 确认测试不会永久挂起

### 执行后

- [ ] 检查覆盖率报告
- [ ] 查看失败的测试详情
- [ ] 验证测试清理了临时文件
- [ ] 确认没有遗留的进程

---

## 代码审查检查清单

### 测试文件结构

- [ ] 每个测试文件有清晰的 `describe` 分组
- [ ] 测试用例有描述性的名称
- [ ] 有 `beforeEach` / `afterEach` 清理
- [ ] 测试是独立的（不依赖执行顺序）

### Mock 使用

- [ ] Mock 了外部依赖（fs, child_process）
- [ ] Mock 有合理的返回值
- [ ] 验证了 Mock 被正确调用
- [ ] 在 `afterEach` 中清理了 Mock

### 断言质量

- [ ] 每个测试至少有一个断言
- [ ] 断言检查了具体的值（不是 `toBeDefined()`）
- [ ] 错误场景有对应的断言
- [ ] 边界值有对应的测试

---

## 运行所有检查

```bash
# 1. 搜索潜在问题
echo "=== 检查空测试 ==="
grep -r "test\(.*\) " tests/ || echo "✓ 没有空测试"

echo ""
echo "=== 检查跳过的测试 ==="
grep -r "test.skip" tests/ || echo "✓ 没有跳过的测试"

echo ""
echo "=== 检查无意义断言 ==="
grep -r "expect(true).toBe(true)" tests/ || echo "✓ 没有无意义断言"

echo ""
echo "=== 运行所有测试 ==="
npm test

echo ""
echo "=== 生成覆盖率报告 ==="
npm test -- --coverage

echo ""
echo "=== 检查覆盖率 ==="
cat coverage/coverage-summary.json | grep -A 5 "total"
```

---

## 反作弊验证通过标准

- ✅ 所有测试文件都导入了真实源代码
- ✅ 集成测试真实地启动了进程和读写文件
- ✅ 单元测试 Mock 了依赖但验证了调用
- ✅ 覆盖率 >70%
- ✅ 所有测试都有有意义的断言
- ✅ 没有空测试或跳过的测试
- ✅ 测试输出显示实际执行和通过/失败结果

---

## 手动验证步骤

### 1. 检查测试文件内容

```bash
# 查看单元测试
cat tests/unit/ConfigManager.test.js | head -50

# 查看集成测试
cat tests/integration/ProcessManager.test.js | head -50

# 查看冒烟测试
cat tests/smoke/smoke.test.js | head -50
```

### 2. 运行单个测试并观察

```bash
# 运行一个具体的测试
npx jest tests/unit/ConfigManager.test.js -t "UT-CFG-001"

# 应该看到：
# - 测试名称
# - 执行时间
# - PASS/FAIL 状态
```

### 3. 检查 Mock 的使用

```bash
# 搜索 Mock 定义
grep -A 5 "jest.mock" tests/unit/*.js

# 搜索 Mock 验证
grep "toHaveBeenCalled" tests/unit/*.js
```

### 4. 验证集成测试真实性

```bash
# 检查是否使用真实的 spawn
grep "spawn" tests/integration/ProcessManager.test.js

# 检查是否有真实的文件操作
grep "fs\." tests/integration/*.js | grep -v "jest.mock"
```

---

**最后确认**: 
所有检查项通过后，才能认为测试是完备和有效的！
