from django.urls import path, include
from rest_framework.routers import DefaultRouter

from core import views
from core.admin_views import (
    ConditionalMessageAdminViewSet,
    DailyHistoryMessageAdminViewSet,
    DailyQuizAdminViewSet,
    DailyQuizOptionAdminViewSet,
    EncouragementMessageAdminViewSet,
    HolidayMessageAdminViewSet,
    LongTermPlanCopyAdminViewSet,
    MonthlyReportTemplateAdminViewSet,
    PointsOrderAdminViewSet,
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
    r"admin/reports/monthly-templates",
    MonthlyReportTemplateAdminViewSet,
    basename="admin-monthly-report-templates",
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
router.register(
    r"admin/orders",
    PointsOrderAdminViewSet,
    basename="admin-orders",
)

urlpatterns = [
    path("health/", views.health_check, name="health-check"),
    path("debug/timezone/", views.debug_timezone, name="debug-timezone"),
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
        "profile/featured-artworks/",
        views.FeaturedArtworksView.as_view(),
        name="profile-featured-artworks",
    ),
    path(
        "membership/subscribe/",
        views.MembershipSubscriptionView.as_view(),
        name="membership-subscribe",
    ),
    # 支付相关接口
    path("payments/orders/create/", views.create_payment_order, name="create-payment-order"),
    path("payments/alipay/notify/", views.alipay_notify, name="alipay-notify"),
    path("payments/wechat/notify/", views.wechat_notify, name="wechat-notify"),
    path("payments/wechat/oauth/callback/", views.wechat_oauth_callback, name="wechat-oauth-callback"),
    path("payments/orders/<int:order_id>/query-and-sync/", views.query_and_sync_order, name="query-and-sync-order"),
    path("payments/orders/<int:order_id>/sync-membership/", views.sync_order_membership, name="sync-order-membership"),
    path("payments/orders/<int:order_id>/status/", views.get_order_status, name="get-order-status"),
    path("uploads/", views.UserUploadListCreateView.as_view(), name="user-uploads"),
    path("uploads/check-limit/", views.check_upload_limit, name="user-uploads-check-limit"),
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
        "goals/short-term/<int:goal_id>/start/",
        views.start_short_term_goal,
        name="goals-short-term-start",
    ),
    path(
        "goals/short-term/<int:goal_id>/task-completions/",
        views.short_term_goal_task_completions,
        name="goals-short-term-task-completions",
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
    # 更具体的路由需要放在前面
    path(
        "goals/long-term/active/",
        views.LongTermGoalView.as_view(),
        name="goals-long-term-active",
    ),
    path(
        "goals/long-term/completed/",
        views.completed_long_term_goals,
        name="goals-long-term-completed",
    ),
    path(
        "goals/long-term/checkpoint/",
        views.update_checkpoint,
        name="goals-long-term-checkpoint",
    ),
    path(
        "goals/long-term/<int:goal_id>/round/",
        views.update_three_months_round,
        name="goals-long-term-round",
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
        "goals/yearly-presets/",
        views.YearlyGoalPresetView.as_view(),
        name="goals-yearly-presets",
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
    # 用户测试 API
    path("tests/", views.user_tests_list, name="user-tests-list"),
    path("tests/<int:test_id>/", views.user_test_detail, name="user-test-detail"),
    path("tests/submit/", views.user_test_submit, name="user-test-submit"),
    path("tests/results/", views.user_test_results_list, name="user-test-results-list"),
    path("tests/results/<int:result_id>/", views.user_test_result, name="user-test-result"),
    # 标签管理 API
    path("tags/", views.tags_list, name="tags-list"),
    path("tags/manage/", views.TagListCreateView.as_view(), name="tags-manage"),
    path("tags/manage/<int:pk>/", views.TagDetailView.as_view(), name="tags-manage-detail"),
    # 创作状态 API
    path("moods/", views.moods_list, name="moods-list"),
    # 月报 API
    path("reports/monthly/", views.monthly_report, name="monthly-report"),
    # 视觉分析 API
    path("visual-analysis/", views.VisualAnalysisResultListCreateView.as_view(), name="visual-analysis-list"),
    path("visual-analysis/<int:pk>/", views.VisualAnalysisResultDetailView.as_view(), name="visual-analysis-detail"),
    path("visual-analysis/comprehensive/", views.analyze_image_comprehensive, name="visual-analysis-comprehensive"),
    path("visual-analysis/task/<str:task_id>/status/", views.get_image_analysis_task_status, name="visual-analysis-task-status"),
    path("visual-analysis/task/pending/", views.get_pending_image_analysis_task, name="visual-analysis-task-pending"),
    path("visual-analysis/quota/", views.get_visual_analysis_quota, name="visual-analysis-quota"),
    path("visual-analysis/proxy-image/", views.proxy_visual_analysis_image, name="visual-analysis-proxy-image"),
    # 后台管理 API
    path("admin/users/", views.admin_users_list, name="admin-users-list"),
    path("admin/users/uploads/", views.admin_user_uploads, name="admin-user-uploads"),
    path("admin/reports/monthly/", views.admin_user_monthly_report, name="admin-user-monthly-report"),
    path("", include(router.urls)),
]

