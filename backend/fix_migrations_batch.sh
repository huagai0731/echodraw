#!/bin/bash
# 批量修复迁移冲突脚本
# 自动检测并 fake 已存在表/字段的迁移

set -e

cd "$(dirname "$0")"
echo "=========================================="
echo "批量修复迁移冲突"
echo "=========================================="
echo ""

# 检查并 fake 迁移的函数
check_and_fake() {
    local migration_name=$1
    local check_type=$2  # "table" 或 "field"
    local check_name=$3  # 表名或 "表名.字段名"
    
    echo "检查迁移: $migration_name"
    
    if [ "$check_type" = "table" ]; then
        # 检查表是否存在
        exists=$(python3 manage.py dbshell -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '$check_name';" 2>/dev/null | tail -1 | tr -d ' ')
    elif [ "$check_type" = "field" ]; then
        # 检查字段是否存在
        table_name=$(echo "$check_name" | cut -d'.' -f1)
        field_name=$(echo "$check_name" | cut -d'.' -f2)
        exists=$(python3 manage.py dbshell -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '$table_name' AND column_name = '$field_name';" 2>/dev/null | tail -1 | tr -d ' ')
    fi
    
    if [ "$exists" = "1" ] || [ "$exists" = "1L" ]; then
        echo "  ✅ $check_name 已存在，标记迁移为已应用..."
        python3 manage.py migrate --fake core "$migration_name" 2>&1 | grep -v "RuntimeWarning" | grep -v "WARNINGS" || true
        echo "  ✅ 已标记"
        return 0
    else
        echo "  ⏭️  $check_name 不存在，跳过"
        return 1
    fi
}

echo "步骤 1: 检查并修复迁移 0043 (ShortTermGoalTaskCompletion 表)"
check_and_fake "0043_add_short_term_goal_task_completion" "table" "core_shorttermgoaltaskcompletion"
echo ""

echo "步骤 2: 检查并修复迁移 0044 (dailycheckin.notes 字段)"
check_and_fake "0044_add_daily_checkin_notes" "field" "core_dailycheckin.notes"
echo ""

echo "步骤 3: 检查并修复迁移 0045 (dailycheckin.checked_at 字段)"
# 0045 是修改字段，字段肯定存在，直接检查是否需要 fake
echo "  检查 checked_at 字段..."
field_exists=$(python3 manage.py dbshell -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'core_dailycheckin' AND column_name = 'checked_at';" 2>/dev/null | tail -1 | tr -d ' ')
if [ "$field_exists" = "1" ] || [ "$field_exists" = "1L" ]; then
    echo "  ✅ checked_at 字段存在，标记迁移为已应用..."
    python3 manage.py migrate --fake core "0045_change_checked_at_to_auto_now" 2>&1 | grep -v "RuntimeWarning" | grep -v "WARNINGS" || true
    echo "  ✅ 已标记"
else
    echo "  ⏭️  checked_at 字段不存在，跳过"
fi
echo ""

echo "=========================================="
echo "运行剩余迁移..."
echo "=========================================="
python3 manage.py migrate 2>&1 | grep -v "RuntimeWarning" | grep -v "WARNINGS" || {
    echo ""
    echo "❌ 迁移过程中出现错误，请检查上面的错误信息"
    exit 1
}

echo ""
echo "=========================================="
echo "验证迁移状态..."
echo "=========================================="
python3 manage.py showmigrations core | tail -15

echo ""
echo "=========================================="
echo "✅ 批量修复完成！"
echo "=========================================="





