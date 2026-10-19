from django.db import IntegrityError, transaction
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Account, Budget, Category, Entry, Goal, Preference, PushSubscription
from .push import check_and_notify_budget, send_push_to_user
from .serializers import (
    AccountSerializer,
    BudgetSerializer,
    CategorySerializer,
    EntrySerializer,
    GoalSerializer,
    PreferenceSerializer,
    PushSubscriptionSerializer,
)
from .utils import build_recurring_dates
import uuid


def _notify_for_new_entries(user, category, new_entries):
    """Sum only what landed in the current month (future-dated recurring
    entries don't affect this month's budget), then check for a crossing."""
    from datetime import date

    today = date.today()
    added = sum(
        (e.amount for e in new_entries if e.date.year == today.year and e.date.month == today.month),
        start=0,
    )
    try:
        check_and_notify_budget(user, category, added)
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Budget notification check failed")


class UserScopedViewSet(viewsets.ModelViewSet):
    duplicate_message = "That already exists."

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        # The uniqueness rule involves `user`, which isn't a client-supplied
        # field, so DRF can't build its usual "already exists" validator.
        # Without this, a duplicate name surfaces as a raw 500 error.
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response({"detail": self.duplicate_message}, status=status.HTTP_400_BAD_REQUEST)


class AccountViewSet(UserScopedViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    duplicate_message = "An account with that name already exists."

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
    duplicate_message = "A category with that name already exists for this type."

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
        if repeat and repeat != "none" and repeat not in ("weekly", "monthly", "yearly"):
            return Response({"detail": "Repeat must be weekly, monthly, or yearly."}, status=400)

        # Validate through the serializer in BOTH cases, so recurring entries
        # get exactly the same checks (positive amount, valid date, valid
        # type) as one-off entries instead of bypassing them.
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        if not repeat or repeat == "none":
            entry = serializer.save(user=request.user)
            if entry.type == "expense":
                _notify_for_new_entries(request.user, entry.category, [entry])
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        # Recurring: generate the whole bounded series up front, sharing a
        # recurring_group id, mirroring the original client-side behavior.
        vd = serializer.validated_data
        group_id = uuid.uuid4().hex[:20]
        dates = build_recurring_dates(vd["date"], repeat)
        with transaction.atomic():
            created = [
                Entry.objects.create(
                    user=request.user,
                    account=account,
                    type=vd["type"],
                    date=d,
                    amount=vd["amount"],
                    category=vd["category"],
                    note=vd.get("note", ""),
                    recurring=repeat,
                    recurring_group=group_id,
                )
                for d in dates
            ]
        if vd["type"] == "expense":
            _notify_for_new_entries(request.user, vd["category"], created)
        return Response(self.get_serializer(created, many=True).data, status=status.HTTP_201_CREATED)

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


class HealthView(APIView):
    """Public liveness check that also performs a real database query.

    Supabase's free tier pauses a project after about a week without database
    activity. A scheduled job calls this endpoint every couple of days, which
    keeps the project awake (and wakes the sleeping Render server first).
    Returns nothing sensitive: just "ok".
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        Account.objects.exists()  # real query against a real table
        return Response({"status": "ok"})


class VapidPublicKeyView(APIView):
    """The public key is, by design, safe to hand to anyone — the browser
    needs it to create a push subscription. Only the private key (used to
    actually sign outgoing pushes) stays secret, server-side only."""

    def get(self, request):
        from django.conf import settings

        return Response({"publicKey": settings.VAPID_PUBLIC_KEY})


class PushSubscriptionViewSet(UserScopedViewSet):
    queryset = PushSubscription.objects.all()
    serializer_class = PushSubscriptionSerializer
    throttle_scope = None  # declared so individual actions can set their own (see `test`)

    def create(self, request, *args, **kwargs):
        # Upsert by endpoint: re-subscribing the same browser updates its
        # keys instead of erroring on the unique constraint.
        endpoint = request.data.get("endpoint")
        obj, _ = PushSubscription.objects.update_or_create(
            user=request.user,
            endpoint=endpoint,
            defaults={"p256dh": request.data.get("p256dh", ""), "auth": request.data.get("auth", "")},
        )
        return Response(self.get_serializer(obj).data, status=201)

    @action(detail=False, methods=["post"], throttle_scope="push_test")
    def test(self, request):
        """Sends one test notification to the caller's own devices, so they can
        confirm alerts work without having to set up a budget first."""
        from django.conf import settings

        configured = bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)
        devices = PushSubscription.objects.filter(user=request.user).count()
        if configured and devices:
            send_push_to_user(request.user, "Tally", "Test notification. Alerts are working on this device.", tag="tally-test")
        return Response({"configured": configured, "devices": devices})

    @action(detail=False, methods=["post"])
    def unsubscribe(self, request):
        endpoint = request.data.get("endpoint")
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response(status=204)
