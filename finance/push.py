"""Sends real Web Push notifications (the kind that show up on your phone's
lock screen, not just an in-app banner) using VAPID auth.

If VAPID keys aren't configured (e.g. in local dev), this silently does
nothing rather than erroring — notifications are an enhancement, not
something that should ever break adding an entry.
"""
import json
import logging

from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription

logger = logging.getLogger(__name__)


def send_push_to_user(user, title, body, tag=None):
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    payload = json.dumps({"title": title, "body": body, "tag": tag or "tally"})
    dead_subscription_ids = []

    for sub in PushSubscription.objects.filter(user=user):
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_CLAIM_EMAIL},
            )
        except WebPushException as e:
            status_code = getattr(e.response, "status_code", None)
            if status_code in (404, 410):
                # 404/410 = the browser has unsubscribed or the subscription
                # expired. Clean it up so we stop trying it every time.
                dead_subscription_ids.append(sub.id)
            else:
                logger.warning("Push failed for user %s: %s", user.id, e)
        except Exception:
            # e.g. a mis-pasted VAPID key. Log it loudly, but never let a
            # notification problem get in the way of saving an entry.
            logger.exception("Push could not be sent (check VAPID keys)")

    if dead_subscription_ids:
        PushSubscription.objects.filter(id__in=dead_subscription_ids).delete()


def check_and_notify_budget(user, category, added_this_month):
    """Called right after expense entries are saved. `added_this_month` is the
    total just added that falls in the current month. Sends a push only when
    that addition is what carried spending across 80% or 100% of the budget,
    not on every entry in the category (which would be spammy)."""
    from datetime import date

    from .models import Budget, Entry

    if not added_this_month or added_this_month <= 0:
        return  # nothing landed in the current month, so no budget impact

    budget = Budget.objects.filter(user=user, category=category).first()
    if not budget or budget.monthly_limit <= 0:
        return

    today = date.today()
    month_entries = Entry.objects.filter(
        user=user, type="expense", category=category, date__year=today.year, date__month=today.month
    )
    total_now = sum((e.amount for e in month_entries), start=0)
    total_before = total_now - added_this_month
    limit = budget.monthly_limit
    pct_now = total_now / limit
    pct_before = total_before / limit

    if pct_before < 1 <= pct_now:
        send_push_to_user(
            user,
            title="Budget exceeded",
            body=f"{category} is over budget this month: ₹{total_now:,.0f} of ₹{limit:,.0f}.",
            tag=f"budget-{category}",
        )
    elif pct_before < 0.8 <= pct_now:
        send_push_to_user(
            user,
            title="Budget warning",
            body=f"{category} has hit {int(pct_now * 100)}% of its ₹{limit:,.0f} monthly budget.",
            tag=f"budget-{category}",
        )
