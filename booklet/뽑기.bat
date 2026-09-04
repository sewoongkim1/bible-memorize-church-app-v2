@echo off
chcp 65001 > nul
cd /d "%~dp0"
rem ── 한 분 몫으로 여섯 판을 한 번에 뽑습니다(모양을 확인할 때 씁니다).
rem    이름을 바꾸려면 아래 한 줄만 고치세요.
set NAME=김세웅

echo.
echo   [%NAME%] 님 몫으로 여섯 판을 뽑습니다.
echo.

echo   1/6  컬러 · 웹폰트 · A5
python generate_blessing.py %NAME% > nul || goto :err
echo   2/6  컬러 · 웹폰트 · A4 큰글씨
python generate_blessing.py %NAME% --size a4 > nul || goto :err
echo   3/6  컬러 · PC서체 · A5
python generate_blessing.py %NAME% --font pc > nul || goto :err
echo   4/6  컬러 · PC서체 · A4 큰글씨
python generate_blessing.py %NAME% --font pc --size a4 > nul || goto :err
echo   5/6  흑백 · PC서체 · A5
python generate_blessing.py %NAME% --theme bw --font pc > nul || goto :err
echo   6/6  흑백 · PC서체 · A4 큰글씨
python generate_blessing.py %NAME% --theme bw --font pc --size a4 > nul || goto :err

echo.
echo   다 됐습니다. 이 폴더의 축복기도문_*.html 을 브라우저로 열어
echo   인쇄 - PDF로 저장 (여백 없음 - 배경 그래픽 켜기) 하세요.
echo.
pause
exit /b 0

:err
echo.
echo   !! 오류가 났습니다. 위 메시지를 확인하세요.
echo      (파이썬이 깔려 있는지, 이 폴더에 generate_blessing.py 가 있는지 보세요)
echo.
pause
exit /b 1
