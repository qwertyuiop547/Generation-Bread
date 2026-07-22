"""Reject null bytes and other control characters in request path/query early."""
from django.http import JsonResponse


class RejectNullByteMiddleware:
    """
    Null bytes (%00) are a common injection / path-smuggling probe.
    Fail closed before views / ORM see the request.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        query = request.META.get("QUERY_STRING") or ""
        if "\x00" in path or "\x00" in query:
            return JsonResponse({"error": "Malformed request."}, status=400)
        # Also catch URL-decoded probes that Django left as %00 in QUERY_STRING
        if "%00" in query.lower() or "%00" in path.lower():
            return JsonResponse({"error": "Malformed request."}, status=400)
        return self.get_response(request)
