from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from finance.defaults import DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES
from finance.models import Account, Category, Goal, Preference

from .serializers import LoginSerializer, SignupSerializer


class SignupView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Seed sensible defaults, mirroring the original app's first-run state.
        Account.objects.create(user=user, name="Cash")
        Goal.objects.create(user=user)
        Preference.objects.create(user=user)
        Category.objects.bulk_create(
            [Category(user=user, type="expense", name=c) for c in DEFAULT_EXPENSE_CATEGORIES]
            + [Category(user=user, type="income", name=c) for c in DEFAULT_INCOME_CATEGORIES]
        )

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "name": user.first_name, "email": user.email},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        try:
            user_obj = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({"detail": "Invalid email or password."}, status=400)
        user = authenticate(username=user_obj.username, password=password)
        if not user:
            return Response({"detail": "Invalid email or password."}, status=400)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "name": user.first_name, "email": user.email})


class MeView(APIView):
    def get(self, request):
        return Response({"name": request.user.first_name, "email": request.user.email})

    def patch(self, request):
        name = request.data.get("name", "").strip()
        if name:
            request.user.first_name = name
            request.user.save(update_fields=["first_name"])
        return Response({"name": request.user.first_name, "email": request.user.email})
