from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import AuthToken, DailyHistoryMessage, TestAccountProfile


class AdminApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.staff_user = user_model.objects.create_user(
            username="staff@example.com",
            email="staff@example.com",
            password="SuperSecret123",
        )
        self.staff_user.is_staff = True
        self.staff_user.save(update_fields=["is_staff"])
        staff_token = AuthToken.issue_for_user(self.staff_user)
        self.staff_headers = {"HTTP_AUTHORIZATION": f"Token {staff_token}"}

        self.normal_user = user_model.objects.create_user(
            username="user@example.com",
            email="user@example.com",
            password="Password123",
        )
        normal_token = AuthToken.issue_for_user(self.normal_user)
        self.normal_headers = {"HTTP_AUTHORIZATION": f"Token {normal_token}"}

    def test_current_user_returns_staff_flag(self):
        url = reverse("current-user")
        response = self.client.get(url, **self.staff_headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertTrue(payload["is_staff"])
        self.assertEqual(payload["email"], "staff@example.com")

    def test_non_staff_forbidden_for_admin_routes(self):
        url = reverse("admin-home-history-list")
        response = self.client.get(url, **self.normal_headers)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_create_history_message(self):
        url = reverse("admin-home-history-list")
        payload = {
            "date": date.today().isoformat(),
            "text": "历史上的今天，Echo 上线。",
            "headline": "Echo 上线",
            "is_active": True,
        }
        response = self.client.post(url, payload, format="json", **self.staff_headers)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(DailyHistoryMessage.objects.count(), 1)

    def test_create_test_account_and_checkins(self):
        # 创建测试账号
        url = reverse("admin-test-accounts-list")
        payload = {
            "email": "tester@example.com",
            "password": "TesterPass123",
            "display_name": "测试账号A",
            "tags": ["demo"],
        }
        response = self.client.post(url, payload, format="json", **self.staff_headers)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        profile_id = response.json()["id"]
        profile = TestAccountProfile.objects.get(pk=profile_id)
        self.assertEqual(profile.user.email, "tester@example.com")

        # 创建打卡记录
        checkin_url = reverse("admin-test-account-checkins", kwargs={"profile_pk": profile_id})
        payload = {"date": date.today().isoformat(), "source": "admin"}
        response = self.client.post(checkin_url, payload, format="json", **self.staff_headers)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(profile.user.daily_checkins.count(), 1)
