import requests

API = "http://127.0.0.1:8000/api/auth"
ADMIN_EMAIL = "admin@spylt.com"

# Get first menu item
r = requests.get(f"{API}/admin/menu/?admin_email={ADMIN_EMAIL}")
data = r.json()
item_id = data[0]["id"]
print(f"Updating item {item_id} ({data[0]['name']})")

# Upload image
with open("test_drink.jpg", "rb") as f:
    resp = requests.put(
        f"{API}/admin/menu/{item_id}/",
        data={"admin_email": ADMIN_EMAIL, "name": data[0]["name"]},
        files={"image": ("drink.jpg", f, "image/jpeg")},
    )

print(f"Status: {resp.status_code}")
result = resp.json()
print(f"image_url: {result.get('image_url')}")
print(f"image field: {result.get('image')}")
