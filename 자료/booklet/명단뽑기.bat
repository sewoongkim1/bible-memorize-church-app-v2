@echo off
chcp 65001 > nul
cd /d "%~dp0"
rem ══════════════════════════════════════════════════════════════════
rem  명단.txt 에 적힌 분들 몫을 한 번에 뽑습니다.
rem
rem  ▶ 명단.txt 에 한 줄에 한 분씩 성함을 적으세요(# 로 시작하는 줄은 건너뜁니다).
rem  ▶ 아래 세 줄로 모양을 고릅니다.
rem ══════════════════════════════════════════════════════════════════

rem  테마 :  gold(컬러 기본)  teal(청록)  plum(자두빛)  bw(흑백 - 표지만 컬러)
set THEME=bw

rem  서체 :  pc(이 PC 서체 - 둥근미소/프리젠테이션)   web(웹폰트)
set FONT=pc

rem  판형 :  a5(소책자)   a4(어르신 큰글씨판)
set SIZE=a5

rem  PDF 까지 구울까요?  1이면 예 · 0이면 HTML 만
set PDF=1

rem  내보낼 폴더
set OUT=출력

rem ── 여기부터는 고치지 않으셔도 됩니다 ────────────────────────────
if not exist 명단.txt (
  echo.
  echo   !! 명단.txt 가 없습니다. 이 폴더에 만들고 한 줄에 한 분씩 적어 주세요.
  echo.
  pause
  exit /b 1
)

set PDFOPT=
if "%PDF%"=="1" set PDFOPT=--pdf

echo.
echo   명단.txt 로 뽑습니다  (테마 %THEME% · 서체 %FONT% · 판형 %SIZE%)
if "%PDF%"=="1" echo   PDF 까지 굽습니다 - 한 분에 10초쯤 걸립니다. 기다려 주세요.
echo.

python generate_blessing.py --list 명단.txt --theme %THEME% --font %FONT% --size %SIZE% %PDFOPT% --out "%OUT%"
if errorlevel 1 goto :err

echo.
echo   다 됐습니다. "%OUT%" 폴더를 열어 보세요.
echo.
explorer "%OUT%"
pause
exit /b 0

:err
echo.
echo   !! 오류가 났습니다. 위 메시지를 확인하세요.
echo.
pause
exit /b 1
