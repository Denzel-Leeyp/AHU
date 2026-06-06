@echo off
chcp 65001 >nul
title 进气空调设计计算器 - 打包工具
echo ============================================
echo   进气空调设计计算器 - 打包为 EXE 文件
echo ============================================
echo.

:: 检查 Node.js 是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址：https://nodejs.org （选择 LTS 版本）
    pause
    exit /b 1
)
echo [√] Node.js 已检测到

:: 安装依赖（如果 node_modules 不存在）
if not exist "node_modules\" (
    echo.
    echo [1/2] 正在安装依赖项，首次安装需要几分钟...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败，请检查网络连接后重试
        pause
        exit /b 1
    )
    echo [√] 依赖安装完成
) else (
    echo [√] 依赖项已存在
)

:: 打包为 EXE
echo.
echo [2/2] 正在打包为 EXE 文件，请稍候...
echo （此过程可能需要 2-5 分钟）
echo.
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call npx electron-builder --win portable
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 打包失败
    pause
    exit /b 1
)

echo.
echo ============================================
echo   打包完成！
echo   EXE 文件位于：dist\AHU_Calculator.exe
echo   双击即可运行，无需安装任何软件！
echo ============================================
echo.
pause