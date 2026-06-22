@echo off
REM 测试运行脚本 - Windows 版本
REM 用法: run-tests.bat [test-type]
REM test-type: unit, integration, smoke, all (默认)

setlocal enabledelayedexpansion

set TEST_TYPE=%1
if "%TEST_TYPE%"=="" set TEST_TYPE=all

echo [INFO] 开始运行测试: %TEST_TYPE%
echo.

REM 检查 Jest 是否安装
where jest >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Jest 未安装，正在安装...
    npm install --save-dev jest ts-jest @types/jest
)

REM 运行测试
if "%TEST_TYPE%"=="unit" (
    echo [INFO] 运行单元测试...
    npx jest --config jest.config.json tests/unit
    goto :end
)

if "%TEST_TYPE%"=="integration" (
    echo [INFO] 运行集成测试...
    npx jest --config jest.config.json tests/integration
    goto :end
)

if "%TEST_TYPE%"=="smoke" (
    echo [INFO] 运行冒烟测试...
    npx jest --config jest.config.json tests/smoke
    goto :end
)

if "%TEST_TYPE%"=="all" (
    echo [INFO] 运行所有测试...
    echo.

    REM 1. 冒烟测试
    echo [INFO] 步骤 1/3: 冒烟测试
    npx jest --config jest.config.json tests/smoke
    if %errorlevel% neq 0 (
        echo [ERROR] 冒烟测试失败！
        exit /b 1
    )
    echo [SUCCESS] 冒烟测试通过
    echo.

    REM 2. 单元测试
    echo [INFO] 步骤 2/3: 单元测试
    npx jest --config jest.config.json tests/unit --coverage
    if %errorlevel% neq 0 (
        echo [ERROR] 单元测试失败！
        exit /b 1
    )
    echo [SUCCESS] 单元测试通过
    echo.

    REM 3. 集成测试
    echo [INFO] 步骤 3/3: 集成测试
    npx jest --config jest.config.json tests/integration
    if %errorlevel% neq 0 (
        echo [ERROR] 集成测试失败！
        exit /b 1
    )
    echo [SUCCESS] 集成测试通过
    echo.

    goto :end
)

if "%TEST_TYPE%"=="coverage" (
    echo [INFO] 运行测试并生成覆盖率报告...
    npx jest --config jest.config.json --coverage --coverageReporters=text --coverageReporters=html
    echo [INFO] 覆盖率报告已生成到 coverage/ 目录
    goto :end
)

if "%TEST_TYPE%"=="watch" (
    echo [INFO] 进入监视模式...
    npx jest --config jest.config.json --watch
    goto :end
)

echo [ERROR] 未知的测试类型: %TEST_TYPE%
echo 用法: %~nx0 [unit^|integration^|smoke^|all^|coverage^|watch]
exit /b 1

:end
echo.
echo [SUCCESS] 所有测试完成！
endlocal
