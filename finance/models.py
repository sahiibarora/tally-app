import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Account(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="accounts")
    name = models.CharField(max_length=60)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} ({self.user_id})"


class Category(models.Model):
    EXPENSE = "expense"
    INCOME = "income"
    TYPE_CHOICES = [(EXPENSE, "Expense"), (INCOME, "Income")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    name = models.CharField(max_length=60)

    class Meta:
        unique_together = ("user", "type", "name")
        ordering = ["name"]


class Entry(models.Model):
    INCOME = "income"
    EXPENSE = "expense"
    TYPE_CHOICES = [(INCOME, "Income"), (EXPENSE, "Expense")]
    REPEAT_CHOICES = [("weekly", "Weekly"), ("monthly", "Monthly"), ("yearly", "Yearly")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="entries")
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="entries")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    date = models.DateField(db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    category = models.CharField(max_length=60)
    note = models.CharField(max_length=255, blank=True, default="")
    recurring = models.CharField(max_length=10, choices=REPEAT_CHOICES, null=True, blank=True)
    recurring_group = models.CharField(max_length=40, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]


class Budget(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets")
    category = models.CharField(max_length=60)
    monthly_limit = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])

    class Meta:
        unique_together = ("user", "category")


class Goal(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="goal")
    name = models.CharField(max_length=80, default="Emergency Fund")
    target = models.DecimalField(max_digits=12, decimal_places=2, default=50000)


class Preference(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preference")
    theme = models.CharField(max_length=10, default="light")
    dismissed_alerts = models.JSONField(default=list, blank=True)


class PushSubscription(models.Model):
    """One row per device/browser the user has enabled notifications on
    (the Web Push "endpoint" the browser hands back after subscribing)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
