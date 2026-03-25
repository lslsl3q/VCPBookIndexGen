@echo off
chcp 65001 >nul
echo ═══════════════════════════════════════════════════════════════
echo   VCPBookIndexGen Web 界面启动器
echo ═══════════════════════════════════════════════════════════════
echo.

:: 检查 Python 虚拟环境
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
    echo [√] 已激活虚拟环境
) else (
    echo [!] 未找到虚拟环境，使用系统 Python
)

echo.
echo 正在检查依赖...

:: 使用 uv 安装 web 依赖
uv pip install -r requirements-web.txt

echo.
echo 启动 API 服务...
echo 后端地址: http://127.0.0.1:3892
echo.
echo 按 Ctrl+C 停止服务
echo ═══════════════════════════════════════════════════════════════

:: 延迟 2 秒后自动打开浏览器
start "" cmd /c "timeout /t 2 /nobreak >nul && start "" "%~dp0frontend\index.html""

python api_server.py
