from rest_framework import permissions


class IsStaffUser(permissions.BasePermission):
    """
    仅允许后台职员访问。
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and user.is_staff)

































