from __future__ import annotations

from typing import Any

from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from core.models import AuthToken


class AuthTokenAuthentication(BaseAuthentication):
    """
    简单的 Token 鉴权实现，使用数据库中的 `AuthToken`。
    期待客户端在请求头中携带 `Authorization: Token <key>`。
    """

    keyword = "Token"

    def authenticate(self, request) -> tuple[Any, AuthToken] | None:
        auth = get_authorization_header(request).decode("utf-8")
        if not auth:
            return None

        if not auth.startswith(f"{self.keyword} "):
            return None

        key = auth[len(self.keyword) :].strip()
        if not key:
            return None

        try:
            token = AuthToken.objects.select_related("user").get(key=key)
        except AuthToken.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed("无效的认证令牌") from exc

        # 更新最近使用时间
        AuthToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())

        return token.user, token










