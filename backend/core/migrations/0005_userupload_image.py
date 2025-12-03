from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_alter_emailverification_purpose_dailycheckin"),
    ]

    operations = [
        migrations.AddField(
            model_name="userupload",
            name="image",
            field=models.ImageField(
                blank=True,
                help_text="用户上传的作品图片。",
                null=True,
                upload_to="uploads/%Y/%m/",
            ),
        ),
    ]
































