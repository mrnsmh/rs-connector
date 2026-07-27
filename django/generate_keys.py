import sys
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'rsconnector.settings')
django.setup()

from hub.models import Organisation, Profile, ApiKey
from hub.api_keys import generate_api_key

org = Organisation.objects.first()

apps = ["DeskManager", "DeskRelance", "DeskImmo"]

for app_name in apps:
    profile, created = Profile.objects.get_or_create(organisation=org, name=app_name)
    if created:
        print(f"Created Profile: {app_name}")
    
    # Check if a key already exists
    if not ApiKey.objects.filter(profile=profile).exists():
        # Generate API key
        key_data = generate_api_key()
        api_key = key_data["api_key"]
        
        # Save the key hash in the DB
        ApiKey.objects.create(
            profile=profile,
            label="Auto-generated API Key",
            prefix=key_data["prefix"],
            key_hash=key_data["hash"]
        )
        
        print(f"--- API Key for {app_name} ---")
        print(f"API_KEY: {api_key}")
        print(f"-------------------------------")
    else:
        print(f"API Key already exists for {app_name} (Cannot reveal plain text). Generating a new one.")
        key_data = generate_api_key()
        api_key = key_data["api_key"]
        
        # Save the key hash in the DB
        ApiKey.objects.create(
            profile=profile,
            label="Auto-generated API Key (New)",
            prefix=key_data["prefix"],
            key_hash=key_data["hash"]
        )
        print(f"--- NEW API Key for {app_name} ---")
        print(f"API_KEY: {api_key}")
        print(f"-------------------------------")

print("Done.")
