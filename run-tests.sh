#!/bin/bash

# 测试运行脚本
# 用法: ./run-tests.sh [test-type]
# test-type: unit, integration, smoke, all (默认)

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 函数：打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Jest 是否安装
if ! command -v jest &> /dev/null; then
    print_warning "Jest 未安装，正在安装..."
    npm install --save-dev jest ts-jest @types/jest
fi

# 获取测试类型
TEST_TYPE=${1:-all}

print_info "开始运行测试: $TEST_TYPE"
echo ""

# 运行测试
case $TEST_TYPE in
  unit)
    print_info "运行单元测试..."
    jest --config jest.config.json tests/unit
    ;;

  integration)
    print_info "运行集成测试..."
    jest --config jest.config.json tests/integration
    ;;

  smoke)
    print_info "运行冒烟测试..."
    jest --config jest.config.json tests/smoke
    ;;

  all)
    print_info "运行所有测试..."

    # 1. 冒烟测试（最快，优先失败）
    print_info "步骤 1/3: 冒烟测试"
    jest --config jest.config.json tests/smoke
    print_success "冒烟测试通过 ✓"
    echo ""

    # 2. 单元测试
    print_info "步骤 2/3: 单元测试"
    jest --config jest.config.json tests/unit --coverage
    print_success "单元测试通过 ✓"
    echo ""

    # 3. 集成测试
    print_info "步骤 3/3: 集成测试"
    jest --config jest.config.json tests/integration
    print_success "集成测试通过 ✓"
    echo ""
    ;;

  coverage)
    print_info "运行测试并生成覆盖率报告..."
    jest --config jest.config.json --coverage --coverageReporters=text --coverageReporters=html
    print_info "覆盖率报告已生成到 coverage/ 目录"
    ;;

  watch)
    print_info "进入监视模式..."
    jest --config jest.config.json --watch
    ;;

  *)
    print_error "未知的测试类型: $TEST_TYPE"
    echo "用法: $0 [unit|integration|smoke|all|coverage|watch]"
    exit 1
    ;;
esac

# 测试完成
echo ""
print_success "所有测试完成！"
