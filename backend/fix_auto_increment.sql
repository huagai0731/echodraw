-- 修复 DailyCheckIn 表的 AUTO_INCREMENT 问题
-- 此脚本用于修复 MySQL 数据库中 id 字段缺少 AUTO_INCREMENT 的问题
-- 执行方法：mysql -u用户名 -p数据库名 < fix_auto_increment.sql

-- 修复 core_dailycheckin 表
ALTER TABLE `core_dailycheckin`
MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL;

-- 检查其他可能有同样问题的表（可选，根据需要取消注释）
-- ALTER TABLE `core_userupload`
-- MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL;

-- ALTER TABLE `core_emailverification`
-- MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL;

-- ALTER TABLE `core_authtoken`
-- MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL;







