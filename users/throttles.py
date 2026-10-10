from rest_framework.throttling import SimpleRateThrottle


class LoginEmailThrottle(SimpleRateThrottle):
    """Limits login attempts per *email address*, not per IP. The per-IP limit
    can be dodged by changing network or spoofing headers; this one protects
    each individual account from being password-guessed no matter where the
    attempts come from."""

    scope = "login_email"

    def get_cache_key(self, request, view):
        email = str(request.data.get("email", "")).strip().lower()
        if not email:
            return None  # nothing to key on; the per-IP limit still applies
        return self.cache_format % {"scope": self.scope, "ident": email}
