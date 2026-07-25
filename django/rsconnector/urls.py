"""
URL configuration for rsconnector project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.generic.base import RedirectView

from hub import admin_api

urlpatterns = [
    path('console/', admin.site.urls),
    path('health', lambda request: JsonResponse({'status': 'ok', 'service': 'rs-connector-django'})),

    # ── Admin API (frontend React appelle /admin/*) ──
    path('admin/login', admin_api.admin_login),
    path('admin/google', admin_api.google_login),
    path('admin/login/otp', admin_api.admin_otp),
    path('admin/logout', admin_api.admin_logout),
    path('admin/me', admin_api.admin_me),
    path('admin/channels', admin_api.admin_channels),
    path('admin/info', admin_api.admin_info),

    # Applications
    path('admin/applications', admin_api.admin_applications),
    path('admin/applications/create', admin_api.admin_applications_create),
    path('admin/applications/<str:app_id>/regenerate-key', admin_api.admin_applications_regenerate_key),
    path('admin/applications/<str:app_id>/rotate-webhook-secret', admin_api.admin_applications_rotate_webhook),
    path('admin/applications/<str:app_id>', admin_api.admin_applications_delete),

    # Connections
    path('admin/connections', admin_api.admin_connections),
    path('admin/connections/create', admin_api.admin_connections_create),
    path('admin/connections/<str:conn_id>/qr', admin_api.admin_connections_qr),
    path('admin/connections/<str:conn_id>/send', admin_api.admin_connections_send),
    path('admin/connections/<str:conn_id>/default', admin_api.admin_connections_set_default),
    path('admin/connections/<str:conn_id>/application', admin_api.admin_connections_set_application),
    path('admin/connections/<str:conn_id>', admin_api.admin_connections_delete),

    # TOTP / Password
    path('admin/totp/setup', admin_api.admin_totp_setup),
    path('admin/totp/enable', admin_api.admin_totp_enable),
    path('admin/change-password', admin_api.admin_change_password),

    # Self-service client API (routes /v1/)
    path('', include('hub.urls')),

    # Racine -> SPA (nginx gère le fallback, mais au cas où)
    path('', RedirectView.as_view(url='/', permanent=False)),
]
