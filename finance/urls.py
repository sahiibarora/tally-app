from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AccountViewSet,
    BudgetViewSet,
    CategoryViewSet,
    EntryViewSet,
    GoalView,
    HealthView,
    ImportView,
    PreferenceView,
    PushSubscriptionViewSet,
    VapidPublicKeyView,
)

router = DefaultRouter()
router.register("accounts", AccountViewSet, basename="account")
router.register("categories", CategoryViewSet, basename="category")
router.register("entries", EntryViewSet, basename="entry")
router.register("budgets", BudgetViewSet, basename="budget")
router.register("push-subscriptions", PushSubscriptionViewSet, basename="push-subscription")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("goal/", GoalView.as_view(), name="goal"),
    path("preferences/", PreferenceView.as_view(), name="preferences"),
    path("import/", ImportView.as_view(), name="import"),
    path("vapid-public-key/", VapidPublicKeyView.as_view(), name="vapid-public-key"),
    path("", include(router.urls)),
]
