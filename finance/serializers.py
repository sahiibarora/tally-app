from rest_framework import serializers

from .models import Account, Budget, Category, Entry, Goal, Preference


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "type", "name"]
        read_only_fields = ["id"]


class EntrySerializer(serializers.ModelSerializer):
    # Write-only: "weekly"/"monthly"/"yearly"/"none" triggers server-side
    # generation of a recurring series; not stored on the model itself.
    repeat = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Entry
        fields = ["id", "account", "type", "date", "amount", "category", "note", "recurring", "recurring_group", "repeat", "created_at"]
        read_only_fields = ["id", "recurring", "recurring_group", "created_at"]


class BudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Budget
        fields = ["id", "category", "monthly_limit"]
        read_only_fields = ["id"]


class GoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Goal
        fields = ["name", "target"]


class PreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Preference
        fields = ["theme", "dismissed_alerts"]
