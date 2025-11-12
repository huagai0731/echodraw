from __future__ import annotations

from datetime import datetime

from django.db.models import Q
from django.utils.dateparse import parse_date
from django.utils.timezone import make_aware
from rest_framework import generics, viewsets

from core.models import (
    DailyCheckIn,
    DailyHistoryMessage,
    EncouragementMessage,
    LongTermPlanCopy,
    ShortTermTaskPreset,
    TestAccountProfile,
    UploadConditionalMessage,
    UserUpload,
)
from core.permissions import IsStaffUser
from core.serializers import (
    AchievementSerializer,
    DailyHistoryMessageSerializer,
    EncouragementMessageSerializer,
    LongTermPlanCopySerializer,
    ShortTermTaskPresetSerializer,
    TestAccountCheckInSerializer,
    TestAccountSerializer,
    TestAccountUploadSerializer,
    UploadConditionalMessageSerializer,
)
from core.models import Achievement


class DailyHistoryMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = DailyHistoryMessage.objects.all().order_by("-date", "-updated_at")
    serializer_class = DailyHistoryMessageSerializer
    permission_classes = [IsStaffUser]


class EncouragementMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = EncouragementMessage.objects.all().order_by("-updated_at")
    serializer_class = EncouragementMessageSerializer
    permission_classes = [IsStaffUser]


class UploadConditionalMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = UploadConditionalMessage.objects.all().order_by("priority", "id")
    serializer_class = UploadConditionalMessageSerializer
    permission_classes = [IsStaffUser]


class AchievementAdminViewSet(viewsets.ModelViewSet):
    queryset = Achievement.objects.all().order_by("display_order", "slug")
    serializer_class = AchievementSerializer
    permission_classes = [IsStaffUser]


class ShortTermTaskPresetAdminViewSet(viewsets.ModelViewSet):
    queryset = ShortTermTaskPreset.objects.all().order_by("display_order", "code")
    serializer_class = ShortTermTaskPresetSerializer
    permission_classes = [IsStaffUser]


class LongTermPlanCopyAdminViewSet(viewsets.ModelViewSet):
    queryset = LongTermPlanCopy.objects.all().order_by("min_hours", "max_hours", "id")
    serializer_class = LongTermPlanCopySerializer
    permission_classes = [IsStaffUser]


class TestAccountViewSet(viewsets.ModelViewSet):
    queryset = TestAccountProfile.objects.select_related("user").all()
    serializer_class = TestAccountSerializer
    permission_classes = [IsStaffUser]

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        tag = self.request.query_params.get("tag", "").strip()

        if search:
            queryset = queryset.filter(
                Q(user__email__icontains=search) | Q(display_name__icontains=search)
            )

        if tag:
            queryset = queryset.filter(tags__contains=[tag])

        return queryset.order_by("user__email")


class _BaseTestAccountChildView:
    permission_classes = [IsStaffUser]

    def _get_profile(self) -> TestAccountProfile:
        return generics.get_object_or_404(
            TestAccountProfile.objects.select_related("user"),
            pk=self.kwargs["profile_pk"],
        )


class TestAccountCheckInListCreateView(_BaseTestAccountChildView, generics.ListCreateAPIView):
    serializer_class = TestAccountCheckInSerializer

    def get_queryset(self):
        profile = self._get_profile()
        queryset = DailyCheckIn.objects.filter(user=profile.user).order_by("-date")

        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")

        if start:
            start_date = parse_date(start)
            if start_date:
                queryset = queryset.filter(date__gte=start_date)
        if end:
            end_date = parse_date(end)
            if end_date:
                queryset = queryset.filter(date__lte=end_date)

        return queryset

    def perform_create(self, serializer: TestAccountCheckInSerializer):
        profile = self._get_profile()
        serializer.save(user=profile.user)


class TestAccountCheckInDetailView(_BaseTestAccountChildView, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TestAccountCheckInSerializer
    lookup_field = "pk"
    lookup_url_kwarg = "checkin_pk"

    def get_queryset(self):
        profile = self._get_profile()
        return DailyCheckIn.objects.filter(user=profile.user).order_by("-date")


class TestAccountUploadListCreateView(_BaseTestAccountChildView, generics.ListCreateAPIView):
    serializer_class = TestAccountUploadSerializer

    def get_queryset(self):
        profile = self._get_profile()
        queryset = UserUpload.objects.filter(user=profile.user).order_by("-uploaded_at")

        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")

        def parse_datetime(value: str) -> datetime | None:
            try:
                return make_aware(datetime.fromisoformat(value))
            except (TypeError, ValueError):
                return None

        if start:
            start_dt = parse_datetime(start)
            if start_dt:
                queryset = queryset.filter(uploaded_at__gte=start_dt)
        if end:
            end_dt = parse_datetime(end)
            if end_dt:
                queryset = queryset.filter(uploaded_at__lte=end_dt)

        return queryset

    def perform_create(self, serializer: TestAccountUploadSerializer):
        profile = self._get_profile()
        serializer.save(user=profile.user)


class TestAccountUploadDetailView(_BaseTestAccountChildView, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TestAccountUploadSerializer
    lookup_field = "pk"
    lookup_url_kwarg = "upload_pk"

    def get_queryset(self):
        profile = self._get_profile()
        return UserUpload.objects.filter(user=profile.user).order_by("-uploaded_at")

