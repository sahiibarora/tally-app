from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AccountViewSet, BudgetViewSet, CategoryViewSet, EntryViewSet, GoalView, ImportView, PreferenceView

router = DefaultRouter()
router.register("accounts", AccountViewSet, basename="account")
router.register("categories", CategoryViewSet, basename="category")
router.register("entries", EntryViewSet, basename="entry")
router.register("budgets", BudgetViewSet, basename="budget")

urlpatterns = [
    path("goal/", GoalView.as_view(), name="goal"),
    path("preferences/", PreferenceView.as_view(), name="preferences"),
    path("import/", ImportView.as_view(), name="import"),
    path("", include(router.urls)),
]
