@echo off
title All in One MMO - Content Module Dev Server
echo.
echo ==========================================================
echo Bat dau khoi dong All in One MMO - Content Module Server...
echo ==========================================================
echo.

:: Kiem tra neu chua co node_modules thi tu dong run npm install
if not exist node_modules (
    echo [INFO] Khong tim thay thu muc node_modules. Dang tien hanh npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Cai dat thu vien that bai. Vui long kiem tra Node.js / NPM.
        pause
        exit /b %errorlevel%
    )
)

:: Mo trinh duyet o dia chi localhost:3000
echo [INFO] Mo trinh duyet tai dia chi http://localhost:3000...
start http://localhost:3000

:: Chay Next.js dev server
echo [INFO] Dang khoi dong server...
call npm run dev

pause
