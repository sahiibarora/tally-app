from pathlib import Path

from django.conf import settings
from django.http import HttpResponse


def service_worker(request):
    """Serves sw.js from the true site root (not /static/sw.js), with a
    header that lets it control the whole app instead of just one folder.
    A service worker's default "scope" is the directory it's served from —
    serving it from /static/ would mean it could only intercept requests
    under /static/, which is useless for catching push events for the app
    as a whole. Service-Worker-Allowed widens that to "/"."""
    sw_path = Path(settings.BASE_DIR) / "frontend_dist" / "sw.js"
    content = sw_path.read_text()
    response = HttpResponse(content, content_type="application/javascript")
    response["Service-Worker-Allowed"] = "/"
    response["Cache-Control"] = "no-cache"
    return response
