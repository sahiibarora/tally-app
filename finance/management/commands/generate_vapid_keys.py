"""
One-off helper: generates a VAPID key pair for Web Push notifications and
prints them ready to paste into Render's Environment Variables.

Run locally once with:  python manage.py generate_vapid_keys
Never commit the private key to the repo.
"""
import base64

from cryptography.hazmat.primitives import serialization
from django.core.management.base import BaseCommand
from py_vapid import Vapid02 as Vapid


class Command(BaseCommand):
    help = "Generate a VAPID key pair for web push notifications."

    def handle(self, *args, **options):
        v = Vapid()
        v.generate_keys()

        priv_bytes = v.private_key.private_numbers().private_value.to_bytes(32, "big")
        private_key = base64.urlsafe_b64encode(priv_bytes).rstrip(b"=").decode()

        pub_bytes = v.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
        public_key = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()

        self.stdout.write(self.style.SUCCESS("Add these two to Render's Environment Variables:"))
        self.stdout.write(f"VAPID_PUBLIC_KEY={public_key}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={private_key}")
        self.stdout.write("")
        self.stdout.write("Keep VAPID_PRIVATE_KEY secret — never commit it or share it.")
