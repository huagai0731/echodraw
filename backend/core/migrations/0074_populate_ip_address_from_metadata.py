"""
数据迁移：从metadata中提取IP地址填充到ip_address字段

这个迁移会：
1. 从现有EmailVerification记录的metadata中提取IP地址
2. 填充到新添加的ip_address字段
3. 对于没有IP地址的记录，ip_address保持为空字符串（blank=True）
"""

from django.db import migrations


def populate_ip_address(apps, schema_editor):
    """从metadata中提取IP地址并填充到ip_address字段"""
    EmailVerification = apps.get_model('core', 'EmailVerification')
    
    # 更新所有有metadata.ip的记录
    updated_count = 0
    for verification in EmailVerification.objects.all():
        if verification.metadata and isinstance(verification.metadata, dict):
            ip = verification.metadata.get('ip')
            if ip and not verification.ip_address:
                verification.ip_address = ip
                verification.save(update_fields=['ip_address'])
                updated_count += 1
    
    print(f"已更新 {updated_count} 条记录的ip_address字段")


def reverse_populate_ip_address(apps, schema_editor):
    """反向迁移：清空ip_address字段（可选，通常不需要）"""
    EmailVerification = apps.get_model('core', 'EmailVerification')
    EmailVerification.objects.all().update(ip_address='')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0073_add_ip_address_to_emailverification'),
    ]

    operations = [
        migrations.RunPython(
            populate_ip_address,
            reverse_populate_ip_address,
        ),
    ]

