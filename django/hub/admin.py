"""Enregistrement admin Django : tout est gerable depuis /admin/ (exigence utilisateur).
Organisation -> Profils (inline) ; Profil -> Cles API + Connexions (inline)."""
from django.contrib import admin

from .models import ApiKey, Connection, Organisation, Profile


class ProfileInline(admin.TabularInline):
    model = Profile
    extra = 0
    show_change_link = True
    fields = ("name", "is_active", "webhook_url")


class ApiKeyInline(admin.TabularInline):
    model = ApiKey
    extra = 0
    fields = ("prefix", "label", "last_used_at", "revoked_at", "created_at")
    readonly_fields = ("prefix", "last_used_at", "created_at")


class ConnectionInline(admin.TabularInline):
    model = Connection
    extra = 0
    show_change_link = True
    fields = ("connection_id", "channel_type", "status", "webhook_url")
    readonly_fields = ("status",)


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "is_active", "created_at")
    search_fields = ("name",)
    list_filter = ("is_active",)
    inlines = [ProfileInline]


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "organisation", "is_active", "created_at")
    search_fields = ("name", "organisation__name")
    list_filter = ("is_active", "organisation")
    inlines = [ApiKeyInline, ConnectionInline]


@admin.register(ApiKey)
class ApiKeyAdmin(admin.ModelAdmin):
    list_display = ("prefix", "profile", "label", "active_flag", "last_used_at", "created_at")
    search_fields = ("prefix", "profile__name")
    list_filter = ("profile__organisation",)
    readonly_fields = ("key_hash", "prefix", "last_used_at", "created_at", "updated_at")

    @admin.display(boolean=True, description="active")
    def active_flag(self, obj):
        return obj.is_active


@admin.register(Connection)
class ConnectionAdmin(admin.ModelAdmin):
    list_display = ("connection_id", "channel_type", "profile", "status", "created_at")
    search_fields = ("connection_id", "profile__name")
    list_filter = ("channel_type", "status", "profile__organisation")
    readonly_fields = ("status", "created_at", "updated_at")
