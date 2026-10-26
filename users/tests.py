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


class ResetDeliveryFlagTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_reports_when_email_is_not_set_up(self):
        r = self.client.post("/api/auth/password-reset/request/", {"email": "a@example.com"}, format="json")
        self.assertEqual(r.data["delivery"], "unavailable")

    def test_reports_email_when_configured_and_is_identical_for_unknown_accounts(self):
        from django.test import override_settings

        with override_settings(EMAIL_CONFIGURED=True):
            unknown = self.client.post("/api/auth/password-reset/request/", {"email": "ghost@example.com"}, format="json")
            cache.clear()
            User.objects.create_user("real@example.com", "real@example.com", "GoodPass123")
            known = self.client.post("/api/auth/password-reset/request/", {"email": "real@example.com"}, format="json")
        self.assertEqual(unknown.data, known.data)
        self.assertEqual(known.data["delivery"], "email")


import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from django.core.mail import send_mail
from django.test import SimpleTestCase, override_settings


class FakeAppsScript:
    """Behaves like a deployed Google Apps Script web app: it answers a POST
    with a 302 redirect, and the redirect target returns the result text."""

    def __init__(self, result="ok"):
        self.requests = []
        self.result = result
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers["Content-Length"])
                outer.requests.append(json.loads(self.rfile.read(length)))
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{outer.port}/result")
                self.end_headers()

            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(outer.result.encode())

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_port
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}/exec"

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def relay_settings(url):
    return override_settings(
        EMAIL_BACKEND="users.mail_backend.AppsScriptEmailBackend",
        EMAIL_RELAY_URL=url,
        EMAIL_RELAY_SECRET="s3cret",
        EMAIL_CONFIGURED=True,
    )


class AppsScriptBackendTests(SimpleTestCase):
    def setUp(self):
        self.relay = FakeAppsScript()
        self.addCleanup(self.relay.close)

    def test_message_reaches_the_relay_with_secret_recipient_subject_and_body(self):
        with relay_settings(self.relay.url):
            sent = send_mail("Hello", "Body text", None, ["me@example.com"])
        self.assertEqual(sent, 1)
        self.assertEqual(
            self.relay.requests, [{"secret": "s3cret", "to": "me@example.com", "subject": "Hello", "body": "Body text"}]
        )

    def test_a_refusal_from_the_relay_is_an_error_not_a_silent_success(self):
        self.relay.result = "forbidden"
        with relay_settings(self.relay.url):
            with self.assertRaises(RuntimeError):
                send_mail("Hello", "Body", None, ["me@example.com"])
            self.assertEqual(send_mail("Hello", "Body", None, ["me@example.com"], fail_silently=True), 0)

    def test_an_unreachable_relay_fails_fast_instead_of_hanging(self):
        dead = FakeAppsScript()
        url = dead.url
        dead.close()
        with relay_settings(url):
            with self.assertRaises(Exception):
                send_mail("Hello", "Body", None, ["me@example.com"])

    def test_a_plain_http_relay_address_is_refused(self):
        with relay_settings("http://example.com/exec"):
            with self.assertRaises(ValueError):
                send_mail("Hello", "Body", None, ["me@example.com"])


class ResetEmailThroughRelayTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.relay = FakeAppsScript()
        self.addCleanup(self.relay.close)
        User.objects.create_user("real@example.com", "real@example.com", "GoodPass123", first_name="Sam")

    def post(self, email):
        return self.client.post("/api/auth/password-reset/request/", {"email": email}, format="json")

    def test_real_account_gets_a_reset_link_and_unknown_one_gets_nothing_but_the_same_answer(self):
        with relay_settings(self.relay.url):
            known = self.post("real@example.com")
            cache.clear()
            unknown = self.post("ghost@example.com")
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(self.relay.requests), 1)
        sent = self.relay.requests[0]
        self.assertEqual(sent["to"], "real@example.com")
        self.assertIn("reset_uid=", sent["body"])
        self.assertIn("reset_token=", sent["body"])

    def test_the_endpoint_still_answers_normally_when_the_relay_refuses(self):
        self.relay.result = "forbidden"
        with relay_settings(self.relay.url):
            r = self.post("real@example.com")
        self.assertEqual(r.status_code, 200)
