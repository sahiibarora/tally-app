import logging
import threading

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _send(subject, message, recipient):
    try:
        send_mail(subject=subject, message=message, from_email=None, recipient_list=[recipient])
    except Exception:
        # Recorded for the owner; never shown to the caller, because the reset
        # endpoint must answer identically whether or not the account exists.
        logger.exception("Password reset email failed to send")


def send_email_in_background(subject, message, recipient):
    """Sends after the response has gone out. If we sent while the request was
    open, real accounts would answer more slowly than unknown ones, and that
    timing difference would reveal who has an account."""
    if settings.EMAIL_SEND_SYNC:  # tests run it inline so they can inspect the outbox
        _send(subject, message, recipient)
    else:
        threading.Thread(target=_send, args=(subject, message, recipient), daemon=True).start()
