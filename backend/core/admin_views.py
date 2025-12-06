from __future__ import annotations

from datetime import datetime

from django.db.models import Prefetch, Q
from django.utils.dateparse import parse_date
from django.utils.timezone import make_aware
from rest_framework import generics, viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model

from core.models import (
    ConditionalMessage,
    DailyCheckIn,
    DailyHistoryMessage,
    DailyQuiz,
    DailyQuizOption,
    EncouragementMessage,
    HolidayMessage,
    LongTermPlanCopy,
    MonthlyReportTemplate,
    ShortTermTaskPreset,
    Test,
    TestAccountProfile,
    TestDimension,
    TestOptionText,
    TestOption,
    TestQuestion,
    UserTestResult,
    UploadConditionalMessage,
    UserUpload,
)
from core.permissions import IsStaffUser
from core.serializers import (
    ConditionalMessageSerializer,
    DailyHistoryMessageSerializer,
    DailyQuizSerializer,
    DailyQuizOptionSerializer,
    EncouragementMessageSerializer,
    HolidayMessageSerializer,
    LongTermPlanCopySerializer,
    MonthlyReportTemplateSerializer,
    ShortTermTaskPresetSerializer,
    TestAccountCheckInSerializer,
    TestAccountSerializer,
    TestAccountUploadSerializer,
    TestDimensionSerializer,
    TestOptionTextSerializer,
    TestOptionSerializer,
    TestQuestionSerializer,
    TestSerializer,
    UploadConditionalMessageSerializer,
    UserTestResultSerializer,
)

User = get_user_model()


class DailyHistoryMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = DailyHistoryMessage.objects.all().order_by("-date", "-updated_at")
    serializer_class = DailyHistoryMessageSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None  # 禁用分页，后台管理页面返回完整列表


class EncouragementMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = EncouragementMessage.objects.all().order_by("-updated_at")
    serializer_class = EncouragementMessageSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class ConditionalMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = ConditionalMessage.objects.all().order_by("priority", "id")
    serializer_class = ConditionalMessageSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class HolidayMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = HolidayMessage.objects.all().order_by("month", "day")
    serializer_class = HolidayMessageSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class UploadConditionalMessageAdminViewSet(viewsets.ModelViewSet):
    queryset = UploadConditionalMessage.objects.all().order_by("priority", "id")
    serializer_class = UploadConditionalMessageSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class MonthlyReportTemplateAdminViewSet(viewsets.ModelViewSet):
    queryset = MonthlyReportTemplate.objects.all().order_by("section", "priority", "id")
    serializer_class = MonthlyReportTemplateSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None
    
    def get_queryset(self):
        queryset = MonthlyReportTemplate.objects.all().order_by("section", "priority", "id")
        
        # 支持按部分筛选
        section = self.request.query_params.get("section")
        if section:
            queryset = queryset.filter(section=section)
        
        return queryset


class ShortTermTaskPresetAdminViewSet(viewsets.ModelViewSet):
    queryset = ShortTermTaskPreset.objects.all().order_by("display_order", "code")
    serializer_class = ShortTermTaskPresetSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class LongTermPlanCopyAdminViewSet(viewsets.ModelViewSet):
    queryset = LongTermPlanCopy.objects.all().order_by("min_hours", "max_hours", "id")
    serializer_class = LongTermPlanCopySerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class TestAccountViewSet(viewsets.ModelViewSet):
    queryset = TestAccountProfile.objects.select_related("user").all()
    serializer_class = TestAccountSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None

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


# ==================== 测试管理 ====================

class TestDimensionAdminViewSet(viewsets.ModelViewSet):
    queryset = TestDimension.objects.all().order_by("display_order", "code")
    serializer_class = TestDimensionSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class TestAdminViewSet(viewsets.ModelViewSet):
    queryset = Test.objects.prefetch_related("dimensions", "questions__option_texts__options").all().order_by("display_order", "slug")
    serializer_class = TestSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class TestQuestionAdminViewSet(viewsets.ModelViewSet):
    queryset = TestQuestion.objects.select_related("test").prefetch_related("option_texts__options").all().order_by(
        "test", "display_order", "id"
    )
    serializer_class = TestQuestionSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class TestOptionTextAdminViewSet(viewsets.ModelViewSet):
    queryset = TestOptionText.objects.select_related("question", "question__test").prefetch_related("options").all().order_by(
        "question", "display_order", "id"
    )
    serializer_class = TestOptionTextSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class TestOptionAdminViewSet(viewsets.ModelViewSet):
    queryset = TestOption.objects.select_related("option_text", "option_text__question", "dimension").all().order_by(
        "option_text", "id"
    )
    serializer_class = TestOptionSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


class UserTestResultAdminViewSet(viewsets.ModelViewSet):
    queryset = UserTestResult.objects.select_related("user", "test").all().order_by("-completed_at")
    serializer_class = UserTestResultSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None


# ==================== 每日小测 ====================

class DailyQuizAdminViewSet(viewsets.ModelViewSet):
    queryset = DailyQuiz.objects.prefetch_related("options").all().order_by("-date")
    serializer_class = DailyQuizSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None
    
    def get_parser_classes(self):
        from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
        return [MultiPartParser, FormParser, JSONParser]
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class DailyQuizOptionAdminViewSet(viewsets.ModelViewSet):
    queryset = DailyQuizOption.objects.select_related("quiz").all().order_by("quiz", "display_order", "id")
    serializer_class = DailyQuizOptionSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None
    
    def get_parser_classes(self):
        from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
        return [MultiPartParser, FormParser, JSONParser]


