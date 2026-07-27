"""Add totp_secret and totp_enabled to UserProfile."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hub", "0002_userprofile"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="totp_secret",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="totp_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
