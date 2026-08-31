from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("users.urls")),
    path("api/", include("finance.urls")),
    # Everything else is the React app's single page — this lets a phone
    # browser open the app at "/", and lets a page refresh on any URL still
    # load the app instead of a Django 404.
    re_path(r"^(?!api/|admin/|static/).*$", TemplateView.as_view(template_name="index.html")),
]
