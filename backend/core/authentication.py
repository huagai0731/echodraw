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

        # 检查token是否过期
        if token.is_expired:
            raise exceptions.AuthenticationFailed("认证令牌已过期，请重新登录")

        # 更新最近使用时间（如果数据库可写）
        # 如果数据库是只读的，忽略此错误，不影响认证流程
        try:
            AuthToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        except Exception:
            # 数据库可能是只读的，记录警告但不影响认证
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"无法更新 token {token.pk} 的 last_used_at: 数据库可能是只读的",
                exc_info=True
            )

        return token.user, token















