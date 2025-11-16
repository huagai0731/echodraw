@echo off
REM Windows 批处理：提交并推送 TypeScript 修复

echo 检查修改的文件...
git status

echo.
echo 添加修改的文件...
git add frontend/src/admin/pages/DailyQuiz.tsx
git add frontend/src/admin/pages/TestManagement.tsx
git add frontend/src/pages/Home.tsx
git add frontend/src/pages/MentalStateAssessment.tsx
git add frontend/src/pages/ShortTermGoalDetails.tsx

echo.
echo 提交更改...
git commit -m "修复 TypeScript 编译错误：删除未使用的导入和变量，修复类型问题"

echo.
echo 推送到远程...
git push origin master

echo.
echo 完成！
pause


