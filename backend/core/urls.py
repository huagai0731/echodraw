from django.urls import path, include
from rest_framework.routers import DefaultRouter

from core import views
from core.admin_views import (
    AchievementAdminViewSet,
    AchievementGroupAdminViewSet,
    ConditionalMessageAdminViewSet,
    DailyHistoryMessageAdminViewSet,
    DailyQuizAdminViewSet,
    DailyQuizOptionAdminViewSet,
    EncouragementMessageAdminViewSet,
    HolidayMessageAdminViewSet,
    LongTermPlanCopyAdminViewSet,
    ShortTermTaskPresetAdminViewSet,
    TestAccountCheckInDetailView,
    TestAccountCheckInListCreateView,
    TestAccountUploadDetailView,
    TestAccountUploadListCreateView,
    TestAccountViewSet,
    TestAdminViewSet,
    TestDimensionAdminViewSet,
    TestOptionTextAdminViewSet,
    TestOptionAdminViewSet,
    TestQuestionAdminViewSet,
    UploadConditionalMessageAdminViewSet,
    UserTestResultAdminViewSet,
)

router = DefaultRouter()
router.register(
    r"admin/home/history",
    DailyHistoryMessageAdminViewSet,
    basename="admin-home-history",
)
router.register(
    r"admin/home/encouragements",
    EncouragementMessageAdminViewSet,
    basename="admin-home-encouragements",
)
router.register(
    r"admin/home/conditionals",
    ConditionalMessageAdminViewSet,
    basename="admin-home-conditionals",
)
router.register(
    r"admin/home/holidays",
    HolidayMessageAdminViewSet,
    basename="admin-home-holidays",
)
router.register(
    r"admin/home/upload-conditionals",
    UploadConditionalMessageAdminViewSet,
    basename="admin-home-upload-conditionals",
)
router.register(
    r"admin/achievements",
    AchievementAdminViewSet,
    basename="admin-achievements",
)
router.register(
    r"admin/achievement-groups",
    AchievementGroupAdminViewSet,
    basename="admin-achievement-groups",
)
router.register(
    r"admin/goals/short-term-presets",
    ShortTermTaskPresetAdminViewSet,
    basename="admin-short-term-presets",
)
router.register(
    r"admin/goals/long-term-copy",
    LongTermPlanCopyAdminViewSet,
    basename="admin-long-term-copy",
)
router.register(
    r"admin/test-accounts",
    TestAccountViewSet,
    basename="admin-test-accounts",
)
router.register(
    r"admin/tests/dimensions",
    TestDimensionAdminViewSet,
    basename="admin-test-dimensions",
)
router.register(
    r"admin/tests",
    TestAdminViewSet,
    basename="admin-tests",
)
router.register(
    r"admin/tests/questions",
    TestQuestionAdminViewSet,
    basename="admin-test-questions",
)
router.register(
    r"admin/tests/option-texts",
    TestOptionTextAdminViewSet,
    basename="admin-test-option-texts",
)
router.register(
    r"admin/tests/options",
    TestOptionAdminViewSet,
    basename="admin-test-options",
)
router.register(
    r"admin/tests/results",
    UserTestResultAdminViewSet,
    basename="admin-test-results",
)
router.register(
    r"admin/daily-quiz",
    DailyQuizAdminViewSet,
    basename="admin-daily-quiz",
)
router.register(
    r"admin/daily-quiz/options",
    DailyQuizOptionAdminViewSet,
    basename="admin-daily-quiz-options",
)

urlpatterns = [
    path("health/", views.health_check, name="health-check"),
    path("auth/send-code/", views.send_verification_code, name="send-code"),
    path("auth/register/", views.register, name="register"),
    path("auth/reset-password/", views.reset_password, name="reset-password"),
    path("auth/login/", views.login, name="login"),
    path("auth/me/", views.current_user, name="current-user"),
    path(
        "profile/preferences/",
        views.ProfilePreferenceView.as_view(),
        name="profile-preferences",
    ),
    path(
        "profile/achievements/",
        views.profile_achievements,
        name="profile-achievements",
    ),
    path("uploads/", views.UserUploadListCreateView.as_view(), name="user-uploads"),
    path("uploads/<int:pk>/", views.UserUploadDetailView.as_view(), name="user-upload-detail"),
    path("uploads/<int:pk>/image/", views.UserUploadImageView.as_view(), name="user-upload-image"),
    path("homepage/messages/", views.homepage_messages, name="homepage-messages"),
    path("goals/calendar/", views.goals_calendar, name="goals-calendar"),
    path("goals/check-in/", views.check_in, name="goals-check-in"),
    path(
        "goals/short-term/",
        views.ShortTermGoalListCreateView.as_view(),
        name="goals-short-term",
    ),
    path(
        "goals/short-term/<int:pk>/",
        views.ShortTermGoalDetailView.as_view(),
        name="goals-short-term-detail",
    ),
    path(
        "goals/short-term/my-presets/",
        views.UserTaskPresetListCreateView.as_view(),
        name="goals-short-term-my-presets",
    ),
    path(
        "goals/short-term/my-presets/<int:pk>/",
        views.UserTaskPresetDetailView.as_view(),
        name="goals-short-term-my-presets-detail",
    ),
    path(
        "goals/short-term/presets/",
        views.short_term_task_presets,
        name="goals-short-term-presets",
    ),
    path(
        "goals/long-term/",
        views.LongTermGoalView.as_view(),
        name="goals-long-term",
    ),
    path(
        "goals/long-term-copy/",
        views.LongTermPlanCopyListView.as_view(),
        name="goals-long-term-copy",
    ),
    path(
        "admin/test-accounts/<int:profile_pk>/checkins/",
        TestAccountCheckInListCreateView.as_view(),
        name="admin-test-account-checkins",
    ),
    path(
        "admin/test-accounts/<int:profile_pk>/checkins/<int:checkin_pk>/",
        TestAccountCheckInDetailView.as_view(),
        name="admin-test-account-checkin-detail",
    ),
    path(
        "admin/test-accounts/<int:profile_pk>/uploads/",
        TestAccountUploadListCreateView.as_view(),
        name="admin-test-account-uploads",
    ),
    path(
        "admin/test-accounts/<int:profile_pk>/uploads/<int:upload_pk>/",
        TestAccountUploadDetailView.as_view(),
        name="admin-test-account-upload-detail",
    ),
    path("", include(router.urls)),
]

