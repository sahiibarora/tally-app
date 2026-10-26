import json
import logging
import urllib.request
from urllib.parse import urlparse

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)


class AppsScriptEmailBackend(BaseEmailBackend):
    """Sends mail through a tiny Google Apps Script web app that the app owner
    deploys from their own Google account (see docs/mail-relay.gs).

    Why: Render's free plan blocks the usual mail ports (25, 465, 587), so
    normal SMTP cannot work there. This sends over ordinary HTTPS instead, and
    the message really is sent by the owner's Gmail, so it is properly
    authenticated and far less likely to land in spam."""

    def _check_url(self, url):
        parsed = urlparse(url)
        local = parsed.hostname in ("127.0.0.1", "localhost")
        if parsed.scheme != "https" and not local:
            raise ValueError("EMAIL_RELAY_URL must start with https://")

    def send_messages(self, email_messages):
        url = settings.EMAIL_RELAY_URL
        self._check_url(url)
        sent = 0
        for message in email_messages:
            for recipient in message.to:
                payload = json.dumps(
                    {
                        "secret": settings.EMAIL_RELAY_SECRET,
                        "to": recipient,
                        "subject": message.subject,
                        "body": message.body,
                    }
                ).encode()
                request = urllib.request.Request(
                    url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
                )
                try:
                    # Apps Script answers a POST with a redirect to the result;
                    # urllib follows it automatically.
                    with urllib.request.urlopen(request, timeout=15) as response:
                        reply = response.read().decode(errors="ignore").strip()
                except Exception:
                    if not self.fail_silently:
                        raise
                    continue
                if reply != "ok":
                    if not self.fail_silently:
                        raise RuntimeError(f"Mail relay did not accept the message (it said: {reply[:60]!r})")
                    continue
                sent += 1
        return sent
