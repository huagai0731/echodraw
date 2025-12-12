"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path

def wechat_verify_file(request, verify_code):
    """返回微信验证文件内容"""
    # verify_code 是从 URL 中提取的验证码部分
    # URL格式：/MP_verify_验证码.txt
    return HttpResponse(verify_code, content_type="text/plain; charset=utf-8")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(("core.urls", "core"), namespace="core")),
    # 微信验证文件路由（用于网页授权域名验证）
    # 匹配格式：/MP_verify_验证码.txt
    path("MP_verify_<str:verify_code>.txt", wechat_verify_file, name="wechat-verify-file"),
]

# 开发环境：Django 直接提供静态文件和媒体文件
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
