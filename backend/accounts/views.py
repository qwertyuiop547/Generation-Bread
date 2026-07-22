# pyre-unsafe
import csv
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from django.utils import timezone
from datetime import datetime, timedelta
import secrets
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.core.cache import cache
from django.core.mail import send_mail
from django.conf import settings
from django.http import HttpResponse
from django.contrib.auth import authenticate, login
from django.db import connection, transaction
from django.db.models import Count
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework_simplejwt.tokens import RefreshToken
from .models import CustomUser, Order, OrderItem, Cart, CartItem, MenuItem, ShiftLog, StaffActivity, AbsenceRequest, ShiftAssignment, OrderStatusLog
from . import shift_hours
from . import attendance_calendar
from . import drink_prep
from . import smart_eta
from . import staff_feedback
from .pagination import paginate_queryset, paginated_response
from .throttling import (
    LoginRateThrottle,
    RegisterRateThrottle,
    ResendCodeRateThrottle,
    VerifyEmailRateThrottle,
    OrderCreateRateThrottle,
    PaymentRateThrottle,
)
from .security import is_login_locked, record_login_failure, clear_login_failures
from .sql_safety import normalize_email, normalize_text
from .access_control import authorize_order_access, require_authenticated_user
from .security_audit import log_security_event
from .uploads import validate_uploaded_image
from .permissions import IsStaffOrAdmin, IsAdminRole
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework_simplejwt.exceptions import TokenError
from .serializers import (
    RegisterSerializer,
    VerifyEmailSerializer,
    LoginSerializer,
    UserSerializer,
    OrderSerializer,
    CartSerializer,
    CartUpsertSerializer,
    MenuItemSerializer,
    StaffUserSerializer,
    ShiftLogSerializer,
    StaffActivitySerializer,
    AbsenceRequestSerializer,
    ShiftAssignmentSerializer,
)

logger = logging.getLogger(__name__)


VALID_ORDER_STATUSES = {'pending', 'preparing', 'ready', 'completed', 'cancelled'}
MENU_CACHE_KEY = 'menu:public:v1'


@api_view(['GET'])
@permission_classes([AllowAny])
def health_view(request):
    """Load balancer / uptime health check — keep cheap and unauthenticated."""
    db_ok = True
    try:
        connection.ensure_connection()
    except Exception as exc:
        db_ok = False
        logger.warning('health_db_down error=%s', exc)

    cache_ok = True
    try:
        cache.set('health:ping', '1', 5)
        cache_ok = cache.get('health:ping') == '1'
    except Exception as exc:
        cache_ok = False
        logger.warning('health_cache_down error=%s', exc)

    redis_configured = bool(getattr(settings, 'REDIS_URL', ''))
    # In production Redis backs cache; treat cache failure as degraded when configured.
    healthy = db_ok and (cache_ok or not redis_configured)
    payload = {
        'status': 'ok' if healthy else 'degraded',
        'database': 'up' if db_ok else 'down',
        'cache': 'up' if cache_ok else 'down',
        'redis_configured': redis_configured,
    }
    code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return Response(payload, status=code)


def _bust_menu_cache():
    cache.delete(MENU_CACHE_KEY)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def jwt_login_view(request):
    """Custom JWT login using email instead of username."""
    email = request.data.get('email')
    password = request.data.get('password')
    
    email, email_err = _require_email(email)
    if email_err:
        return email_err
    if not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    locked, retry_after = is_login_locked(request, email)
    if locked:
        log_security_event('login_lockout', request=request, detail=email)
        response = Response(
            {
                'error': 'Too many failed login attempts. Please try again later.',
                'retry_after': retry_after,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
        response['Retry-After'] = str(retry_after)
        return response
    
    # Authenticate using email as username
    user = authenticate(username=email, password=password)
    
    if not user:
        locked_now, retry_after = record_login_failure(request, email)
        log_security_event('login_failed', request=request, detail=email)
        if locked_now:
            log_security_event('login_lockout', request=request, detail=email)
            response = Response(
                {
                    'error': 'Too many failed login attempts. Please try again later.',
                    'retry_after': retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            response['Retry-After'] = str(retry_after)
            return response
        return Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)
    
    if not user.is_active:
        return Response({'error': 'Account is inactive.'}, status=status.HTTP_401_UNAUTHORIZED)

    clear_login_failures(request, email)
    log_security_event('login_success', request=request, user=user)
    
    # Generate JWT tokens
    refresh = RefreshToken.for_user(user)
    
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.first_name,
            'role': user.role,
        }
    })


def _get_or_create_user_by_email(email):
    email = normalize_email(email)
    if not email:
        raise ValueError('Invalid email.')
    try:
        return CustomUser.objects.get(email=email)
    except CustomUser.DoesNotExist:
        return CustomUser.objects.create_user(
            username=email,
            email=email,
            password=secrets.token_urlsafe(20),
            first_name='Guest',
        )


def _get_or_create_google_user(email, name=''):
    """Create or update a user authenticated via Google / NextAuth bridge."""
    email = normalize_email(email)
    if not email:
        raise ValueError('Invalid email.')
    display_name = (name or '').strip()[:150] or 'Google User'
    try:
        user = CustomUser.objects.get(email=email)
        updated_fields = []
        if display_name and user.first_name in ('', 'Guest', 'Google User'):
            user.first_name = display_name
            updated_fields.append('first_name')
        if not user.is_email_verified:
            user.is_email_verified = True
            updated_fields.append('is_email_verified')
        if updated_fields:
            user.save(update_fields=updated_fields)
        return user
    except CustomUser.DoesNotExist:
        return CustomUser.objects.create_user(
            username=email,
            email=email,
            password=secrets.token_urlsafe(32),
            first_name=display_name,
            is_email_verified=True,
        )


