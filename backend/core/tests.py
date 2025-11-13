from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import AuthToken, DailyHistoryMessage, TestAccountProfile, Achievement, AchievementGroup


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

    def test_create_achievement(self):
        url = reverse("admin-achievements-list")
        payload = {
            "slug": "upload-10",
            "name": "创作新星",
            "description": "累计上传 10 次作品。",
            "condition": {"metric": "total_uploads", "operator": ">=", "threshold": 10},
        }
        response = self.client.post(url, payload, format="json", **self.staff_headers)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(Achievement.objects.count(), 1)

    def test_profile_achievements_requires_auth(self):
        url = reverse("profile-achievements")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_achievements_returns_data(self):
        Achievement.objects.all().delete()
        group = AchievementGroup.objects.create(
            slug="world-trace",
            name="世界留痕",
            category="累计类",
        )
        Achievement.objects.create(
            slug="world-trace-1",
            name="世界留痕 1",
            description="每个旅程都从一笔开始",
            category="累计类",
            group=group,
            level=1,
            condition={"metric": "total_uploads", "operator": ">=", "threshold": 1},
            metadata={"condition_text": "上传第1幅作品"},
        )
        Achievement.objects.create(
            slug="world-trace-2",
            name="世界留痕 2",
            description="线条开始有了方向。",
            category="累计类",
            group=group,
            level=2,
            condition={"metric": "total_uploads", "operator": ">=", "threshold": 10},
            metadata={"condition_text": "上传第10幅作品"},
        )

        url = reverse("profile-achievements")
        response = self.client.get(url, **self.normal_headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        payload = response.json()
        summary = payload.get("summary")
        groups = payload.get("groups")
        standalone = payload.get("standalone")

        self.assertIsInstance(summary, dict)
        self.assertEqual(summary.get("group_count"), 1)
        self.assertEqual(summary.get("standalone_count"), 0)
        self.assertEqual(summary.get("achievement_count"), 2)
        self.assertIsInstance(groups, list)
        self.assertEqual(len(groups), 1)
        self.assertIsInstance(standalone, list)
        self.assertEqual(len(standalone), 0)

        group_payload = groups[0]
        self.assertEqual(group_payload["slug"], "world-trace")
        levels = group_payload.get("levels")
        self.assertEqual(len(levels), 2)
        self.assertEqual({level["slug"] for level in levels}, {"world-trace-1", "world-trace-2"})
        self.assertEqual(group_payload.get("summary", {}).get("level_count"), 2)
