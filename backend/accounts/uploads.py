"""Safe image upload validation (MIME + magic bytes + size)."""
from __future__ import annotations

from django.core.exceptions import ValidationError

# Max upload size for menu/avatar images (2 MiB)
MAX_IMAGE_BYTES = 2 * 1024 * 1024

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),  # further check below
    "image/gif": (b"GIF87a", b"GIF89a"),
}


def validate_uploaded_image(uploaded_file) -> None:
    if uploaded_file is None:
        return
    size = getattr(uploaded_file, "size", 0) or 0
    if size <= 0:
        raise ValidationError("Empty file upload.")
    if size > MAX_IMAGE_BYTES:
        raise ValidationError(f"Image too large (max {MAX_IMAGE_BYTES // (1024 * 1024)}MB).")

    content_type = (getattr(uploaded_file, "content_type", None) or "").lower().strip()
    if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValidationError("Unsupported image type. Use JPEG, PNG, WebP, or GIF.")

    header = uploaded_file.read(16)
    uploaded_file.seek(0)
    signatures = ALLOWED_IMAGE_CONTENT_TYPES[content_type]
    if content_type == "image/webp":
        if not (header.startswith(b"RIFF") and header[8:12] == b"WEBP"):
            raise ValidationError("File content does not match a valid WebP image.")
        return
    if not any(header.startswith(sig) for sig in signatures):
        raise ValidationError("File content does not match the declared image type.")

    name = (getattr(uploaded_file, "name", "") or "").lower()
    if ".." in name or "/" in name or "\\" in name:
        raise ValidationError("Invalid file name.")
