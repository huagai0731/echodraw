-- 修复 django_migrations 表的 AUTO_INCREMENT 问题
-- 此脚本用于修复 MySQL 数据库中 django_migrations 表的 id 字段缺少 AUTO_INCREMENT 的问题
-- 执行方法：mysql -u用户名 -p数据库名 < fix_django_migrations_auto_increment.sql

-- 修复 django_migrations 表的 id 字段
-- 注意：如果表中有数据，需要先确保 id 值是连续的且没有冲突
ALTER TABLE `django_migrations`
MODIFY COLUMN `id` INT AUTO_INCREMENT NOT NULL;

-- 验证修复
-- 执行以下查询确认 AUTO_INCREMENT 已设置：
-- SELECT COLUMN_NAME, COLUMN_TYPE, EXTRA
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
-- AND TABLE_NAME = 'django_migrations'
-- AND COLUMN_NAME = 'id';







