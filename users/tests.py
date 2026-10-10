import quopri
import re

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase


class AuthTests(APITestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache

    def signup(self, email="a@example.com", password="GoodPass123", name="Sahib"):
        return self.client.post("/api/auth/signup/", {"name": name, "email": email, "password": password}, format="json")

    def test_signup_seeds_defaults(self):
        r = self.signup()
        self.assertEqual(r.status_code, 201)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        self.assertEqual(len(self.client.get("/api/categories/").data), 14)
        self.assertEqual(self.client.get("/api/accounts/").data[0]["name"], "Cash")

    def test_weak_and_common_passwords_rejected(self):
        self.assertEqual(self.signup(password="short1").status_code, 400)
        self.assertEqual(self.signup(email="b@example.com", password="password123").status_code, 400)
        self.assertEqual(self.signup(email="c@example.com", password="12345678").status_code, 400)

    def test_duplicate_email_rejected(self):
        self.signup()
        self.assertEqual(self.signup().status_code, 400)

    def test_wrong_password_rejected_and_unauthenticated_blocked(self):
        self.signup()
        r = self.client.post("/api/auth/login/", {"email": "a@example.com", "password": "nope"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get("/api/entries/").status_code, 401)

    def test_login_rate_limited_per_ip(self):
        codes = [
            self.client.post("/api/auth/login/", {"email": f"x{i}@example.com", "password": "bad"}, format="json").status_code
            for i in range(7)
        ]
        self.assertEqual(codes[:5], [400] * 5)
        self.assertEqual(codes[-1], 429)

    def test_login_rate_limited_per_email_even_across_ips(self):
        # Different "IPs" each time: the per-IP limit never trips, but the
        # per-email limit must still stop password guessing on one account.
        statuses = []
        for i in range(12):
            r = self.client.post(
                "/api/auth/login/",
                {"email": "victim@example.com", "password": f"guess{i}"},
                format="json",
                REMOTE_ADDR=f"10.0.0.{i}",
            )
            statuses.append(r.status_code)
        self.assertIn(429, statuses)
        self.assertEqual(statuses[:10], [400] * 10)

    def test_password_reset_round_trip(self):
        self.signup()
        r = self.client.post("/api/auth/password-reset/request/", {"email": "a@example.com"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        body = quopri.decodestring(mail.outbox[0].message().as_bytes()).decode()
        uid, token = re.search(r"reset_uid=([^&\s]+)&reset_token=([^\s]+)", body).groups()

        r = self.client.post(
            "/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "BrandNewPass456"}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        ok = self.client.post("/api/auth/login/", {"email": "a@example.com", "password": "BrandNewPass456"}, format="json")
        self.assertEqual(ok.status_code, 200)
        old = self.client.post("/api/auth/login/", {"email": "a@example.com", "password": "GoodPass123"}, format="json")
        self.assertEqual(old.status_code, 400)

        # The link is single-use: the password changed, so the token is dead.
        again = self.client.post(
            "/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "AnotherPass789"}, format="json"
        )
        self.assertEqual(again.status_code, 400)

    def test_password_reset_does_not_reveal_whether_email_exists(self):
        known = self.client.post("/api/auth/password-reset/request/", {"email": "ghost@example.com"}, format="json")
        self.signup()
        cache.clear()
        real = self.client.post("/api/auth/password-reset/request/", {"email": "a@example.com"}, format="json")
        self.assertEqual(known.status_code, real.status_code)
        self.assertEqual(known.data, real.data)

    def test_reset_invalidates_old_session_token(self):
        r = self.signup()
        old_token = r.data["token"]
        user = User.objects.get(email="a@example.com")
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        tok = default_token_generator.make_token(user)
        self.client.post("/api/auth/password-reset/confirm/", {"uid": uid, "token": tok, "new_password": "BrandNewPass456"}, format="json")
        self.assertFalse(Token.objects.filter(key=old_token).exists())
