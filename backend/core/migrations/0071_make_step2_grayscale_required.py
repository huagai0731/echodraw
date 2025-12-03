# Generated manually to make step2_grayscale required

import config.storage
import core.models
from django.db import migrations, models


def delete_incomplete_records(apps, schema_editor):
    """
    删除所有 step2_grayscale 为 NULL 的记录
    新流程要求 step2_grayscale 必须有值（用于保存RGB转明度图）
    """
    VisualAnalysisResult = apps.get_model('core', 'VisualAnalysisResult')
    incomplete = VisualAnalysisResult.objects.filter(step2_grayscale__isnull=True)
    count = incomplete.count()
    incomplete.delete()
    print(f"已删除 {count} 条 step2_grayscale 为 NULL 的记录")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0070_make_visual_analysis_fields_required"),
    ]

    operations = [
        # 先删除不符合要求的旧数据
        migrations.RunPython(delete_incomplete_records, migrations.RunPython.noop),
        # 然后将字段改为必填
        migrations.AlterField(
            model_name="visualanalysisresult",
            name="step2_grayscale",
            field=models.ImageField(
                blank=False,
                help_text="第二步：RGB转明度（新流程中用于保存RGB转明度图）",
                null=False,
                storage=config.storage.TOSMediaStorage(),
                upload_to=core.models.visual_analysis_step2_upload_path,
            ),
        ),
    ]

