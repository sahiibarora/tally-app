import logging

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from finance.defaults import DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES
from finance.models import Account, Category, Goal, Preference

from .mailing import send_email_in_background
from .throttles import LoginEmailThrottle
from .serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
)


logger = logging.getLogger(__name__)


class SignupView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth"

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
    throttle_scope = "auth"

    def get_throttles(self):
        return super().get_throttles() + [LoginEmailThrottle()]

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


class PasswordResetRequestView(APIView):
    """Starts a password reset. Always returns the same response whether or
    not the email exists, so this endpoint can't be used to check who has
    an account (a common, easy-to-miss info leak)."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{request.scheme}://{request.get_host()}/?reset_uid={uid}&reset_token={token}"
            send_email_in_background(
                "Reset your Tally password",
                (
                    f"Hi {user.first_name or ''},\n\n"
                    f"Click the link below to set a new password for Tally. "
                    f"This link works once and expires soon.\n\n{reset_url}\n\n"
                    f"If you didn't request this, you can safely ignore this email."
                ),
                user.email,
            )
        # "delivery" describes the server's email setup, not the account, so it
        # leaks nothing about who has one. It lets the app say so plainly when
        # email is not configured instead of promising an email that can't arrive.
        return Response(
            {
                "detail": "If that email has an account, a reset link has been sent.",
                "delivery": "email" if settings.EMAIL_CONFIGURED else "unavailable",
            }
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uid = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]

        try:
            user_id = urlsafe_base64_decode(uid).decode()
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({"detail": "This reset link is invalid."}, status=400)

        if not default_token_generator.check_token(user, token):
            return Response({"detail": "This reset link is invalid or has expired."}, status=400)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        # Invalidate any existing session so a stolen old token stops working.
        Token.objects.filter(user=user).delete()
        new_token = Token.objects.create(user=user)
        return Response({"token": new_token.key, "name": user.first_name, "email": user.email})
