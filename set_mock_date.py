#!/usr/bin/env python3
"""
设置模拟日期的脚本
允许用户输入日期，自动修改前端和后端的配置

使用方法:
    python set_mock_date.py
"""

import os
import re
import sys
from pathlib import Path
from datetime import datetime


def validate_date(date_str: str) -> bool:
    """验证日期格式是否为 YYYY-MM-DD"""
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def get_project_root() -> Path:
    """获取项目根目录"""
    # 脚本应该在项目根目录
    script_path = Path(__file__).resolve()
    return script_path.parent


def update_frontend_date(date_str: str) -> bool:
    """更新前端的模拟日期"""
    project_root = get_project_root()
    frontend_file = project_root / "frontend" / "src" / "utils" / "dateUtils.ts"
    
    if not frontend_file.exists():
        print(f"❌ 错误: 找不到前端文件 {frontend_file}")
        return False
    
    try:
        # 读取文件内容
        content = frontend_file.read_text(encoding="utf-8")
        
        # 查找并替换日期
        # 匹配类似: return "2026-03-01"; // 测试用，模拟1月1日
        pattern = r'return\s+"(\d{4}-\d{2}-\d{2})";\s*//\s*测试用'
        replacement = f'return "{date_str}"; // 测试用，模拟日期'
        
        if re.search(pattern, content):
            content = re.sub(pattern, replacement, content)
            frontend_file.write_text(content, encoding="utf-8")
            print(f"✅ 前端日期已更新为: {date_str}")
            return True
        else:
            # 如果没有找到注释，尝试直接匹配日期字符串
            pattern2 = r'return\s+"(\d{4}-\d{2}-\d{2})";'
            if re.search(pattern2, content):
                content = re.sub(
                    pattern2,
                    f'return "{date_str}";',
                    content,
                    count=1  # 只替换第一个匹配
                )
                frontend_file.write_text(content, encoding="utf-8")
                print(f"✅ 前端日期已更新为: {date_str}")
                return True
            else:
                print(f"⚠️  警告: 无法在前端文件中找到日期模式")
                return False
    except Exception as e:
        print(f"❌ 更新前端文件时出错: {e}")
        return False


def update_backend_default_date(date_str: str) -> bool:
    """更新后端的默认模拟日期"""
    project_root = get_project_root()
    backend_file = project_root / "backend" / "core" / "views.py"
    
    if not backend_file.exists():
        print(f"❌ 错误: 找不到后端文件 {backend_file}")
        return False
    
    try:
        # 读取文件内容
        content = backend_file.read_text(encoding="utf-8")
        
        # 更新两个函数中的默认日期
        # 匹配模式: os.getenv("MOCK_DATE", "2026-03-01")
        pattern = r'os\.getenv\("MOCK_DATE",\s*"(\d{4}-\d{2}-\d{2})"'
        replacement = f'os.getenv("MOCK_DATE", "{date_str}"'
        content = re.sub(pattern, replacement, content)
        
        backend_file.write_text(content, encoding="utf-8")
        print(f"✅ 后端默认日期已更新为: {date_str}")
        return True
    except Exception as e:
        print(f"❌ 更新后端文件时出错: {e}")
        return False


def update_backend_env_file(date_str: str) -> bool:
    """更新或创建后端 .env 文件中的 MOCK_DATE"""
    project_root = get_project_root()
    env_file = project_root / "backend" / ".env.local"
    
    try:
        # 读取现有文件（如果存在）
        env_vars = {}
        if env_file.exists():
            content = env_file.read_text(encoding="utf-8")
            for line in content.splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip()
        
        # 更新或添加 MOCK_DATE
        env_vars["MOCK_DATE"] = date_str
        
        # 写入文件
        lines = []
        if env_file.exists():
            # 保留原有的注释和其他配置
            content = env_file.read_text(encoding="utf-8")
            lines = content.splitlines()
            
            # 更新或添加 MOCK_DATE
            found = False
            for i, line in enumerate(lines):
                if line.strip().startswith("MOCK_DATE="):
                    lines[i] = f"MOCK_DATE={date_str}"
                    found = True
                    break
            
            if not found:
                # 添加新的 MOCK_DATE 行
                lines.append(f"MOCK_DATE={date_str}")
        else:
            lines = [f"# 模拟日期配置", f"MOCK_DATE={date_str}"]
        
        env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"✅ 后端环境变量文件已更新: {env_file}")
        return True
    except Exception as e:
        print(f"❌ 更新环境变量文件时出错: {e}")
        return False


def main():
    """主函数"""
    print("=" * 50)
    print("设置模拟日期工具")
    print("=" * 50)
    print()
    
    # 显示当前日期
    project_root = get_project_root()
    frontend_file = project_root / "frontend" / "src" / "utils" / "dateUtils.ts"
    if frontend_file.exists():
        content = frontend_file.read_text(encoding="utf-8")
        match = re.search(r'return\s+"(\d{4}-\d{2}-\d{2})"', content)
        if match:
            current_date = match.group(1)
            print(f"📅 当前设置的模拟日期: {current_date}")
            print()
    
    # 获取用户输入
    while True:
        date_input = input("请输入新的模拟日期 (格式: YYYY-MM-DD，例如 2026-03-01，直接回车使用当前真实日期): ").strip()
        
        if not date_input:
            # 使用当前日期
            today = datetime.now()
            date_str = today.strftime("%Y-%m-%d")
            print(f"📅 将使用当前真实日期: {date_str}")
            break
        
        if validate_date(date_input):
            date_str = date_input
            break
        else:
            print("❌ 日期格式不正确，请输入 YYYY-MM-DD 格式的日期（例如: 2026-03-01）")
    
    print()
    print("正在更新配置...")
    print("-" * 50)
    
    # 更新前端
    frontend_success = update_frontend_date(date_str)
    
    # 更新后端默认值
    backend_success = update_backend_default_date(date_str)
    
    # 更新环境变量文件（可选，但推荐）
    env_success = update_backend_env_file(date_str)
    
    print("-" * 50)
    print()
    
    if frontend_success and backend_success:
        print("=" * 50)
        print("✅ 配置更新完成！")
        print("=" * 50)
        print()
        print(f"📅 模拟日期已设置为: {date_str}")
        print()
        print("下一步操作:")
        print("1. 重启前端服务（如果正在运行）")
        print("2. 重启后端服务（如果正在运行）")
        print("3. 重新加载页面查看效果")
        print()
        return 0
    else:
        print("=" * 50)
        print("⚠️  配置更新部分失败，请检查上面的错误信息")
        print("=" * 50)
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n操作已取消")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

