# Generated manually for fixed visual analysis flow

import config.storage
import core.models
from django.db import migrations, models


def delete_old_incomplete_records(apps, schema_editor):
    """
    删除所有不符合新固定流程的旧记录
    新流程要求所有字段都必须有值
    """
    from django.db.models import Q
    VisualAnalysisResult = apps.get_model('core', 'VisualAnalysisResult')
    # 删除所有缺少必需字段的记录
    incomplete = VisualAnalysisResult.objects.filter(
        Q(step2_grayscale_3_level__isnull=True) |
        Q(step2_grayscale_4_level__isnull=True) |
        Q(step4_hls_s_inverted__isnull=True) |
        Q(kmeans_segmentation_image__isnull=True)
    )
    count = incomplete.count()
    incomplete.delete()
    print(f"已删除 {count} 条不符合新流程的旧记录")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0069_make_step2_grayscale_optional"),
    ]

    operations = [
        # 先删除不符合要求的旧数据
        migrations.RunPython(delete_old_incomplete_records, migrations.RunPython.noop),
        # 然后将字段改为必填
        migrations.AlterField(
            model_name="visualanalysisresult",
            name="step2_grayscale_3_level",
            field=models.ImageField(
                blank=False,
                help_text="3阶层灰度图（Step1）",
                null=False,
                storage=config.storage.TOSMediaStorage(),
                upload_to=core.models.visual_analysis_step2_grayscale_3_level_upload_path,
            ),
        ),
        migrations.AlterField(
            model_name="visualanalysisresult",
            name="step2_grayscale_4_level",
            field=models.ImageField(
                blank=False,
                help_text="4阶层灰度图（Step1）",
                null=False,
                storage=config.storage.TOSMediaStorage(),
                upload_to=core.models.visual_analysis_step2_grayscale_4_level_upload_path,
            ),
        ),
        migrations.AlterField(
            model_name="visualanalysisresult",
            name="step4_hls_s_inverted",
            field=models.ImageField(
                blank=False,
                help_text="HLS饱和度反色图（Step3）",
                null=False,
                storage=config.storage.TOSMediaStorage(),
                upload_to=core.models.visual_analysis_step4_hls_s_inverted_upload_path,
            ),
        ),
        migrations.AlterField(
            model_name="visualanalysisresult",
            name="kmeans_segmentation_image",
            field=models.ImageField(
                blank=False,
                help_text="K-means色块分割图（Step5）",
                null=False,
                storage=config.storage.TOSMediaStorage(),
                upload_to=core.models.visual_analysis_kmeans_segmentation_upload_path,
            ),
        ),
    ]

