"""
URL configuration for spylt_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.throttling import LoginScopedThrottle
from accounts.views import health_view


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginScopedThrottle]


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [LoginScopedThrottle]


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_view, name='health'),
    path('healthz', health_view, name='healthz'),
    path('api/auth/', include('accounts.urls')),
    path('api/auth/token/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', ThrottledTokenRefreshView.as_view(), name='token_refresh'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