def _verify_google_id_token(id_token):
    """Verify a Google ID token via Google's tokeninfo endpoint."""
    if not id_token or not isinstance(id_token, str):
        return None, 'id_token is required.'

    url = 'https://oauth2.googleapis.com/tokeninfo?' + urllib.parse.urlencode(
        {'id_token': id_token}
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError:
        return None, 'Invalid Google token.'
    except Exception:
        return None, 'Unable to verify Google token.'

    client_ids = [
        cid.strip()
        for cid in (getattr(settings, 'GOOGLE_CLIENT_ID', '') or '').split(',')
        if cid.strip()
    ]
    aud = payload.get('aud')
    if client_ids and aud not in client_ids:
        return None, 'Invalid Google token audience.'

    if str(payload.get('email_verified', '')).lower() not in ('true', '1'):
        return None, 'Google email is not verified.'

    email = normalize_email(payload.get('email'))
    if not email:
        return None, 'Google token missing email.'

    return {
        'email': email,
        'name': payload.get('name') or payload.get('given_name') or '',
    }, None


def _valid_auth_bridge(request):
    expected = (getattr(settings, 'AUTH_BRIDGE_SECRET', None) or '').strip()
    if not expected:
        return False
    provided = (
        request.headers.get('X-Auth-Bridge-Secret')
        or request.data.get('bridge_secret')
        or ''
    ).strip()
    if not provided:
        return False
    try:
        return secrets.compare_digest(provided, expected)
    except (TypeError, ValueError):
        return False


def _require_email(value):
    """Return (email, error_response). error_response is None when email is valid."""
    email = normalize_email(value)
    if not email:
        return None, Response({'error': 'Invalid email.'}, status=status.HTTP_400_BAD_REQUEST)
    return email, None


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def google_login_view(request):
    """
    Mint Django JWTs for Google / NextAuth users.

    Accepts either:
    - Google id_token (verified with Google), or
    - email + name with X-Auth-Bridge-Secret (server-only Next.js bridge).
    """
    id_token = request.data.get('id_token')
    if id_token:
        info, err = _verify_google_id_token(id_token)
        if err:
            log_security_event('google_login_invalid_token', request=request, detail=err)
            return Response({'error': err}, status=status.HTTP_401_UNAUTHORIZED)
        email = info['email']
        name = info.get('name') or ''
    else:
        if not _valid_auth_bridge(request):
            log_security_event('google_bridge_rejected', request=request)
            return Response({'error': 'Unauthorized.'}, status=status.HTTP_401_UNAUTHORIZED)
        email, email_err = _require_email(request.data.get('email'))
        if email_err:
            return email_err
        name = request.data.get('name') or ''

    try:
        user = _get_or_create_google_user(email, name)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if not user.is_active:
        return Response({'error': 'Account is inactive.'}, status=status.HTTP_401_UNAUTHORIZED)

    log_security_event('google_login_success', request=request, user=user)
    refresh = RefreshToken.for_user(user)

    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.first_name,
            'role': user.role,
        },
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([RegisterRateThrottle])
def register_view(request):
    """Register a new user and send verification email."""
    serializer = RegisterSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user = serializer.save()
    code = user.generate_verification_code()

    # Send verification email
    try:
        send_mail(
            subject='☕ Spylt - Verify Your Email',
            message=f'Hi {user.first_name}!\n\nYour verification code is: {code}\n\nThis code expires in 10 minutes.\n\nWelcome to Spylt Coffee! ☕',
            html_message=f"""
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #faeade; border-radius: 20px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #523122; font-size: 28px; margin: 0;">☕ SPYLT</h1>
                    <p style="color: #a26833; margin: 5px 0;">AI-Powered Smart Coffee</p>
                </div>
                <div style="background: white; border-radius: 15px; padding: 30px; text-align: center;">
                    <h2 style="color: #523122; margin-top: 0;">Verify Your Email</h2>
                    <p style="color: #666;">Hi <strong>{user.first_name}</strong>, use the code below to verify your account:</p>
                    <div style="background: #523122; color: #faeade; font-size: 32px; letter-spacing: 8px; padding: 15px 30px; border-radius: 12px; display: inline-block; font-weight: bold; margin: 15px 0;">
                        {code}
                    </div>
                    <p style="color: #999; font-size: 13px; margin-top: 20px;">This code expires in 10 minutes.</p>
                </div>
            </div>
            """,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception as e:
        # If email fails, still return success but include warning
        return Response({
            'message': 'Account created. Email sending failed — use the code below for demo.',
            'demo_code': code,
            'email': user.email,
        }, status=status.HTTP_201_CREATED)

    return Response({
        'message': 'Account created! Check your email for the verification code.',
        'email': user.email,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([VerifyEmailRateThrottle])
def verify_email_view(request):
    """Verify email with 6-digit code."""
    serializer = VerifyEmailSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email']
    code = serializer.validated_data['code']

    try:
        user = CustomUser.objects.get(email=email)
    except CustomUser.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    if user.is_email_verified:
        return Response({'error': 'Email already verified.'}, status=status.HTTP_400_BAD_REQUEST)

    # Check code expiry (10 minutes)
    if user.verification_code_created:
        if timezone.now() - user.verification_code_created > timedelta(minutes=10):
            return Response({'error': 'Verification code expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

    if user.verification_code != code:
        return Response({'error': 'Invalid verification code.'}, status=status.HTTP_400_BAD_REQUEST)

    user.is_email_verified = True
    user.verification_code = None
    user.save()

    return Response({
        'message': 'Email verified successfully!',
        'user': UserSerializer(user).data,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ResendCodeRateThrottle])
def resend_code_view(request):
    """Resend verification code."""
    email, email_err = _require_email(request.data.get('email'))
    if email_err:
        return email_err

    try:
        user = CustomUser.objects.get(email=email)
    except CustomUser.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    if user.is_email_verified:
        return Response({'error': 'Email already verified.'}, status=status.HTTP_400_BAD_REQUEST)

    code = user.generate_verification_code()

    try:
        send_mail(
            subject='☕ Spylt - New Verification Code',
            message=f'Your new verification code is: {code}\n\nThis code expires in 10 minutes.',
            html_message=f"""
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #faeade; border-radius: 20px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #523122; font-size: 28px; margin: 0;">☕ SPYLT</h1>
                </div>
                <div style="background: white; border-radius: 15px; padding: 30px; text-align: center;">
                    <h2 style="color: #523122; margin-top: 0;">New Verification Code</h2>
                    <div style="background: #523122; color: #faeade; font-size: 32px; letter-spacing: 8px; padding: 15px 30px; border-radius: 12px; display: inline-block; font-weight: bold; margin: 15px 0;">
                        {code}
                    </div>
                    <p style="color: #999; font-size: 13px; margin-top: 20px;">This code expires in 10 minutes.</p>
                </div>
            </div>
            """,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        return Response({
            'message': 'Email sending failed — use the code below for demo.',
            'demo_code': code,
        }, status=status.HTTP_200_OK)

    return Response({'message': 'New verification code sent to your email!'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login_view(request):
    """Login and return user data."""
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data['email']
    password = serializer.validated_data['password']

    locked, retry_after = is_login_locked(request, email)
    if locked:
        response = Response(
            {
                'error': 'Too many failed login attempts. Please try again later.',
                'retry_after': retry_after,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
        response['Retry-After'] = str(retry_after)
        return response

    user = authenticate(username=email, password=password)
    if not user:
        locked_now, retry_after = record_login_failure(request, email)
        log_security_event('login_failed', request=request, detail=email)
        if locked_now:
            log_security_event('login_lockout', request=request, detail=email)
            response = Response(
                {
                    'error': 'Too many failed login attempts. Please try again later.',
                    'retry_after': retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            response['Retry-After'] = str(retry_after)
            return response
        return Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    clear_login_failures(request, email)
    log_security_event('login_success', request=request, user=user)
    login(request, user)

    return Response({
        'message': 'Login successful!',
        'user': UserSerializer(user).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Get current user profile."""
    return Response(UserSerializer(request.user).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    """Blacklist refresh token so it cannot be reused after logout."""
    refresh = request.data.get('refresh')
    if not refresh:
        return Response({'error': 'refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        token = RefreshToken(refresh)
        token.blacklist()
    except TokenError:
        log_security_event('logout_invalid_token', request=request)
        return Response({'error': 'Invalid or expired refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
    except AttributeError:
        return Response(
            {'error': 'Token blacklist is not configured on the server.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    user = getattr(request, 'user', None)
    log_security_event(
        'logout',
        request=request,
        user=user if getattr(user, 'is_authenticated', False) else None,
    )
    return Response({'message': 'Logged out.'}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@throttle_classes([OrderCreateRateThrottle])
def order_view(request):
    """Get current user orders (auth required) or create a new order."""
    if request.method == 'GET':
        user, err = require_authenticated_user(request)
        if err:
            return err
        qs = (
            Order.objects.filter(user=user)
            .select_related('user', 'served_by')
            .prefetch_related('items')
            .order_by('-created_at')
        )
        page, meta = paginate_queryset(qs, request, default_limit=50, max_limit=200)
        serializer = OrderSerializer(page, many=True)
        return Response(paginated_response(serializer.data, meta))

    # POST create — prefer JWT identity; fall back to validated email for walk-in APIs
    auth_user = getattr(request, 'user', None)
    if auth_user is not None and getattr(auth_user, 'is_authenticated', False):
        user = auth_user
    else:
        email, email_err = _require_email(
            request.query_params.get('email') or request.data.get('email')
        )
        if email_err:
            return email_err
        try:
            user = _get_or_create_user_by_email(email)
        except ValueError:
            return Response({'error': 'Invalid email.'}, status=status.HTTP_400_BAD_REQUEST)

    # Expects: {"total_price": 500, "items": [{"name": "Item A", "quantity": 2, "price": 250}]}
    total_price = request.data.get('total_price')
    items = request.data.get('items', [])
    raw_order_type = str(request.data.get('order_type', 'takeout')).strip().lower()
    table_number = request.data.get('table_number')
    pickup_time = request.data.get('pickup_time')
    customer_name = normalize_text(
        request.data.get('customer_name') or '',
        max_length=120,
        allow_empty=True,
    )
    if customer_name is None:
        return Response({'error': 'Invalid customer name.'}, status=status.HTTP_400_BAD_REQUEST)

    if raw_order_type in {'dine-in', 'dine_in', 'dinein'}:
        normalized_order_type = 'dine_in'
    elif raw_order_type in {'scheduled', 'pre-order', 'pre_order'}:
        normalized_order_type = 'scheduled'
    else:
        normalized_order_type = 'takeout'

    if normalized_order_type == 'dine_in' and not table_number:
        return Response({'error': 'Table number is required for dine-in orders.'}, status=status.HTTP_400_BAD_REQUEST)

    if table_number is not None and table_number != '':
        table_number = normalize_text(str(table_number), max_length=10, allow_empty=False)
        if table_number is None or not str(table_number).isdigit():
            return Response({'error': 'Invalid table number.'}, status=status.HTTP_400_BAD_REQUEST)

    if normalized_order_type == 'scheduled' and not pickup_time:
        return Response({'error': 'Pickup time is required for scheduled orders.'}, status=status.HTTP_400_BAD_REQUEST)

    # Parse scheduled_at from pickup_time for auto-cancel logic
    scheduled_at = None
    if normalized_order_type == 'scheduled' and pickup_time:
        try:
            from datetime import datetime as dt
            scheduled_at = dt.fromisoformat(pickup_time)
        except (ValueError, TypeError):
            try:
                scheduled_at = dt.strptime(pickup_time, '%Y-%m-%dT%H:%M')
            except (ValueError, TypeError):
                try:
                    scheduled_at = dt.strptime(pickup_time, '%m/%d/%Y, %I:%M %p')
                except (ValueError, TypeError):
                    scheduled_at = None

    access_token = secrets.token_urlsafe(32)
    with transaction.atomic():
        order = Order.objects.create(
            user=user,
            total_price=total_price,
            status='pending',
            order_type=normalized_order_type,
            table_number=table_number,
            pickup_time=pickup_time,
            scheduled_at=scheduled_at,
            customer_name=customer_name or user.first_name or user.email,
            access_token=access_token,
        )
        for item_data in items:
            OrderItem.objects.create(
                order=order,
                name=item_data['name'],
                quantity=item_data['quantity'],
                price=item_data['price'],
                size=item_data.get('size', 'Medium'),
                sugar_level=item_data.get('sugar_level', '100%'),
                add_ons=item_data.get('add_ons', []),
                notes=item_data.get('notes', ''),
            )
            try:
                menu_item = MenuItem.objects.get(name=item_data['name'])
                if menu_item.track_stock and menu_item.stock > 0:
                    menu_item.stock = max(0, menu_item.stock - item_data['quantity'])
                    menu_item.save()
            except MenuItem.DoesNotExist:
                pass

        OrderStatusLog.objects.create(order=order, status='pending')

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'orders',
        {
            'type': 'order_update',
            'message': {
                'order_id': order.id,
                'status': 'pending',
                'items': items,
                'total_price': str(total_price),
                'user_email': user.email,
                'customer_name': order.customer_name,
                'created_at': order.created_at.isoformat(),
            }
        }
    )

    eta = smart_eta.build_eta_payload(order)
    return Response({
        'message': 'Order created successfully.',
        'order_id': order.id,
        'order_token': access_token,
        'total_price': str(total_price),
        'items': items,
        'created_at': order.created_at.isoformat(),
        'eta': eta,
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def order_detail_view(request, order_id):
    """Track order status. Full PII only for owner/staff/valid order token."""
    try:
        order = Order.objects.select_related('user', 'served_by').prefetch_related('items').get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    ok, _ = authorize_order_access(request, order)
    if ok:
        payload = dict(OrderSerializer(order).data)
        payload['eta'] = smart_eta.build_eta_payload(order)
        return Response(payload)

    # Public tracking: status + items only (no email / payment details)
    public = {
        'id': order.id,
        'status': order.status,
        'order_type': order.order_type,
        'table_number': order.table_number,
        'pickup_time': order.pickup_time,
        'created_at': order.created_at,
        'items': [
            {'name': i.name, 'quantity': i.quantity, 'size': i.size}
            for i in order.items.all()
        ],
        'eta': smart_eta.build_eta_payload(order),
    }
    return Response(public)


@api_view(['GET'])
@permission_classes([AllowAny])
def order_eta_view(request, order_id):
    """Get smart ETA for a specific order."""
    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(smart_eta.build_eta_payload(order))


@api_view(['GET'])
@permission_classes([AllowAny])
def eta_preview_view(request):
    """Preview smart ETA before placing an order."""
    try:
        item_units = int(request.query_params.get('item_count', 1))
    except (TypeError, ValueError):
        item_units = 1
    item_units = max(1, min(item_units, 50))
    return Response(smart_eta.build_preview_eta(item_units=item_units))


@api_view(['POST'])
@permission_classes([AllowAny])
def user_cancel_order_view(request, order_id):
    """Order owner (JWT or order token) cancels their own pending order."""
    cancel_reason = normalize_text(
        request.data.get('cancel_reason', ''),
        max_length=500,
        allow_empty=False,
    )
    if not cancel_reason:
        return Response({'error': 'cancel_reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = Order.objects.select_related('user').get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    ok, err = authorize_order_access(request, order, write=True)
    if not ok:
        log_security_event('order_cancel_denied', request=request, detail=f'order={order_id}')
        return err

    if order.status != 'pending':
        return Response({'error': 'Only pending orders can be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        for order_item in order.items.all():
            try:
                menu_item = MenuItem.objects.get(name=order_item.name)
                if menu_item.track_stock:
                    menu_item.stock += order_item.quantity
                    menu_item.save(update_fields=['stock'])
            except MenuItem.DoesNotExist:
                pass

        order.status = 'cancelled'
        order.void_reason = cancel_reason
        order.save(update_fields=['status', 'void_reason'])

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'orders',
        {
            'type': 'order_update',
            'message': {
                'order_id': order.id,
                'status': 'cancelled',
                'cancel_reason': cancel_reason,
                'cancelled_by': 'user',
                'user_email': order.user.email,
                'customer_name': order.customer_name or order.user.first_name or 'Guest',
            }
        }
    )

    serializer = OrderSerializer(order)
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([AllowAny])
@throttle_classes([PaymentRateThrottle])
def user_set_payment_view(request, order_id):
    """Customer sets payment method only — cannot self-attest 'paid' (staff confirms)."""
    payment_method = (request.data.get('payment_method') or '').strip().lower()

    valid_methods = {c[0] for c in Order.PAYMENT_METHOD_CHOICES}
    if payment_method not in valid_methods:
        return Response(
            {'error': f'payment_method must be one of: {", ".join(sorted(valid_methods))}.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        order = Order.objects.select_related('user').get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    ok, err = authorize_order_access(request, order, write=True)
    if not ok:
        log_security_event('order_payment_denied', request=request, detail=f'order={order_id}')
        return err

    if order.status == 'cancelled':
        return Response({'error': 'Cannot set payment on a cancelled order.'}, status=status.HTTP_400_BAD_REQUEST)

    # Payment integrity: customers choose method; settlement stays unpaid until staff marks paid
    order.payment_method = payment_method
    order.payment_status = 'unpaid'
    order.save(update_fields=['payment_method', 'payment_status'])

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        'orders',
        {
            'type': 'order_update',
            'message': {
                'order_id': order.id,
                'status': order.status,
                'payment_method': order.payment_method,
                'payment_status': order.payment_status,
                'user_email': order.user.email,
                'customer_name': order.customer_name or order.user.first_name or 'Guest',
            },
        },
    )

    return Response(OrderSerializer(order).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def user_rate_order_view(request, order_id):
    """Rate a completed order (owner JWT or order token)."""
    rating = request.data.get('rating')
    if rating is None:
        return Response({'error': 'rating is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        rating = int(rating)
        if not (1 <= rating <= 5):
            raise ValueError
    except ValueError:
        return Response({'error': 'Rating must be an integer between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = Order.objects.select_related('user').get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    ok, err = authorize_order_access(request, order, write=True)
    if not ok:
        log_security_event('order_rate_denied', request=request, detail=f'order={order_id}')
        return err

    if order.status != 'completed':
        return Response({'error': 'Only completed orders can be rated.'}, status=status.HTTP_400_BAD_REQUEST)

    if order.rating is not None:
        return Response({'error': 'Order already rated.'}, status=status.HTTP_400_BAD_REQUEST)

    comment = normalize_text(request.data.get('rating_comment') or '', max_length=500, allow_empty=True)
    if comment is None:
        return Response({'error': 'Invalid rating comment.'}, status=status.HTTP_400_BAD_REQUEST)

    order.rating = rating
    order.rating_comment = comment or ''
    order.rated_at = timezone.now()
    order.save(update_fields=['rating', 'rating_comment', 'rated_at'])
    return Response(OrderSerializer(order).data)


@api_view(['PATCH'])
@permission_classes([IsStaffOrAdmin])
def admin_mark_payment_view(request, order_id):
    """Staff/admin: mark an order payment as paid (e.g. cash collected at counter)."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    payment_status = (request.data.get('payment_status') or 'paid').strip().lower()
    payment_method = (request.data.get('payment_method') or '').strip().lower()
    try:
        order = Order.objects.select_related('user').get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    if order.status == 'cancelled':
        return Response({'error': 'Cannot update payment on a cancelled order.'}, status=status.HTTP_400_BAD_REQUEST)

    valid_statuses = {c[0] for c in Order.PAYMENT_STATUS_CHOICES}
    if payment_status not in valid_statuses:
        return Response(
            {'error': f'payment_status must be one of: {", ".join(sorted(valid_statuses))}.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    update_fields = ['payment_status']
    order.payment_status = payment_status

    if payment_method:
        valid_methods = {c[0] for c in Order.PAYMENT_METHOD_CHOICES}
        if payment_method not in valid_methods:
            return Response(
                {'error': f'payment_method must be one of: {", ".join(sorted(valid_methods))}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.payment_method = payment_method
        update_fields.append('payment_method')
    elif not order.payment_method and payment_status == 'paid':
        # Counter collection with no prior method → treat as cash
        order.payment_method = 'cash'
        update_fields.append('payment_method')

    order.save(update_fields=update_fields)

    channel_layer = get_channel_layer()
    payment_payload = {
        'order_id': order.id,
        'status': order.status,
        'payment_method': order.payment_method,
        'payment_status': order.payment_status,
        'user_email': order.user.email,
        'customer_name': order.customer_name or order.user.first_name or 'Guest',
        'marked_paid_by': admin_user.email,
    }
    async_to_sync(channel_layer.group_send)(
        'orders',
        {
            'type': 'order_update',
            'message': payment_payload,
        },
    )
    customer_group = f"user_orders_{order.user.email.replace('@', '_').replace('.', '_')}"
    async_to_sync(channel_layer.group_send)(
        customer_group,
        {
            'type': 'order_payment_update',
            'order_id': order.id,
            'payment_method': order.payment_method,
            'payment_status': order.payment_status,
            'status': order.status,
        },
    )

    return Response(OrderSerializer(order).data)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def admin_void_order_view(request, order_id):
    """Void/cancel an order with a reason and restore inventory."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    void_reason = request.data.get('void_reason', '').strip()
    if not void_reason:
        return Response({'error': 'void_reason is required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    if order.status == 'cancelled':
        return Response({'error': 'Order is already cancelled.'}, status=status.HTTP_400_BAD_REQUEST)

    if order.status in ('ready', 'completed'):
        return Response({'error': 'Cannot void a ready or completed order.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        # Restore stock for each order item
        for order_item in order.items.all():
            try:
                menu_item = MenuItem.objects.get(name=order_item.name)
                if menu_item.track_stock:
                    menu_item.stock += order_item.quantity
                    menu_item.save(update_fields=['stock'])
            except MenuItem.DoesNotExist:
                pass

        order.status = 'cancelled'
        order.void_reason = void_reason
        order.save(update_fields=['status', 'void_reason'])

    # Trigger WebSocket notification (customer + kitchen board)
    channel_layer = get_channel_layer()
    group_name = f"user_orders_{order.user.email.replace('@', '_').replace('.', '_')}"
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            'type': 'order_status_update',
            'order_id': order.id,
            'status': 'cancelled'
        }
    )
    async_to_sync(channel_layer.group_send)(
        'orders',
        {
            'type': 'order_update',
            'message': {
                'order_id': order.id,
                'status': 'cancelled',
                'void_reason': void_reason,
                'cancelled_by': 'staff',
                'user_email': order.user.email,
                'customer_name': order.customer_name or order.user.first_name or 'Guest',
            }
        }
    )

    serializer = OrderSerializer(order)
    return Response(serializer.data)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def cart_view(request):
    """Get, update or clear the authenticated user's cart."""
    user = request.user
    cart, _ = Cart.objects.get_or_create(user=user)

    if request.method == 'GET':
        return Response(CartSerializer(cart).data)

    if request.method == 'DELETE':
        cart.items.all().delete()
        cart.save(update_fields=['updated_at'])
        return Response({'message': 'Cart cleared.'}, status=status.HTTP_200_OK)

    # PUT - update cart
    payload = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
    if hasattr(payload, 'copy'):
        payload = payload.copy()
    else:
        payload = dict(payload)
    payload['email'] = user.email

    serializer = CartUpsertSerializer(data=payload)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    items = serializer.validated_data.get('items', [])
    with transaction.atomic():
        cart.items.all().delete()
        for item in items:
            CartItem.objects.create(
                cart=cart,
                name=item['name'],
                quantity=item['quantity'],
                price=item['price'],
                size=item.get('size', 'Medium'),
                sugar_level=item.get('sugar_level', '100%'),
                add_ons=item.get('add_ons', []),
                notes=item.get('notes', '')
            )
        cart.save(update_fields=['updated_at'])

    return Response(CartSerializer(cart).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_orders_view(request):
    """Get recent orders for admin/staff dashboards (paginated)."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    qs = (
        Order.objects.select_related('user', 'served_by')
        .prefetch_related('items')
        .order_by('-created_at')
    )
    page, meta = paginate_queryset(qs, request, default_limit=150, max_limit=500)
    serializer = OrderSerializer(page, many=True)
    return Response(paginated_response(serializer.data, meta))


@api_view(['PATCH'])
@permission_classes([IsStaffOrAdmin])
def admin_order_status_view(request, order_id):
    """Update an order status from admin panel."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    new_status = request.data.get('status')
    if new_status not in VALID_ORDER_STATUSES:
        return Response({'error': 'Invalid order status.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    old_status = order.status
    if old_status == new_status:
        serializer = OrderSerializer(order)
        return Response(serializer.data)

    order.status = new_status
    order.save(update_fields=['status'])
    OrderStatusLog.objects.create(
        order=order,
        status=new_status,
        changed_by=admin_user,
    )

    # Trigger WebSocket notification (customer + kitchen board)
    channel_layer = get_channel_layer()
    group_name = f"user_orders_{order.user.email.replace('@', '_').replace('.', '_')}"
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            'type': 'order_status_update',
            'order_id': order.id,
            'status': new_status
        }
    )
    async_to_sync(channel_layer.group_send)(
        'orders',
        {
            'type': 'order_update',
            'message': {
                'order_id': order.id,
                'status': new_status,
                'user_email': order.user.email,
                'customer_name': order.customer_name or order.user.first_name or 'Guest',
            }
        }
    )

    serializer = OrderSerializer(order)
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsStaffOrAdmin])
def admin_order_served_by_view(request, order_id):
    """Admin: tag or clear which staff member served a rated order."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    try:
        order = Order.objects.select_related('served_by', 'user').get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    if order.rating is None:
        return Response({'error': 'Only rated orders can be tagged to staff.'}, status=status.HTTP_400_BAD_REQUEST)

    staff_email = request.data.get('staff_email')
    if staff_email in (None, '', 'null'):
        order.served_by = None
        order.save(update_fields=['served_by'])
        return Response(OrderSerializer(order).data)

    try:
        staff_user = CustomUser.objects.get(email=staff_email, role__in=('staff', 'admin'), is_active=True)
    except CustomUser.DoesNotExist:
        return Response({'error': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)

    order.served_by = staff_user
    order.save(update_fields=['served_by'])
    return Response(OrderSerializer(order).data)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_staff_feedback_view(request):
    """Admin: customer feedback aggregated per tagged staff member."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    try:
        days = int(request.query_params.get('days', 90))
    except (TypeError, ValueError):
        days = 90
    return Response(staff_feedback.build_staff_feedback_report(days=days))


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_orders_archived_view(request):
    """List archived orders for admin review."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    qs = (
        Order.objects.filter(is_archived=True)
        .select_related('user', 'served_by')
        .prefetch_related('items')
        .order_by('-created_at')
    )
    page, meta = paginate_queryset(qs, request, default_limit=100, max_limit=500)
    serializer = OrderSerializer(page, many=True)
    return Response(paginated_response(serializer.data, meta))


@api_view(['PATCH'])
@permission_classes([IsStaffOrAdmin])
def admin_archive_order_view(request, order_id):
    """Archive or unarchive a single order."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    archive = request.data.get('archive', True)
    order.is_archived = archive
    order.save(update_fields=['is_archived'])

    serializer = OrderSerializer(order)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def admin_auto_archive_view(request):
    """Auto-archive completed/cancelled orders older than 30 days."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    from datetime import timedelta
    from django.utils import timezone

    cutoff = timezone.now() - timedelta(days=30)
    eligible = Order.objects.filter(
        is_archived=False,
        created_at__lt=cutoff,
        status__in=['completed', 'cancelled'],
    )
    count = eligible.count()
    eligible.update(is_archived=True)

    return Response({'message': f'{count} order(s) auto-archived.', 'archived_count': count})


@api_view(['GET'])
@permission_classes([AllowAny])
def menu_view(request):
    """Get all non-hidden menu items (short-lived cache for high read traffic)."""
    ttl = int(getattr(settings, 'MENU_CACHE_SECONDS', 30))
    cached = cache.get(MENU_CACHE_KEY)
    if cached is not None:
        return Response(cached)
    items = MenuItem.objects.filter(is_hidden=False).order_by('id')
    data = MenuItemSerializer(items, many=True, context={'request': request}).data
    cache.set(MENU_CACHE_KEY, data, ttl)
    return Response(data)


@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsStaffOrAdmin])
def admin_menu_view(request, item_id=None):
    """Admin CRUD for menu items. Supports image upload via multipart/form-data."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    if request.method == 'GET':
        items = MenuItem.objects.all().order_by('id')
        serializer = MenuItemSerializer(items, many=True, context={'request': request})
        return Response(serializer.data)

    if request.method == 'POST':
        data = request.data.copy()
        if request.FILES.get('image'):
            try:
                validate_uploaded_image(request.FILES['image'])
            except DjangoValidationError as exc:
                return Response({'image': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = MenuItemSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            _bust_menu_cache()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if not item_id:
        return Response({'error': 'item_id is required for PUT and DELETE'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        item = MenuItem.objects.get(id=item_id)
    except MenuItem.DoesNotExist:
        return Response({'error': 'Menu item not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'PUT':
        data = request.data.copy()
        if request.FILES.get('image'):
            try:
                validate_uploaded_image(request.FILES['image'])
            except DjangoValidationError as exc:
                return Response({'image': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        # Handle image clearing: if 'image' key exists but is empty string, clear the image
        if 'image' in data and data['image'] == '':
            item.image.delete(save=False)
            data.pop('image')
        serializer = MenuItemSerializer(item, data=data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            _bust_menu_cache()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'DELETE':
        # Delete image file from storage
        if item.image:
            item.image.delete(save=False)
        item.delete()
        _bust_menu_cache()
        return Response({'message': 'Menu item deleted.'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_tables_view(request):
    """Get real-time table statuses derived from active dine-in orders."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    total_tables = int(request.query_params.get('total_tables', 10))

    # Active dine-in orders (not completed/cancelled) — annotate avoids N+1 item counts
    active_orders = (
        Order.objects.filter(
            order_type='dine_in',
            table_number__isnull=False,
            is_archived=False,
        )
        .exclude(status__in=['completed', 'cancelled'])
        .select_related('user')
        .annotate(items_count=Count('items'))
    )

    # Build a map: table_number -> best status
    # Priority: preparing/ready > pending
    table_map = {}
    priority = {'ready': 3, 'preparing': 2, 'pending': 1}
    for order in active_orders:
        tn = str(order.table_number).strip()
        if not tn:
            continue
        existing = table_map.get(tn)
        payload = {
            'status': order.status,
            'order_id': order.id,
            'customer_name': order.customer_name or order.user.first_name or 'Guest',
            'total_price': str(order.total_price),
            'created_at': order.created_at.isoformat(),
            'items_count': order.items_count,
        }
        if existing is None or priority.get(order.status, 0) > priority.get(existing['status'], 0):
            table_map[tn] = payload

    # Build response for all tables
    tables = []
    for i in range(1, total_tables + 1):
        tn = str(i)
        if tn in table_map:
            info = table_map[tn]
            order_status = info['status']
            # pending -> ordering, preparing/ready -> occupied
            if order_status == 'pending':
                table_status = 'ordering'
            else:
                table_status = 'occupied'
            tables.append({
                'table_number': tn,
                'table_status': table_status,
                'order_status': order_status,
                'order_id': info['order_id'],
                'customer_name': info['customer_name'],
                'total_price': info['total_price'],
                'created_at': info['created_at'],
                'items_count': info['items_count'],
            })
        else:
            tables.append({
                'table_number': tn,
                'table_status': 'free',
                'order_status': None,
                'order_id': None,
                'customer_name': None,
                'total_price': None,
                'created_at': None,
                'items_count': None,
            })

    # Summary counts
    summary = {
        'total': total_tables,
        'free': sum(1 for t in tables if t['table_status'] == 'free'),
        'ordering': sum(1 for t in tables if t['table_status'] == 'ordering'),
        'occupied': sum(1 for t in tables if t['table_status'] == 'occupied'),
    }

    return Response({'tables': tables, 'summary': summary})


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_notifications_view(request):
    """Get notifications for admin: new orders, low stock, AI warnings."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    notifications = []

    # New pending orders (created in the last 30 minutes)
    recent_cutoff = timezone.now() - timedelta(minutes=30)
    new_orders = Order.objects.filter(status='pending', created_at__gte=recent_cutoff).order_by('-created_at')
    for order in new_orders:
        notifications.append({
            'id': f'new_order_{order.id}',
            'type': 'new_order',
            'title': f'New Order #{order.id}',
            'message': f'{order.customer_name or order.user.first_name or "Guest"} placed an order for ₱{order.total_price}',
            'time': order.created_at.isoformat(),
            'read': False,
        })

    # Recently cancelled orders (last 24 hours)
    cancel_cutoff = timezone.now() - timedelta(hours=24)
    cancelled_orders = Order.objects.filter(status='cancelled', created_at__gte=cancel_cutoff).order_by('-created_at')
    for order in cancelled_orders:
        notifications.append({
            'id': f'cancel_order_{order.id}',
            'type': 'cancel_order',
            'title': f'Order Cancelled: #{order.id}',
            'message': f'{order.customer_name or order.user.first_name or "Guest"} cancelled their order.',
            'time': order.created_at.isoformat(),
            'read': False,
            'extra_data': {'order_id': f'ORD-{order.id}', 'cancel_reason': order.void_reason}
        })

    # Low stock alerts (stock <= 5 and tracking enabled)
    low_stock_items = MenuItem.objects.filter(track_stock=True, stock__lte=5, stock__gte=1)
    current_time = timezone.now().isoformat()
    for item in low_stock_items:
        notifications.append({
            'id': f'low_stock_{item.id}',
            'type': 'low_stock',
            'title': f'Low Stock: {item.name}',
            'message': f'Only {item.stock} left in inventory. Consider restocking.',
            'time': current_time,
            'read': False,
        })

    # Out of stock alerts (stock = 0 and tracking enabled)
    out_of_stock = MenuItem.objects.filter(track_stock=True, stock=0)
    for item in out_of_stock:
        notifications.append({
            'id': f'out_stock_{item.id}',
            'type': 'ai_warning',
            'title': f'Out of Stock: {item.name}',
            'message': f'{item.name} is completely out of stock. Orders cannot be fulfilled.',
            'time': current_time,
            'read': False,
        })

    # AI Forecast warning: if no completed orders in last 24h
    last_24h = timezone.now() - timedelta(hours=24)
    completed_recent = Order.objects.filter(status='completed', created_at__gte=last_24h).count()
    if completed_recent == 0:
        notifications.append({
            'id': 'ai_no_sales_24h',
            'type': 'ai_warning',
            'title': 'AI Warning: No Sales in 24h',
            'message': 'No completed orders in the last 24 hours. Check operations or run a promotion.',
            'time': timezone.now().isoformat(),
            'read': False,
        })

    # Forecast ready: if there are enough completed orders for analysis (>=5 in last 7 days)
    last_7d = timezone.now() - timedelta(days=7)
    completed_7d = Order.objects.filter(status='completed', created_at__gte=last_7d).count()
    if completed_7d >= 5:
        notifications.append({
            'id': 'forecast_ready',
            'type': 'forecast_ready',
            'title': 'Forecast Ready',
            'message': f'{completed_7d} completed orders this week. Sales forecast is available on the Analytics page.',
            'time': timezone.now().isoformat(),
            'read': False,
        })

    # Sort by time descending
    notifications.sort(key=lambda n: n['time'], reverse=True)

    return Response({'notifications': notifications, 'count': len(notifications)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_spending_view(request):
    """Get monthly spending insights for the authenticated user."""
    user = request.user

    try:
        user = CustomUser.objects.get(pk=user.pk)
    except CustomUser.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    orders = Order.objects.filter(user=user, status='completed').order_by('created_at')

    monthly_data = {}
    for order in orders:
        month_key = order.created_at.strftime('%Y-%m')
        month_label = order.created_at.strftime('%b %Y')
        if month_key not in monthly_data:
            monthly_data[month_key] = {'month': month_label, 'total': 0, 'orders': 0}
        monthly_data[month_key]['total'] += float(order.total_price)
        monthly_data[month_key]['orders'] += 1

    sorted_months = sorted(monthly_data.keys())
    spending = [monthly_data[m] for m in sorted_months]

    total_spent = sum(m['total'] for m in spending)
    total_orders = sum(m['orders'] for m in spending)
    avg_monthly = total_spent / len(spending) if spending else 0

    top_month = max(spending, key=lambda m: m['total']) if spending else None

    return Response({
        'spending': spending,
        'summary': {
            'total_spent': round(total_spent, 2),
            'total_completed_orders': total_orders,
            'avg_monthly': round(avg_monthly, 2),
            'top_month': top_month,
            'months_tracked': len(spending),
        }
    })


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_account_view(request):
    """Permanently delete user account and all associated data."""
    user = request.user
    
    # Delete all associated data in a transaction
    with transaction.atomic():
        # Delete orders (cascade deletes order items)
        Order.objects.filter(user=user).delete()
        
        # Delete cart and cart items
        Cart.objects.filter(user=user).delete()
        
        # Delete the user
        user.delete()
    
    return Response({'message': 'Account deleted successfully.'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_staff_list_view(request):
    """List all staff and admin users."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    staff_users = CustomUser.objects.filter(role__in=('staff', 'admin')).order_by('id')
    serializer = StaffUserSerializer(staff_users, many=True)
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAdminRole])
def admin_staff_update_view(request, user_id):
    """Update a staff user's profile (name, role, is_active)."""
    admin_user, err = _require_staff_actor(request, admin_only=True)
    if err:
        return err
    try:
        staff_user = CustomUser.objects.get(id=user_id, role__in=('staff', 'admin'))
    except CustomUser.DoesNotExist:
        return Response({'error': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Prevent admin from deactivating themselves
    if staff_user.id == admin_user.id:
        if request.data.get('is_active') == False:
            return Response({'error': 'You cannot deactivate your own account.'}, status=status.HTTP_400_BAD_REQUEST)

    # Prevent demoting/deactivating the last active admin (only when role is explicitly changed)
    if staff_user.role == 'admin' and 'role' in request.data and request.data.get('role') != 'admin':
        active_admins = CustomUser.objects.filter(role='admin', is_active=True).count()
        if active_admins <= 1:
            return Response({'error': 'Cannot demote the last active admin.'}, status=status.HTTP_400_BAD_REQUEST)
    if staff_user.role == 'admin' and request.data.get('is_active') is False:
        active_admins = CustomUser.objects.filter(role='admin', is_active=True).exclude(id=staff_user.id).count()
        if active_admins == 0:
            return Response({'error': 'Cannot deactivate the last active admin.'}, status=status.HTTP_400_BAD_REQUEST)

    if request.FILES.get('avatar'):
        try:
            validate_uploaded_image(request.FILES['avatar'])
        except DjangoValidationError as exc:
            return Response({'avatar': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    serializer = StaffUserSerializer(staff_user, data=request.data, partial=True)
    if serializer.is_valid():
        # Handle avatar clearing: empty string in FormData means remove the photo
        if 'avatar' in request.data and request.data['avatar'] == '':
            staff_user.avatar.delete(save=False)
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def clock_in_view(request):
    """Staff clocks in — creates a new ShiftLog entry (pending admin approval)."""
    user = request.user

    # Check if already has an open (non-absent) shift
    open_shift = ShiftLog.objects.filter(user=user, clock_out__isnull=True).exclude(attendance_mark='absent').first()
    if open_shift:
        return Response({'error': 'Already clocked in. Please clock out first.'}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()

    # Block clock-in outside shift hours (compare in local Manila time)
    if user.shift_start and user.shift_end:
        from django.conf import settings
        from zoneinfo import ZoneInfo
        local_tz = ZoneInfo(settings.TIME_ZONE)
        local_now = now.astimezone(local_tz)
        current_time = local_now.time()
        # Allow clock-in from shift_start up to shift_end
        if current_time < user.shift_start or current_time > user.shift_end:
            shift_start_str = user.shift_start.strftime('%I:%M %p')
            shift_end_str = user.shift_end.strftime('%I:%M %p')
            return Response({
                'error': f'You cannot clock in outside your shift hours ({shift_start_str} – {shift_end_str}).',
                'shift_start': user.shift_start.isoformat(),
                'shift_end': user.shift_end.isoformat(),
            }, status=status.HTTP_400_BAD_REQUEST)

    # Auto-detect late arrival if shift_start is configured
    minutes_late = None
    if user.shift_start:
        from datetime import datetime, time as dt_time
        from zoneinfo import ZoneInfo
        from django.conf import settings
        local_tz = ZoneInfo(settings.TIME_ZONE)
        local_now = now.astimezone(local_tz)
        scheduled_start = datetime.combine(local_now.date(), user.shift_start, tzinfo=local_tz)
        diff = (local_now - scheduled_start).total_seconds() / 60
        if diff > 0:
            minutes_late = int(diff)

    shift = ShiftLog.objects.create(user=user, clock_in=now, is_approved=False, minutes_late=minutes_late)
    late_str = f" ({minutes_late}m late)" if minutes_late else ""
    StaffActivity.objects.create(
        user=user, action='clock_in',
        description=f"{user.first_name or user.email} clocked in at {now.strftime('%I:%M %p')}{late_str}",
        shift_log=shift,
    )
    serializer = ShiftLogSerializer(shift)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def clock_out_view(request):
    """Staff clocks out — sets clock_out on the current open ShiftLog."""
    user = request.user

    open_shift = ShiftLog.objects.filter(user=user, clock_out__isnull=True).exclude(attendance_mark='absent').first()
    if not open_shift:
        return Response({'error': 'No active shift found. Please clock in first.'}, status=status.HTTP_400_BAD_REQUEST)

    open_shift.clock_out = timezone.now()
    open_shift.save()
    StaffActivity.objects.create(
        user=user, action='clock_out',
        description=f"{user.first_name or user.email} clocked out at {open_shift.clock_out.strftime('%I:%M %p')}",
        shift_log=open_shift,
    )
    serializer = ShiftLogSerializer(open_shift)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def shift_status_view(request):
    """Get current shift status for a user (clocked in or out) and latest shift."""
    user = request.user

    open_shift = ShiftLog.objects.filter(user=user, clock_out__isnull=True).exclude(attendance_mark='absent').first()
    recent_shifts = ShiftLog.objects.filter(user=user).exclude(attendance_mark='absent').order_by('-clock_in')[:5]
    total_shifts = ShiftLog.objects.filter(user=user).exclude(attendance_mark='absent').count()

    is_pending = open_shift is not None and not open_shift.is_approved
    is_approved = open_shift is not None and open_shift.is_approved

    # Determine if staff can clock in (within shift hours and not already clocked in)
    can_clock_in = True
    if not open_shift and user.shift_start and user.shift_end:
        from django.conf import settings
        from zoneinfo import ZoneInfo
        local_tz = ZoneInfo(settings.TIME_ZONE)
        current_time = timezone.now().astimezone(local_tz).time()
        if current_time < user.shift_start or current_time > user.shift_end:
            can_clock_in = False

    return Response({
        'is_clocked_in': open_shift is not None,
        'is_pending': is_pending,
        'is_approved': is_approved,
        'is_on_break': open_shift.status == 'on_break' if open_shift and open_shift.is_approved else False,
        'can_clock_in': can_clock_in,
        'shift_start': user.shift_start.isoformat() if user.shift_start else None,
        'shift_end': user.shift_end.isoformat() if user.shift_end else None,
        'current_shift': ShiftLogSerializer(open_shift).data if open_shift else None,
        'recent_shifts': ShiftLogSerializer(recent_shifts, many=True).data,
        'total_shifts': total_shifts,
    })


def _parse_multiplier(value):
    try:
        mult = float(value)
        if mult < 1 or mult > 3:
            return None
        return mult
    except (TypeError, ValueError):
        return None


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def weekly_hours_view(request):
    """Total hours worked this week from clock-in/out logs (Mon–Sun, local timezone)."""
    user = request.user

    if user.role not in ('staff', 'admin'):
        return Response({
            'total_seconds': 0,
            'total_hours': 0,
            'display': '0m',
            'week_start': None,
            'week_end': None,
            'shift_count': 0,
            'includes_active_shift': False,
        })

    payroll = shift_hours.compute_user_week_payroll(user)
    return Response({
        'total_seconds': payroll['total_seconds'],
        'total_hours': payroll['total_hours'],
        'display': payroll['total_display'],
        'week_start': payroll['week_start'],
        'week_end': payroll['week_end'],
        'shift_count': payroll['shift_count'],
        'includes_active_shift': payroll['includes_active_shift'],
    })


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def staff_payroll_view(request):
    """Staff payroll breakdown for current week (regular + overtime)."""
    user = request.user

    if user.role not in ('staff', 'admin'):
        return Response({
            'regular_display': '0m',
            'overtime_display': '0m',
            'overtime_multiplier': getattr(settings, 'OVERTIME_MULTIPLIER', 1.25),
        })

    multiplier = _parse_multiplier(request.query_params.get('multiplier'))
    if multiplier is None:
        multiplier = getattr(settings, 'OVERTIME_MULTIPLIER', 1.25)

    return Response(shift_hours.compute_user_week_payroll(user, multiplier=multiplier))


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def payroll_summary_view(request):
    """Admin: weekly payroll summary for all staff with overtime flags."""
    admin_user, err = _require_staff_actor(request, admin_only=True)
    if err:
        return err

    multiplier = _parse_multiplier(request.query_params.get('multiplier'))
    if multiplier is None:
        multiplier = getattr(settings, 'OVERTIME_MULTIPLIER', 1.25)

    staff_filter = request.query_params.get('email')
    staff_qs = CustomUser.objects.filter(role__in=('staff', 'admin'), is_active=True).order_by('name')
    if staff_filter:
        staff_qs = staff_qs.filter(email=staff_filter)

    staff_entries = []
    sum_regular = 0
    sum_overtime = 0
    sum_weighted_ot = 0.0

    for member in staff_qs:
        payroll = shift_hours.compute_user_week_payroll(member, multiplier=multiplier)
        sum_regular += payroll['regular_seconds']
        sum_overtime += payroll['overtime_seconds']
        sum_weighted_ot += payroll['weighted_overtime_hours']
        staff_entries.append({
            'id': member.id,
            'name': member.name,
            'email': member.email,
            'employee_id': member.employee_id,
            'position': member.position or '',
            'avatar': member.avatar.url if member.avatar else None,
            **payroll,
        })

    week_start, _, week_start_date = shift_hours.current_week_bounds()
    week_end_date = week_start_date + timedelta(days=6)

    return Response({
        'week_start': week_start_date.isoformat(),
        'week_end': week_end_date.isoformat(),
        'standard_daily_hours': getattr(settings, 'STANDARD_DAILY_HOURS', 8),
        'overtime_multiplier': multiplier,
        'staff': staff_entries,
        'summary': {
            'staff_count': len(staff_entries),
            'total_regular_seconds': sum_regular,
            'total_overtime_seconds': sum_overtime,
            'total_regular_display': shift_hours.format_hours_display(sum_regular),
            'total_overtime_display': shift_hours.format_hours_display(sum_overtime),
            'total_weighted_overtime_hours': round(sum_weighted_ot, 2),
            'staff_with_overtime': sum(1 for s in staff_entries if s['overtime_seconds'] > 0),
        },
    })


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def all_shift_logs_view(request):
    """Admin view: get all shift logs, optionally filtered by user email."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    queryset = ShiftLog.objects.select_related('user').order_by('-clock_in')

    # Optional filter by specific staff email
    staff_email = request.query_params.get('staff_email')
    if staff_email:
        queryset = queryset.filter(user__email=staff_email)

    # Optional date filter
    date = request.query_params.get('date')
    if date:
        queryset = queryset.filter(clock_in__date=date)

    serializer = ShiftLogSerializer(queryset[:100], many=True)
    return Response(serializer.data)


def _attendance_mark_label(shift):
    if shift.attendance_mark == 'on_time':
        return 'On Time'
    if shift.attendance_mark == 'late':
        return 'Late'
    if shift.attendance_mark == 'absent':
        return 'Absent'
    if not shift.is_approved:
        return 'Pending'
    if shift.status == 'on_break':
        return 'On Break'
    if shift.status == 'clocked_out':
        return 'Completed'
    return 'Clocked In'


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def staff_attendance_history_view(request):
    """Admin: full attendance history for one staff member."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err
    staff_email = request.query_params.get('staff_email')
    if not staff_email:
        return Response({'error': 'staff_email is required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        staff_user = CustomUser.objects.get(email=staff_email, role__in=('staff', 'admin'))
    except CustomUser.DoesNotExist:
        return Response({'error': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = min(100, max(1, int(request.query_params.get('limit', 25))))
    except (TypeError, ValueError):
        limit = 25

    mark_filter = request.query_params.get('mark')
    from_date = request.query_params.get('from_date')
    to_date = request.query_params.get('to_date')

    queryset = ShiftLog.objects.filter(user=staff_user).select_related('user', 'approved_by').order_by('-clock_in')

    if mark_filter in ('on_time', 'late', 'absent', 'pending'):
        if mark_filter == 'pending':
            queryset = queryset.filter(is_approved=False).exclude(attendance_mark='absent')
        else:
            queryset = queryset.filter(attendance_mark=mark_filter)

    if from_date:
        queryset = queryset.filter(clock_in__date__gte=from_date)
    if to_date:
        queryset = queryset.filter(clock_in__date__lte=to_date)

    total = queryset.count()
    offset = (page - 1) * limit
    logs = queryset[offset:offset + limit]

    all_logs = ShiftLog.objects.filter(user=staff_user)
    summary = {
        'total_logs': all_logs.count(),
        'on_time': all_logs.filter(attendance_mark='on_time').count(),
        'late': all_logs.filter(attendance_mark='late').count(),
        'absent': all_logs.filter(attendance_mark='absent').count(),
        'pending': all_logs.filter(is_approved=False).exclude(attendance_mark='absent').count(),
        'with_break': all_logs.filter(break_start__isnull=False).count(),
    }

    log_entries = []
    for shift in logs:
        data = ShiftLogSerializer(shift).data
        data['mark_label'] = _attendance_mark_label(shift)
        data['date'] = shift.clock_in.date().isoformat() if shift.clock_in else None
        data['approved_by_name'] = (
            shift.approved_by.first_name or shift.approved_by.email.split('@')[0]
            if shift.approved_by else None
        )
        log_entries.append(data)

    return Response({
        'staff': {
            'id': staff_user.id,
            'name': staff_user.first_name or staff_user.email.split('@')[0],
            'email': staff_user.email,
            'employee_id': staff_user.employee_id,
            'position': staff_user.position or '',
            'avatar': staff_user.avatar.url if staff_user.avatar else None,
            'shift_start': staff_user.shift_start.isoformat() if staff_user.shift_start else None,
            'shift_end': staff_user.shift_end.isoformat() if staff_user.shift_end else None,
        },
        'summary': summary,
        'logs': log_entries,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total,
            'total_pages': (total + limit - 1) // limit if total else 0,
            'has_next': offset + limit < total,
            'has_prev': page > 1,
        },
    })


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def monthly_attendance_summary_view(request):
    """Monthly calendar summary per staff: present / late / absent per day."""
    actor = request.user
    staff_email = request.query_params.get('staff_email') or request.query_params.get('email')
    if not staff_email:
        staff_email = actor.email

    try:
        staff_user = CustomUser.objects.get(email=staff_email, role__in=('staff', 'admin'))
    except CustomUser.DoesNotExist:
        return Response({'error': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Staff may only view their own calendar; admin can view anyone
    if actor.role != 'admin' and staff_user.id != actor.id:
        return Response({'error': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        year = int(request.query_params.get('year', timezone.now().year))
        month = int(request.query_params.get('month', timezone.now().month))
        if month < 1 or month > 12:
            raise ValueError
    except (TypeError, ValueError):
        return Response({'error': 'Invalid year or month.'}, status=status.HTTP_400_BAD_REQUEST)

    calendar_data = attendance_calendar.build_monthly_calendar(staff_user, year=year, month=month)

    return Response({
        'staff': {
            'id': staff_user.id,
            'name': staff_user.first_name or staff_user.email.split('@')[0],
            'email': staff_user.email,
            'employee_id': staff_user.employee_id,
            'position': staff_user.position or '',
            'avatar': staff_user.avatar.url if staff_user.avatar else None,
        },
        **calendar_data,
    })


@api_view(['GET', 'POST'])
@permission_classes([IsStaffOrAdmin])
def absence_requests_view(request):
    """List or create planned absence requests (staff/admin)."""
    if request.method == 'GET':
        user = request.user
        qs = AbsenceRequest.objects.filter(user=user).select_related('user', 'created_by')
        status_filter = request.query_params.get('status')
        if status_filter in ('approved', 'cancelled'):
            qs = qs.filter(status=status_filter)
        upcoming = request.query_params.get('upcoming')
        if upcoming == 'true':
            qs = qs.filter(absence_date__gte=timezone.now().date(), status='approved')
        return Response(AbsenceRequestSerializer(qs[:100], many=True).data)

    actor = request.user
    absence_date = request.data.get('absence_date')
    reason = (request.data.get('reason') or '').strip()
    staff_email = request.data.get('staff_email')

    if not absence_date:
        return Response({'error': 'absence_date is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not reason:
        return Response({'error': 'reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

    target_email = staff_email if actor.role == 'admin' and staff_email else actor.email
    if actor.role == 'staff' and staff_email and staff_email != actor.email:
        return Response({'error': 'Staff can only log absences for themselves.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        target_user = CustomUser.objects.get(email=target_email, role__in=('staff', 'admin'))
    except CustomUser.DoesNotExist:
        return Response({'error': 'Target staff member not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        from datetime import date as date_cls
        parsed_date = date_cls.fromisoformat(str(absence_date))
    except ValueError:
        return Response({'error': 'Invalid absence_date. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

    if AbsenceRequest.objects.filter(user=target_user, absence_date=parsed_date, status='approved').exists():
        return Response({'error': 'An approved absence already exists for this date.'}, status=status.HTTP_400_BAD_REQUEST)

    absence = AbsenceRequest.objects.create(
        user=target_user,
        absence_date=parsed_date,
        reason=reason,
        status='approved',
        created_by=actor,
    )
    StaffActivity.objects.create(
        user=target_user,
        action='planned_absence',
        description=(
            f"{target_user.first_name or target_user.email} — planned absence on "
            f"{parsed_date.strftime('%b %d, %Y')}: {reason[:120]}"
        ),
        performed_by=actor if actor.id != target_user.id else None,
    )
    return Response(AbsenceRequestSerializer(absence).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_absence_requests_view(request):
    """Admin: list all planned absence requests."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    qs = AbsenceRequest.objects.select_related('user', 'created_by').order_by('-absence_date')
    staff_email = request.query_params.get('staff_email')
    if staff_email:
        qs = qs.filter(user__email=staff_email)
    month = request.query_params.get('month')
    year = request.query_params.get('year')
    if month and year:
        try:
            y, m = int(year), int(month)
            from datetime import date as date_cls
            start = date_cls(y, m, 1)
            if m == 12:
                end = date_cls(y + 1, 1, 1)
            else:
                end = date_cls(y, m + 1, 1)
            qs = qs.filter(absence_date__gte=start, absence_date__lt=end)
        except (TypeError, ValueError):
            pass

    status_filter = request.query_params.get('status')
    if status_filter in ('approved', 'cancelled'):
        qs = qs.filter(status=status_filter)

    return Response(AbsenceRequestSerializer(qs[:200], many=True).data)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsStaffOrAdmin])
def absence_request_detail_view(request, request_id):
    """Cancel a planned absence request."""
    actor = request.user

    try:
        absence = AbsenceRequest.objects.select_related('user').get(id=request_id)
    except AbsenceRequest.DoesNotExist:
        return Response({'error': 'Absence request not found.'}, status=status.HTTP_404_NOT_FOUND)

    if actor.role == 'staff' and absence.user_id != actor.id:
        return Response({'error': 'You can only cancel your own absence requests.'}, status=status.HTTP_403_FORBIDDEN)

    absence.status = 'cancelled'
    absence.save(update_fields=['status', 'updated_at'])
    return Response(AbsenceRequestSerializer(absence).data)


def _parse_shift_date(value, field_name='shift_date'):
    from datetime import date as date_cls
    try:
        return date_cls.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ValueError(f'Invalid {field_name}. Use YYYY-MM-DD.')


def _parse_shift_time(value, field_name):
    from datetime import time as time_cls
    if not value:
        raise ValueError(f'{field_name} is required.')
    text = str(value).strip()
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    raise ValueError(f'Invalid {field_name}. Use HH:MM or HH:MM:SS.')


def _require_staff_actor(request, *, admin_only=False):
    """Resolve actor from JWT (Authorization: Bearer). Do not trust admin_email alone."""
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return None, Response(
            {'error': 'Authentication required. Send Authorization: Bearer <access_token>.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    role = getattr(user, 'role', None)
    if admin_only:
        if role != 'admin':
            return None, Response(
                {'error': 'Forbidden. Admin access required.'},
                status=status.HTTP_403_FORBIDDEN,
            )
    elif role not in ('admin', 'staff'):
        return None, Response({'error': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
    return user, None


def _require_admin_actor(email=None, request=None, *, admin_only=False):
    """Back-compat wrapper: prefer request JWT; email is ignored for authorization."""
    if request is not None:
        return _require_staff_actor(request, admin_only=admin_only)
    return None, Response(
        {'error': 'Authentication required. Send Authorization: Bearer <access_token>.'},
        status=status.HTTP_401_UNAUTHORIZED,
    )


@api_view(['GET', 'POST'])
@permission_classes([IsStaffOrAdmin])
def admin_shift_assignments_view(request):
    """Admin: list or create shift assignments for a week (Monday week_start)."""
    admin_email = request.query_params.get('admin_email') if request.method == 'GET' else request.data.get('admin_email')
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    if request.method == 'GET':
        week_start_raw = request.query_params.get('week_start')
        if not week_start_raw:
            _, _, week_start_date = shift_hours.current_week_bounds()
        else:
            try:
                week_start_date = _parse_shift_date(week_start_raw, 'week_start')
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        week_end_date = week_start_date + timedelta(days=6)
        qs = ShiftAssignment.objects.filter(
            week_start=week_start_date,
        ).select_related('user', 'created_by').order_by('shift_date', 'start_time')

        staff_email = request.query_params.get('staff_email')
        if staff_email:
            qs = qs.filter(user__email=staff_email)

        return Response({
            'week_start': week_start_date.isoformat(),
            'week_end': week_end_date.isoformat(),
            'assignments': ShiftAssignmentSerializer(qs, many=True).data,
        })

    staff_email = request.data.get('staff_email')
    if not staff_email:
        return Response({'error': 'staff_email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_user = CustomUser.objects.get(email=staff_email, role__in=('staff', 'admin'), is_active=True)
    except CustomUser.DoesNotExist:
        return Response({'error': 'Staff user not found.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        shift_date = _parse_shift_date(request.data.get('shift_date'))
        start_time = _parse_shift_time(request.data.get('start_time'), 'start_time')
        end_time = _parse_shift_time(request.data.get('end_time'), 'end_time')
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    station = request.data.get('station')
    valid_stations = {choice[0] for choice in CustomUser.POSITION_CHOICES}
    if station not in valid_stations:
        return Response({'error': 'Invalid station.'}, status=status.HTTP_400_BAD_REQUEST)

    if start_time >= end_time:
        return Response({'error': 'End time must be after start time.'}, status=status.HTTP_400_BAD_REQUEST)

    week_start_date = shift_hours.week_start_for_date(shift_date)
    week_end_date = week_start_date + timedelta(days=6)
    if shift_date < week_start_date or shift_date > week_end_date:
        return Response({'error': 'shift_date must fall within its week.'}, status=status.HTTP_400_BAD_REQUEST)

    if ShiftAssignment.objects.filter(user=target_user, shift_date=shift_date).exists():
        return Response({'error': 'This staff member already has a shift assigned for that date.'}, status=status.HTTP_400_BAD_REQUEST)

    assignment = ShiftAssignment.objects.create(
        user=target_user,
        shift_date=shift_date,
        week_start=week_start_date,
        start_time=start_time,
        end_time=end_time,
        station=station,
        created_by=admin_user,
    )
    return Response(ShiftAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsStaffOrAdmin])
def admin_shift_assignment_detail_view(request, assignment_id):
    """Admin: update or delete a shift assignment."""
    admin_email = request.data.get('admin_email') or request.query_params.get('admin_email')
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    try:
        assignment = ShiftAssignment.objects.select_related('user').get(id=assignment_id)
    except ShiftAssignment.DoesNotExist:
        return Response({'error': 'Shift assignment not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        assignment.delete()
        return Response({'success': True})

    updates = {}
    if 'start_time' in request.data:
        try:
            updates['start_time'] = _parse_shift_time(request.data.get('start_time'), 'start_time')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if 'end_time' in request.data:
        try:
            updates['end_time'] = _parse_shift_time(request.data.get('end_time'), 'end_time')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if 'station' in request.data:
        station = request.data.get('station')
        valid_stations = {choice[0] for choice in CustomUser.POSITION_CHOICES}
        if station not in valid_stations:
            return Response({'error': 'Invalid station.'}, status=status.HTTP_400_BAD_REQUEST)
        updates['station'] = station

    start_time = updates.get('start_time', assignment.start_time)
    end_time = updates.get('end_time', assignment.end_time)
    if start_time >= end_time:
        return Response({'error': 'End time must be after start time.'}, status=status.HTTP_400_BAD_REQUEST)

    for field, value in updates.items():
        setattr(assignment, field, value)
    if updates:
        assignment.save(update_fields=[*updates.keys(), 'updated_at'])
    return Response(ShiftAssignmentSerializer(assignment).data)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def staff_shift_assignments_view(request):
    """Staff: view own shift assignments for a week."""
    staff_user = request.user

    week_start_raw = request.query_params.get('week_start')
    if not week_start_raw:
        _, _, week_start_date = shift_hours.current_week_bounds()
    else:
        try:
            week_start_date = _parse_shift_date(week_start_raw, 'week_start')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    week_end_date = week_start_date + timedelta(days=6)
    qs = ShiftAssignment.objects.filter(
        user=staff_user,
        week_start=week_start_date,
    ).order_by('shift_date', 'start_time')

    return Response({
        'week_start': week_start_date.isoformat(),
        'week_end': week_end_date.isoformat(),
        'assignments': ShiftAssignmentSerializer(qs, many=True).data,
    })


def _shift_duration_hours(shift_date, start_time, end_time):
    start_dt = datetime.combine(shift_date, start_time)
    end_dt = datetime.combine(shift_date, end_time)
    return round((end_dt - start_dt).total_seconds() / 3600, 2)


def _format_time_12h(value):
    return value.strftime('%I:%M %p').lstrip('0')


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_shift_schedule_export_view(request):
    """Admin: export weekly shift assignments as CSV for printing or sharing."""
    admin_email = request.query_params.get('admin_email')
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    week_start_raw = request.query_params.get('week_start')
    if not week_start_raw:
        _, _, week_start_date = shift_hours.current_week_bounds()
    else:
        try:
            week_start_date = _parse_shift_date(week_start_raw, 'week_start')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    week_end_date = week_start_date + timedelta(days=6)
    assignments = ShiftAssignment.objects.filter(
        week_start=week_start_date,
    ).select_related('user').order_by('shift_date', 'start_time', 'user__first_name')

    filename = f'shift-schedule-{week_start_date.isoformat()}.csv'
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response.write('\ufeff')

    writer = csv.writer(response)
    writer.writerow([
        'Week Start', 'Week End', 'Staff Name', 'Employee ID', 'Email',
        'Shift Date', 'Day', 'Start Time', 'End Time', 'Station', 'Duration (hrs)',
    ])

    if not assignments.exists():
        writer.writerow([
            week_start_date.isoformat(),
            week_end_date.isoformat(),
            '', '', '', '', '', '', '', 'No shifts assigned this week', '',
        ])
    else:
        for assignment in assignments:
            user = assignment.user
            writer.writerow([
                week_start_date.isoformat(),
                week_end_date.isoformat(),
                user.first_name or user.email.split('@')[0],
                user.employee_id or '',
                user.email,
                assignment.shift_date.isoformat(),
                assignment.shift_date.strftime('%A'),
                _format_time_12h(assignment.start_time),
                _format_time_12h(assignment.end_time),
                assignment.get_station_display(),
                _shift_duration_hours(assignment.shift_date, assignment.start_time, assignment.end_time),
            ])

    return response


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_drink_prep_times_view(request):
    """Admin analytics: average drink prep time (Preparing → Ready) per barista."""
    admin_email = request.query_params.get('admin_email')
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    try:
        days = int(request.query_params.get('days', 30))
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))

    baristas_only = request.query_params.get('baristas_only', 'true').lower() != 'false'
    report = drink_prep.build_drink_prep_report(days=days, baristas_only=baristas_only)
    return Response(report)


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def admin_drink_prep_times_export_view(request):
    """Export measured prep times as CSV for thesis / reporting."""
    admin_email = request.query_params.get('admin_email')
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    try:
        days = int(request.query_params.get('days', 30))
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))

    baristas_only = request.query_params.get('baristas_only', 'true').lower() != 'false'
    report = drink_prep.build_drink_prep_report(days=days, baristas_only=baristas_only)

    filename = f'drink-prep-times-{days}d.csv'
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response.write('\ufeff')

    writer = csv.writer(response)
    writer.writerow([
        'Order', 'Barista', 'Employee ID', 'Position', 'Preparing At', 'Ready At',
        'Prep Time (sec)', 'Prep Time', 'Items',
    ])
    for row in report['orders']:
        writer.writerow([
            row['order_label'],
            row['barista_name'],
            row['employee_id'] or '',
            row['position_display'],
            row['preparing_at'],
            row['ready_at'],
            row['prep_seconds'],
            row['prep_label'],
            row['item_count'],
        ])

    if not report['orders']:
        writer.writerow(['No measured orders in this period', '', '', '', '', '', '', '', ''])

    return response


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def break_start_view(request):
    """Staff starts a break — sets break_start on the current open ShiftLog."""
    user = request.user

    open_shift = ShiftLog.objects.filter(user=user, clock_out__isnull=True, is_approved=True).exclude(attendance_mark='absent').first()
    if not open_shift:
        return Response({'error': 'No approved active shift found. Please clock in and wait for approval.'}, status=status.HTTP_400_BAD_REQUEST)

    if open_shift.break_start and not open_shift.break_end:
        return Response({'error': 'Already on break.'}, status=status.HTTP_400_BAD_REQUEST)

    open_shift.break_start = timezone.now()
    open_shift.break_end = None
    open_shift.save()
    StaffActivity.objects.create(
        user=user, action='break_start',
        description=f"{user.first_name or user.email} started break at {open_shift.break_start.strftime('%I:%M %p')}",
        shift_log=open_shift,
    )
    serializer = ShiftLogSerializer(open_shift)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def break_end_view(request):
    """Staff ends a break — sets break_end on the current open ShiftLog."""
    user = request.user

    open_shift = ShiftLog.objects.filter(user=user, clock_out__isnull=True, is_approved=True).exclude(attendance_mark='absent').first()
    if not open_shift:
        return Response({'error': 'No approved active shift found.'}, status=status.HTTP_400_BAD_REQUEST)

    if not open_shift.break_start:
        return Response({'error': 'Not on break.'}, status=status.HTTP_400_BAD_REQUEST)

    if open_shift.break_end:
        return Response({'error': 'Break already ended.'}, status=status.HTTP_400_BAD_REQUEST)

    open_shift.break_end = timezone.now()
    open_shift.save()
    StaffActivity.objects.create(
        user=user, action='break_end',
        description=f"{user.first_name or user.email} ended break at {open_shift.break_end.strftime('%I:%M %p')}",
        shift_log=open_shift,
    )
    serializer = ShiftLogSerializer(open_shift)
    return Response(serializer.data)


def _attendance_absent_today_flags(user, today_shift, now, shift_start_override=None, shift_end_override=None):
    return attendance_calendar.attendance_absent_today_flags(
        user, today_shift, now,
        shift_start_override=shift_start_override,
        shift_end_override=shift_end_override,
    )


def _lineup_display_status(staff_user, today_shift, planned_absence, start_override=None):
    """Compact attendance label for today's shift lineup widget."""
    if planned_absence:
        return 'planned_absent'
    if today_shift:
        if today_shift.status == 'pending':
            return 'pending'
        if today_shift.status == 'late' or (today_shift.minutes_late and today_shift.minutes_late > 0):
            return 'late'
        return today_shift.status
    flags = _attendance_absent_today_flags(
        staff_user, today_shift, timezone.now(),
        shift_start_override=start_override,
    )
    if flags.get('absent_today'):
        return 'absent_today'
    if flags.get('within_grace'):
        return 'within_grace'
    return 'not_clocked_in'


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def today_shift_lineup_view(request):
    """Admin dashboard: who is scheduled today, shift times, station, and live status."""
    admin_email = request.query_params.get('admin_email')
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    today = timezone.now().date()
    staff_users = CustomUser.objects.filter(role__in=('staff', 'admin'), is_active=True).order_by('first_name', 'email')
    today_assignments = {
        a.user_id: a
        for a in ShiftAssignment.objects.filter(shift_date=today).select_related('user')
    }
    today_absences = {
        r.user_id: r
        for r in AbsenceRequest.objects.filter(absence_date=today, status='approved')
    }
    position_labels = dict(CustomUser.POSITION_CHOICES)

    lineup = []
    for s in staff_users:
        assignment = today_assignments.get(s.id)
        planned_absence = today_absences.get(s.id)

        if assignment:
            start_time = assignment.start_time
            end_time = assignment.end_time
            station = assignment.station
            station_display = assignment.get_station_display()
            source = 'assigned'
            assignment_id = assignment.id
        elif s.shift_start and s.shift_end:
            start_time = s.shift_start
            end_time = s.shift_end
            station = s.position or ''
            station_display = position_labels.get(s.position, s.position or 'Unassigned')
            source = 'default'
            assignment_id = None
        else:
            continue

        today_shift = ShiftLog.objects.filter(user=s, clock_in__date=today).order_by('-clock_in').first()
        display_status = _lineup_display_status(
            s, today_shift, planned_absence,
            start_override=assignment.start_time if assignment else None,
        )

        lineup.append({
            'user_id': s.id,
            'assignment_id': assignment_id,
            'name': s.first_name or s.email.split('@')[0],
            'email': s.email,
            'avatar': s.avatar.url if s.avatar else None,
            'employee_id': s.employee_id,
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
            'station': station,
            'station_display': station_display,
            'source': source,
            'display_status': display_status,
            'clock_in': today_shift.clock_in.isoformat() if today_shift and today_shift.clock_in else None,
            'planned_absence': {
                'id': planned_absence.id,
                'reason': planned_absence.reason,
            } if planned_absence else None,
        })

    lineup.sort(key=lambda row: row['start_time'])

    on_shift = sum(1 for row in lineup if row['display_status'] in ('clocked_in', 'on_break', 'pending', 'late'))
    return Response({
        'date': today.isoformat(),
        'date_label': today.strftime('%A, %B %d, %Y'),
        'lineup': lineup,
        'summary': {
            'scheduled': len(lineup),
            'on_shift': on_shift,
            'clocked_in': sum(1 for row in lineup if row['display_status'] in ('clocked_in', 'on_break')),
            'not_yet_in': sum(1 for row in lineup if row['display_status'] in ('not_clocked_in', 'within_grace')),
            'absent_today': sum(1 for row in lineup if row['display_status'] == 'absent_today'),
            'planned_absent': sum(1 for row in lineup if row['display_status'] == 'planned_absent'),
        },
    })


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def today_attendance_view(request):
    """Admin view: today's attendance with clocked_in / on_break / clocked_out status per staff."""
    admin_user, err = _require_staff_actor(request)
    if err:
        return err

    today = timezone.now().date()
    now = timezone.now()
    grace_minutes = getattr(settings, 'ATTENDANCE_GRACE_MINUTES', 15)
    staff_users = CustomUser.objects.filter(role__in=('staff', 'admin'), is_active=True).order_by('id')
    today_absences = {
        r.user_id: r
        for r in AbsenceRequest.objects.filter(
            absence_date=today, status='approved',
        ).select_related('user', 'created_by')
    }
    today_assignments = {
        a.user_id: a
        for a in ShiftAssignment.objects.filter(shift_date=today).select_related('user')
    }

    attendance = []
    for s in staff_users:
        today_shift = ShiftLog.objects.filter(user=s, clock_in__date=today).order_by('-clock_in').first()
        planned_absence = today_absences.get(s.id)
        day_assignment = today_assignments.get(s.id)
        effective_start = day_assignment.start_time if day_assignment else s.shift_start
        effective_end = day_assignment.end_time if day_assignment else s.shift_end
        entry = {
            'id': s.id,
            'shift_id': today_shift.id if today_shift else None,
            'name': s.first_name or s.email.split('@')[0],
            'email': s.email,
            'avatar': s.avatar.url if s.avatar else None,
            'position': s.position,
            'employee_id': s.employee_id,
            'shift_start': effective_start.isoformat() if effective_start else None,
            'shift_end': effective_end.isoformat() if effective_end else None,
            'shift_assignment': {
                'id': day_assignment.id,
                'station': day_assignment.station,
                'station_display': day_assignment.get_station_display(),
                'start_time': day_assignment.start_time.isoformat(),
                'end_time': day_assignment.end_time.isoformat(),
            } if day_assignment else None,
            'status': 'not_clocked_in',
            'clock_in': None,
            'clock_out': None,
            'break_start': None,
            'break_end': None,
            'duration': None,
            'minutes_late': None,
            'planned_absence': None,
        }
        if planned_absence:
            entry['planned_absence'] = {
                'id': planned_absence.id,
                'reason': planned_absence.reason,
                'absence_date': planned_absence.absence_date.isoformat(),
            }
        if today_shift:
            entry['status'] = today_shift.status
            entry['clock_in'] = today_shift.clock_in.isoformat() if today_shift.clock_in else None
            entry['clock_out'] = today_shift.clock_out.isoformat() if today_shift.clock_out else None
            entry['break_start'] = today_shift.break_start.isoformat() if today_shift.break_start else None
            entry['break_end'] = today_shift.break_end.isoformat() if today_shift.break_end else None
            entry['minutes_late'] = today_shift.minutes_late
            dur = today_shift.duration
            if dur:
                total_seconds = int(dur.total_seconds())
                entry['duration'] = f"{total_seconds // 3600}h {(total_seconds % 3600) // 60}m"

        absent_flags = _attendance_absent_today_flags(
            s, today_shift, now,
            shift_start_override=day_assignment.start_time if day_assignment else None,
            shift_end_override=day_assignment.end_time if day_assignment else None,
        )
        entry.update(absent_flags)

        if planned_absence:
            entry['display_status'] = 'planned_absent'
            entry['status'] = 'planned_absent'
        elif entry['status'] == 'not_clocked_in' and entry['absent_today']:
            entry['display_status'] = 'absent_today'
        elif entry['status'] == 'not_clocked_in' and entry['within_grace']:
            entry['display_status'] = 'within_grace'
        else:
            entry['display_status'] = entry['status']

        attendance.append(entry)

    # Summary counts
    summary = {
        'total_staff': len(attendance),
        'pending': sum(1 for a in attendance if a['status'] == 'pending'),
        'clocked_in': sum(1 for a in attendance if a['status'] == 'clocked_in'),
        'on_break': sum(1 for a in attendance if a['status'] == 'on_break'),
        'clocked_out': sum(1 for a in attendance if a['status'] == 'clocked_out'),
        'late': sum(1 for a in attendance if a['status'] == 'late'),
        'absent': sum(1 for a in attendance if a['status'] == 'absent'),
        'planned_absent': sum(1 for a in attendance if a.get('display_status') == 'planned_absent'),
        'absent_today': sum(1 for a in attendance if a['absent_today'] and a.get('display_status') != 'planned_absent'),
        'within_grace': sum(
            1 for a in attendance
            if a['status'] == 'not_clocked_in' and a['within_grace'] and not a['absent_today']
        ),
        'not_clocked_in': sum(
            1 for a in attendance
            if a['status'] == 'not_clocked_in' and not a['absent_today'] and not a['within_grace']
        ),
        'grace_minutes': grace_minutes,
    }

    return Response({'attendance': attendance, 'summary': summary})


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def approve_clock_in_view(request, shift_id):
    """Admin approves a pending clock-in as On Time. The original clock_in timestamp is preserved."""
    admin_user, err = _require_staff_actor(request, admin_only=True)
    if err:
        return err

    try:
        shift = ShiftLog.objects.get(id=shift_id)
    except ShiftLog.DoesNotExist:
        return Response({'error': 'Shift not found.'}, status=status.HTTP_404_NOT_FOUND)

    if shift.is_approved:
        return Response({'error': 'Shift already approved.'}, status=status.HTTP_400_BAD_REQUEST)

    if shift.attendance_mark == 'absent':
        return Response({'error': 'Cannot approve an absent shift.'}, status=status.HTTP_400_BAD_REQUEST)

    # Approve as On Time — clock_in timestamp stays the same (original staff timestamp)
    shift.is_approved = True
    shift.approved_by = admin_user
    shift.approved_at = timezone.now()
    shift.attendance_mark = 'on_time'
    shift.save()
    StaffActivity.objects.create(
        user=shift.user, action='approved',
        description=f"{admin_user.first_name or admin_user.email} approved {shift.user.first_name or shift.user.email}'s clock-in as On Time",
        performed_by=admin_user, shift_log=shift,
    )
    serializer = ShiftLogSerializer(shift)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def mark_late_view(request, shift_id):
    """Admin approves a pending clock-in but marks it as Late."""
    admin_user, err = _require_staff_actor(request, admin_only=True)
    if err:
        return err

    try:
        shift = ShiftLog.objects.get(id=shift_id)
    except ShiftLog.DoesNotExist:
        return Response({'error': 'Shift not found.'}, status=status.HTTP_404_NOT_FOUND)

    if shift.is_approved and shift.attendance_mark != 'late':
        return Response({'error': 'Shift already approved.'}, status=status.HTTP_400_BAD_REQUEST)

    if shift.attendance_mark == 'absent':
        return Response({'error': 'Cannot mark an absent shift as late.'}, status=status.HTTP_400_BAD_REQUEST)

    # Approve but mark as Late — clock_in timestamp stays the same
    shift.is_approved = True
    shift.approved_by = admin_user
    shift.approved_at = timezone.now()
    shift.attendance_mark = 'late'
    shift.save()
    StaffActivity.objects.create(
        user=shift.user, action='marked_late',
        description=f"{admin_user.first_name or admin_user.email} marked {shift.user.first_name or shift.user.email} as Late",
        performed_by=admin_user, shift_log=shift,
    )
    serializer = ShiftLogSerializer(shift)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def mark_absent_view(request, shift_id):
    """Admin marks a pending clock-in as Absent."""
    admin_user, err = _require_staff_actor(request, admin_only=True)
    if err:
        return err

    try:
        shift = ShiftLog.objects.get(id=shift_id)
    except ShiftLog.DoesNotExist:
        return Response({'error': 'Shift not found.'}, status=status.HTTP_404_NOT_FOUND)

    if shift.attendance_mark == 'absent':
        return Response({'error': 'Shift already marked absent.'}, status=status.HTTP_400_BAD_REQUEST)

    # Mark as Absent — shift is voided, staff can clock in again
    shift.attendance_mark = 'absent'
    shift.is_approved = False
    shift.save()
    StaffActivity.objects.create(
        user=shift.user, action='marked_absent',
        description=f"{admin_user.first_name or admin_user.email} marked {shift.user.first_name or shift.user.email} as Absent",
        performed_by=admin_user, shift_log=shift,
    )
    serializer = ShiftLogSerializer(shift)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsStaffOrAdmin])
def cancel_overdue_scheduled_orders_view(request):
    """Auto-cancel scheduled orders whose pickup time has passed. Called by frontend on poll."""
    from django.core.management import call_command
    from io import StringIO
    out = StringIO()
    call_command('cancel_overdue_orders', grace_minutes=30, stdout=out)
    return Response({'message': out.getvalue().strip()})


@api_view(['GET'])
@permission_classes([IsStaffOrAdmin])
def staff_activity_feed_view(request):
    """Get recent staff activity feed (audit log). Supports ?hours=24 filter."""
    try:
        hours = int(request.query_params.get('hours', 24))
    except (TypeError, ValueError):
        hours = 24
    hours = max(1, min(hours, 168))
    since = timezone.now() - timedelta(hours=hours)
    activities = (
        StaffActivity.objects.filter(created_at__gte=since)
        .select_related('user', 'performed_by', 'shift_log', 'order')
        .order_by('-created_at')[:100]
    )
    serializer = StaffActivitySerializer(activities, many=True)
    return Response(serializer.data)
