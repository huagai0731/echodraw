-- 修复 EmailVerification 表的 AUTO_INCREMENT 问题
-- 执行方法：mysql -u用户名 -p数据库名 < fix_emailverification.sql
-- 或者登录 MySQL 后执行下面的 SQL

-- 修复 core_emailverification 表
ALTER TABLE `core_emailverification`
MODIFY COLUMN `id` BIGINT AUTO_INCREMENT NOT NULL;

-- 验证修复是否成功（可选）
-- SELECT COLUMN_TYPE, EXTRA, IS_NULLABLE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
-- AND TABLE_NAME = 'core_emailverification'
-- AND COLUMN_NAME = 'id';

