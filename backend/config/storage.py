from __future__ import annotations

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class TOSMediaStorage(S3Boto3Storage):
    """
    Custom storage backend that saves media files to Volcano Engine TOS (S3-compatible).
    """

    bucket_name = settings.TOS_BUCKET
    location = settings.TOS_MEDIA_LOCATION
    file_overwrite = False
    default_acl = "public-read"
    object_parameters = {
        "CacheControl": "max-age=31536000, public",
    }

    def __init__(self, *args, **kwargs):
        if settings.TOS_CUSTOM_DOMAIN:
            kwargs.setdefault("custom_domain", settings.TOS_CUSTOM_DOMAIN)
        super().__init__(*args, **kwargs)

