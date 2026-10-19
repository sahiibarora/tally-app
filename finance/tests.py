from datetime import date
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Account, Budget, Category, Entry, PushSubscription


def make_user(email="u@example.com"):
    user = User.objects.create_user(username=email, email=email, password="GoodPass123", first_name="U")
    Account.objects.create(user=user, name="Cash")
    for t, names in (("expense", ["Food", "Other"]), ("income", ["Salary", "Other"])):
        for n in names:
            Category.objects.create(user=user, type=t, name=n)
    return user


class FinanceTestCase(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.account = self.user.accounts.first()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")

    def add_entry(self, amount="100", category="Food", type_="expense", day=None, repeat="none"):
        return self.client.post(
            "/api/entries/",
            {
                "account": self.account.id,
                "type": type_,
                "date": (day or date.today()).isoformat(),
                "amount": amount,
                "category": category,
                "note": "",
                "repeat": repeat,
            },
            format="json",
        )


class ValidationTests(FinanceTestCase):
    def test_duplicate_account_name_is_a_clean_400_not_a_500(self):
        r = self.client.post("/api/accounts/", {"name": "Cash"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_duplicate_category_name_is_a_clean_400_not_a_500(self):
        r = self.client.post("/api/categories/", {"type": "expense", "name": "Food"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_new_category_is_created(self):
        self.assertEqual(self.client.post("/api/categories/", {"type": "expense", "name": "Pets"}, format="json").status_code, 201)

    def test_zero_and_negative_amounts_rejected(self):
        self.assertEqual(self.add_entry(amount="0").status_code, 400)
        self.assertEqual(self.add_entry(amount="-50").status_code, 400)

    def test_account_with_entries_cannot_be_deleted(self):
        extra = Account.objects.create(user=self.user, name="Bank")
        Entry.objects.create(user=self.user, account=extra, type="expense", date=date.today(), amount=5, category="Food")
        self.assertEqual(self.client.delete(f"/api/accounts/{extra.id}/").status_code, 400)

    def test_last_category_of_a_type_cannot_be_deleted(self):
        Category.objects.filter(user=self.user, type="income").exclude(name="Salary").delete()
        salary = Category.objects.get(user=self.user, type="income", name="Salary")
        self.assertEqual(self.client.delete(f"/api/categories/{salary.id}/").status_code, 400)


class EntryTests(FinanceTestCase):
    def test_recurring_counts(self):
        self.assertEqual(len(self.add_entry(repeat="weekly").data), 26)
        self.assertEqual(len(self.add_entry(repeat="monthly").data), 12)
        self.assertEqual(len(self.add_entry(repeat="yearly").data), 4)

    def test_monthly_recurring_from_31st_clamps_to_month_end(self):
        r = self.add_entry(repeat="monthly", day=date(2027, 1, 31))
        dates = [e["date"] for e in r.data[:4]]
        self.assertEqual(dates, ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"])

    def test_bulk_recategorize_and_delete(self):
        ids = [self.add_entry().data["id"] for _ in range(3)]
        self.assertEqual(self.client.post("/api/entries/bulk_recategorize/", {"ids": ids, "category": "Other"}, format="json").status_code, 204)
        self.assertEqual(Entry.objects.filter(category="Other").count(), 3)
        self.assertEqual(self.client.post("/api/entries/bulk_delete/", {"ids": ids}, format="json").status_code, 204)
        self.assertEqual(Entry.objects.count(), 0)

    def test_users_cannot_see_each_others_data(self):
        self.add_entry()
        other = make_user("other@example.com")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=other).key}")
        self.assertEqual(len(self.client.get("/api/entries/").data), 0)
        mine = Entry.objects.filter(user=self.user).first()
        self.assertEqual(self.client.get(f"/api/entries/{mine.id}/").status_code, 404)

    def test_budget_upsert_does_not_duplicate(self):
        self.client.post("/api/budgets/", {"category": "Food", "monthly_limit": "5000"}, format="json")
        self.client.post("/api/budgets/", {"category": "Food", "monthly_limit": "6000"}, format="json")
        self.assertEqual(Budget.objects.filter(user=self.user).count(), 1)
        self.assertEqual(Budget.objects.get(user=self.user).monthly_limit, Decimal("6000"))

    def test_import_replaces_entries(self):
        self.add_entry()
        payload = {"entries": [{"type": "income", "date": "2026-01-01", "amount": 9, "category": "Salary", "accountId": self.account.id}]}
        self.assertEqual(self.client.post("/api/import/", payload, format="json").status_code, 200)
        self.assertEqual(Entry.objects.filter(user=self.user).count(), 1)


@mock.patch("finance.push.send_push_to_user")
class BudgetNotificationTests(FinanceTestCase):
    def setUp(self):
        super().setUp()
        Budget.objects.create(user=self.user, category="Food", monthly_limit=1000)

    def test_only_threshold_crossings_notify(self, send):
        self.add_entry("500")  # 50%  -> quiet
        self.assertEqual(send.call_count, 0)
        self.add_entry("400")  # 90%  -> crosses 80%
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.kwargs["title"], "Budget warning")
        self.add_entry("50")  # 95%  -> already past 80%, stay quiet
        self.assertEqual(send.call_count, 1)
        self.add_entry("100")  # 105% -> crosses 100%
        self.assertEqual(send.call_count, 2)
        self.assertEqual(send.call_args.kwargs["title"], "Budget exceeded")
        self.add_entry("100")  # still over -> stay quiet
        self.assertEqual(send.call_count, 2)

    def test_single_jump_past_limit_sends_one_exceeded_alert(self, send):
        self.add_entry("1200")
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.kwargs["title"], "Budget exceeded")

    def test_income_and_other_categories_never_notify(self, send):
        self.add_entry("5000", type_="income", category="Salary")
        self.add_entry("5000", category="Other")
        self.assertEqual(send.call_count, 0)

    def test_future_dated_entries_do_not_affect_this_months_budget(self, send):
        far_future = date(date.today().year + 1, 1, 15)
        self.add_entry("5000", day=far_future)
        self.assertEqual(send.call_count, 0)

    def test_weekly_recurring_counts_every_in_month_occurrence(self, send):
        # 26 weekly entries of 300: the ones landing in this month together
        # blow through the 1000 budget, which must produce an alert.
        self.add_entry("300", repeat="weekly", day=date.today().replace(day=1))
        self.assertGreaterEqual(send.call_count, 1)


class PushSubscriptionTests(FinanceTestCase):
    def test_subscribe_upserts_and_unsubscribe_deletes(self):
        body = {"endpoint": "https://push.example/abc", "p256dh": "k1", "auth": "a1"}
        self.assertEqual(self.client.post("/api/push-subscriptions/", body, format="json").status_code, 201)
        body["p256dh"] = "k2"
        self.client.post("/api/push-subscriptions/", body, format="json")
        self.assertEqual(PushSubscription.objects.count(), 1)
        self.assertEqual(PushSubscription.objects.get().p256dh, "k2")
        self.client.post("/api/push-subscriptions/unsubscribe/", {"endpoint": body["endpoint"]}, format="json")
        self.assertEqual(PushSubscription.objects.count(), 0)

    def test_a_failing_push_never_breaks_saving_an_entry(self):
        PushSubscription.objects.create(user=self.user, endpoint="https://push.example/x", p256dh="bad", auth="bad")
        Budget.objects.create(user=self.user, category="Food", monthly_limit=100)
        with self.settings(VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv"):
            self.assertEqual(self.add_entry("500").status_code, 201)


class HealthTests(FinanceTestCase):
    def test_health_is_public_and_other_endpoints_are_not(self):
        self.client.credentials()
        r = self.client.get("/api/health/")
        self.assertEqual((r.status_code, r.data), (200, {"status": "ok"}))
        self.assertEqual(self.client.get("/api/entries/").status_code, 401)


class RecurringValidationTests(FinanceTestCase):
    def test_recurring_entries_get_the_same_validation_as_one_offs(self):
        self.assertEqual(self.add_entry(amount="-50", repeat="monthly").status_code, 400)
        self.assertEqual(self.add_entry(amount="0", repeat="weekly").status_code, 400)
        self.assertEqual(Entry.objects.count(), 0)

    def test_bad_repeat_value_rejected(self):
        self.assertEqual(self.add_entry(repeat="daily").status_code, 400)

    def test_garbage_date_is_a_400_not_a_crash(self):
        r = self.client.post(
            "/api/entries/",
            {"account": self.account.id, "type": "expense", "date": "not-a-date", "amount": "5", "category": "Food", "repeat": "monthly"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)


class TestNotificationEndpointTests(FinanceTestCase):
    def test_without_server_keys_it_says_not_configured(self):
        r = self.client.post("/api/push-subscriptions/test/", {}, format="json")
        self.assertEqual((r.status_code, r.data), (200, {"configured": False, "devices": 0}))

    @mock.patch("finance.views.send_push_to_user")
    def test_sends_only_when_configured_and_subscribed(self, send):
        with self.settings(VAPID_PUBLIC_KEY="pub", VAPID_PRIVATE_KEY="priv"):
            self.client.post("/api/push-subscriptions/test/", {}, format="json")
            self.assertEqual(send.call_count, 0)  # no device yet
            PushSubscription.objects.create(user=self.user, endpoint="https://push.example/1", p256dh="k", auth="a")
            r = self.client.post("/api/push-subscriptions/test/", {}, format="json")
        self.assertEqual(r.data, {"configured": True, "devices": 1})
        self.assertEqual(send.call_count, 1)

    def test_requires_login_and_is_rate_limited(self):
        codes = [self.client.post("/api/push-subscriptions/test/", {}, format="json").status_code for _ in range(7)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[-1], 429)
        self.client.credentials()
        self.assertEqual(self.client.post("/api/push-subscriptions/test/", {}, format="json").status_code, 401)
