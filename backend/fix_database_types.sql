-- 修复数据库字段类型问题（从 SQLite 迁移后可能出现的字符串类型数值字段）
-- 注意：运行前请备份数据库！

-- 修复 EncouragementMessage.weight
UPDATE core_encouragementmessage 
SET weight = CAST(weight AS UNSIGNED) 
WHERE weight IS NOT NULL AND weight != '';

-- 修复 ConditionalMessage 的数值字段
UPDATE core_conditionalmessage 
SET min_total_checkins = CAST(min_total_checkins AS UNSIGNED) 
WHERE min_total_checkins IS NOT NULL AND min_total_checkins != '';

UPDATE core_conditionalmessage 
SET max_total_checkins = CAST(max_total_checkins AS UNSIGNED) 
WHERE max_total_checkins IS NOT NULL AND max_total_checkins != '';

UPDATE core_conditionalmessage 
SET min_streak_days = CAST(min_streak_days AS UNSIGNED) 
WHERE min_streak_days IS NOT NULL AND min_streak_days != '';

UPDATE core_conditionalmessage 
SET max_streak_days = CAST(max_streak_days AS UNSIGNED) 
WHERE max_streak_days IS NOT NULL AND max_streak_days != '';

UPDATE core_conditionalmessage 
SET min_total_uploads = CAST(min_total_uploads AS UNSIGNED) 
WHERE min_total_uploads IS NOT NULL AND min_total_uploads != '';

UPDATE core_conditionalmessage 
SET max_total_uploads = CAST(max_total_uploads AS UNSIGNED) 
WHERE max_total_uploads IS NOT NULL AND max_total_uploads != '';

-- 修复 UploadConditionalMessage 的数值字段
UPDATE core_uploadconditionalmessage 
SET min_total_uploads = CAST(min_total_uploads AS UNSIGNED) 
WHERE min_total_uploads IS NOT NULL AND min_total_uploads != '';

UPDATE core_uploadconditionalmessage 
SET max_total_uploads = CAST(max_total_uploads AS UNSIGNED) 
WHERE max_total_uploads IS NOT NULL AND max_total_uploads != '';

UPDATE core_uploadconditionalmessage 
SET min_total_hours = CAST(min_total_hours AS DECIMAL(10,2)) 
WHERE min_total_hours IS NOT NULL AND min_total_hours != '';

UPDATE core_uploadconditionalmessage 
SET max_total_hours = CAST(max_total_hours AS DECIMAL(10,2)) 
WHERE max_total_hours IS NOT NULL AND max_total_hours != '';

UPDATE core_uploadconditionalmessage 
SET min_avg_hours = CAST(min_avg_hours AS DECIMAL(10,2)) 
WHERE min_avg_hours IS NOT NULL AND min_avg_hours != '';

UPDATE core_uploadconditionalmessage 
SET max_avg_hours = CAST(max_avg_hours AS DECIMAL(10,2)) 
WHERE max_avg_hours IS NOT NULL AND max_avg_hours != '';

-- 修复 LongTermGoal 的数值字段
UPDATE core_longtermgoal 
SET target_hours = CAST(target_hours AS DECIMAL(10,2)) 
WHERE target_hours IS NOT NULL AND target_hours != '';

UPDATE core_longtermgoal 
SET checkpoint_count = CAST(checkpoint_count AS UNSIGNED) 
WHERE checkpoint_count IS NOT NULL AND checkpoint_count != '';

-- 注意：这个脚本只修复数据，不修改表结构
-- 如果表结构本身有问题，需要运行 Django 迁移








