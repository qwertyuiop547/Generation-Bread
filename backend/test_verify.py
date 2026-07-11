import requests

r = requests.get("http://127.0.0.1:8000/media/menu_images/drink.jpg")
print(f"Status: {r.status_code}")
print(f"Size: {len(r.content)} bytes")
print(f"Type: {r.headers.get('Content-Type')}")

# Also verify the public menu API returns the image_url
r2 = requests.get("http://127.0.0.1:8000/api/auth/menu/")
data = r2.json()
for item in data:
    if item.get("image_url"):
        print(f"  {item['name']}: {item['image_url']}")
