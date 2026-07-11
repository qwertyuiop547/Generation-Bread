"""DRF permission classes for coffee-shop staff/admin APIs."""
from rest_framework.permissions import BasePermission


class IsStaffOrAdmin(BasePermission):
    """JWT-authenticated user with role staff or admin."""

    message = "Staff or admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) in ("admin", "staff")
        )


class IsAdminRole(BasePermission):
    """JWT-authenticated user with role admin only."""

    message = "Admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and getattr(user, "role", None) == "admin"
        )
