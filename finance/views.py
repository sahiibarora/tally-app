from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Account, Budget, Category, Entry, Goal, Preference
from .serializers import (
    AccountSerializer,
    BudgetSerializer,
    CategorySerializer,
    EntrySerializer,
    GoalSerializer,
    PreferenceSerializer,
)
from .utils import build_recurring_dates
import uuid


class UserScopedViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class AccountViewSet(UserScopedViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if account.entries.exists():
            return Response(
                {"detail": f"\"{account.name}\" still has entries. Remove or reassign them first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Account.objects.filter(user=request.user).count() <= 1:
            return Response({"detail": "You need at least one account."}, status=400)
        return super().destroy(request, *args, **kwargs)


class CategoryViewSet(UserScopedViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        remaining = Category.objects.filter(user=request.user, type=category.type).count()
        if remaining <= 1:
            return Response({"detail": "Each type needs at least one category."}, status=400)
        return super().destroy(request, *args, **kwargs)


class EntryViewSet(UserScopedViewSet):
    queryset = Entry.objects.all()
    serializer_class = EntrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        account_id = self.request.query_params.get("account")
        if account_id:
            qs = qs.filter(account_id=account_id)
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        repeat = data.pop("repeat", None)
        repeat = repeat[0] if isinstance(repeat, list) else repeat
        account = Account.objects.filter(user=request.user, id=data.get("account")).first()
        if not account:
            return Response({"detail": "Choose a valid account."}, status=400)

        if not repeat or repeat == "none":
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # Recurring: generate the whole bounded series up front, sharing a
        # recurring_group id, mirroring the original client-side behavior.
        from datetime import date as date_cls
        base_date = date_cls.fromisoformat(data["date"])
        group_id = uuid.uuid4().hex[:20]
        dates = build_recurring_dates(base_date, repeat)
        created = []
        with transaction.atomic():
            for d in dates:
                entry = Entry.objects.create(
                    user=request.user,
                    account=account,
                    type=data["type"],
                    date=d,
                    amount=data["amount"],
                    category=data["category"],
                    note=data.get("note", ""),
                    recurring=repeat,
                    recurring_group=group_id,
                )
                created.append(entry)
        serializer = self.get_serializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        ids = request.data.get("ids", [])
        Entry.objects.filter(user=request.user, id__in=ids).delete()
        return Response(status=204)

    @action(detail=False, methods=["post"])
    def bulk_recategorize(self, request):
        ids = request.data.get("ids", [])
        category = request.data.get("category")
        if not category:
            return Response({"detail": "category is required."}, status=400)
        Entry.objects.filter(user=request.user, id__in=ids).update(category=category)
        return Response(status=204)


class BudgetViewSet(UserScopedViewSet):
    queryset = Budget.objects.all()
    serializer_class = BudgetSerializer

    def create(self, request, *args, **kwargs):
        # Upsert: setting a budget for a category that already has one
        # updates it instead of erroring on the unique constraint.
        category = request.data.get("category")
        limit = request.data.get("monthly_limit")
        obj, _ = Budget.objects.update_or_create(
            user=request.user, category=category, defaults={"monthly_limit": limit}
        )
        return Response(self.get_serializer(obj).data, status=200)


class GoalView(APIView):
    def get(self, request):
        goal, _ = Goal.objects.get_or_create(user=request.user)
        return Response(GoalSerializer(goal).data)

    def put(self, request):
        goal, _ = Goal.objects.get_or_create(user=request.user)
        serializer = GoalSerializer(goal, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PreferenceView(APIView):
    def get(self, request):
        pref, _ = Preference.objects.get_or_create(user=request.user)
        return Response(PreferenceSerializer(pref).data)

    def put(self, request):
        pref, _ = Preference.objects.get_or_create(user=request.user)
        serializer = PreferenceSerializer(pref, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ImportView(APIView):
    """Replaces the user's entries (and optionally goal/budgets/categories)
    from an uploaded backup. The frontend still shows its own confirmation
    dialog before ever calling this — this endpoint just performs the swap."""

    @transaction.atomic
    def post(self, request):
        data = request.data
        entries = data.get("entries", [])
        default_account = Account.objects.filter(user=request.user).first()

        Entry.objects.filter(user=request.user).delete()
        for e in entries:
            account = Account.objects.filter(user=request.user, id=e.get("accountId")).first() or default_account
            Entry.objects.create(
                user=request.user,
                account=account,
                type=e["type"],
                date=e["date"],
                amount=e["amount"],
                category=e["category"],
                note=e.get("note", ""),
                recurring=e.get("recurring"),
                recurring_group=e.get("recurringId"),
            )

        if data.get("goal"):
            Goal.objects.update_or_create(user=request.user, defaults=data["goal"])
        if data.get("budgets"):
            Budget.objects.filter(user=request.user).delete()
            for cat, limit in data["budgets"].items():
                Budget.objects.create(user=request.user, category=cat, monthly_limit=limit)

        return Response({"imported": len(entries)})
