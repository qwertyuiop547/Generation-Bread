from rest_framework import serializers
from .models import CustomUser, Order, OrderItem, Cart, CartItem, MenuItem, ShiftLog, StaffActivity, AbsenceRequest, ShiftAssignment
from .sql_safety import normalize_email, normalize_text


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10)
    name = serializers.CharField(source='first_name')

    class Meta:
        model = CustomUser
        fields = ['name', 'email', 'password']

    def validate_email(self, value):
        email = normalize_email(value)
        if not email:
            raise serializers.ValidationError("Enter a valid email address.")
        if CustomUser.objects.filter(email=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate_name(self, value):
        name = normalize_text(value, max_length=120, allow_empty=False)
        if name is None:
            raise serializers.ValidationError("Enter a valid name.")
        return name

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        validate_password(value)
        return value

    def create(self, validated_data):
        user = CustomUser.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            role='user',
            is_email_verified=False,
        )
        return user


class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='first_name')

    class Meta:
        model = CustomUser
        fields = ['id', 'name', 'email', 'role', 'is_email_verified']


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'name', 'quantity', 'price', 'size', 'sugar_level', 'add_ons', 'notes']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.first_name', read_only=True)
    served_by_name = serializers.SerializerMethodField()
    served_by_email = serializers.EmailField(source='served_by.email', read_only=True, default=None)
    served_by_employee_id = serializers.CharField(source='served_by.employee_id', read_only=True, default=None)

    class Meta:
        model = Order
        fields = [
            'id',
            'user',
            'user_email',
            'user_name',
            'customer_name',
            'total_price',
            'status',
            'order_type',
            'table_number',
            'pickup_time',
            'scheduled_at',
            'payment_method',
            'payment_status',
            'void_reason',
            'rating',
            'rating_comment',
            'rated_at',
            'served_by',
            'served_by_name',
            'served_by_email',
            'served_by_employee_id',
            'is_archived',
            'created_at',
            'items',
        ]

    def get_served_by_name(self, obj):
        if not obj.served_by:
            return None
        return obj.served_by.first_name or obj.served_by.email.split('@')[0]


class CartItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CartItem
        fields = ['id', 'name', 'quantity', 'price', 'size', 'sugar_level', 'add_ons', 'notes']


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Cart
        fields = ['id', 'user', 'user_email', 'created_at', 'updated_at', 'items', 'total_items', 'total_price']


class CartUpsertItemSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    quantity = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    size = serializers.CharField(max_length=20, default='Medium')
    sugar_level = serializers.CharField(max_length=20, default='100%')
    add_ons = serializers.ListField(child=serializers.CharField(max_length=100), default=list)
    notes = serializers.CharField(allow_blank=True, required=False)


class CartUpsertSerializer(serializers.Serializer):
    email = serializers.EmailField()
    items = CartUpsertItemSerializer(many=True, required=False, default=list)


class MenuItemSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = ['id', 'name', 'category', 'color', 'price', 'description', 'bg_color', 'image', 'image_url', 'is_hidden', 'stock', 'track_stock', 'created_at']
        # Never expose raw binary blobs in list/detail JSON
        extra_kwargs = {
            'image': {'write_only': False, 'required': False},
        }

    def get_image_url(self, obj):
        # Prefer durable DB-backed media endpoint (survives Render redeploys).
        if obj.image_data or obj.image:
            request = self.context.get('request')
            path = f'/api/auth/menu-media/{obj.id}/'
            if request:
                return request.build_absolute_uri(path)
            return path
        return None

    def _capture_image_blob(self, image_file):
        if not image_file:
            return None, ''
        content_type = (getattr(image_file, 'content_type', None) or 'image/jpeg').lower().strip()
        raw = image_file.read()
        try:
            image_file.seek(0)
        except Exception:
            pass
        return raw, content_type

    def create(self, validated_data):
        image = validated_data.get('image')
        blob, content_type = self._capture_image_blob(image)
        instance = super().create(validated_data)
        if blob is not None:
            instance.image_data = blob
            instance.image_content_type = content_type
            instance.save(update_fields=['image_data', 'image_content_type'])
        return instance

    def update(self, instance, validated_data):
        image = validated_data.get('image')
        blob = None
        content_type = ''
        if image is not None:
            blob, content_type = self._capture_image_blob(image)
        instance = super().update(instance, validated_data)
        if blob is not None:
            instance.image_data = blob
            instance.image_content_type = content_type
            instance.save(update_fields=['image_data', 'image_content_type'])
        return instance


class StaffUserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='first_name')

    class Meta:
        model = CustomUser
        fields = ['id', 'name', 'email', 'role', 'employee_id', 'phone', 'position', 'shift_start', 'shift_end', 'bio', 'avatar', 'is_email_verified', 'is_active', 'date_joined']
        read_only_fields = ['id', 'email', 'employee_id', 'date_joined']

    def validate_role(self, value):
        if value not in ('staff', 'admin'):
            raise serializers.ValidationError("Can only assign staff or admin role.")
        return value

    def validate_position(self, value):
        valid_positions = [c[0] for c in CustomUser.POSITION_CHOICES]
        if value and value not in valid_positions:
            raise serializers.ValidationError(f"Invalid position. Choose from: {', '.join(valid_positions)}")
        return value


class ShiftLogSerializer(serializers.ModelSerializer):
    duration = serializers.SerializerMethodField()
    break_duration = serializers.SerializerMethodField()
    status = serializers.CharField(read_only=True)
    user_name = serializers.CharField(source='user.first_name', default='')
    user_email = serializers.CharField(source='user.email', default='')
    user_avatar = serializers.ImageField(source='user.avatar', default=None, allow_null=True)
    user_position = serializers.CharField(source='user.position', default='')

    class Meta:
        model = ShiftLog
        fields = ['id', 'user', 'user_name', 'user_email', 'user_avatar', 'user_position', 'clock_in', 'clock_out', 'break_start', 'break_end', 'is_approved', 'approved_by', 'approved_at', 'attendance_mark', 'minutes_late', 'status', 'duration', 'break_duration', 'created_at']
        read_only_fields = ['id', 'user', 'clock_in', 'is_approved', 'approved_by', 'approved_at', 'attendance_mark', 'minutes_late', 'created_at']

    def get_duration(self, obj):
        dur = obj.duration
        if dur is None:
            return None
        total_seconds = int(dur.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        return f"{hours}h {minutes}m"

    def get_break_duration(self, obj):
        if not obj.break_start:
            return None
        end = obj.break_end
        if not end:
            from django.utils import timezone
            end = timezone.now()
        if end <= obj.break_start:
            return None
        total_seconds = int((end - obj.break_start).total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        if hours and minutes:
            return f"{hours}h {minutes}m"
        if hours:
            return f"{hours}h"
        return f"{minutes}m"


class StaffActivitySerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.first_name', default='')
    user_email = serializers.CharField(source='user.email', default='')
    user_avatar = serializers.ImageField(source='user.avatar', default=None, allow_null=True)
    performed_by_name = serializers.CharField(source='performed_by.first_name', default=None)
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = StaffActivity
        fields = ['id', 'user', 'user_name', 'user_email', 'user_avatar', 'action', 'action_display', 'description', 'performed_by', 'performed_by_name', 'shift_log', 'order', 'created_at']
        read_only_fields = fields


class AbsenceRequestSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.first_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    employee_id = serializers.CharField(source='user.employee_id', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AbsenceRequest
        fields = [
            'id', 'user', 'user_name', 'user_email', 'employee_id',
            'absence_date', 'reason', 'status', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'status', 'created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.first_name or obj.created_by.email.split('@')[0]


class ShiftAssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.first_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    employee_id = serializers.CharField(source='user.employee_id', read_only=True)
    station_display = serializers.CharField(source='get_station_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ShiftAssignment
        fields = [
            'id', 'user', 'user_name', 'user_email', 'employee_id',
            'shift_date', 'week_start', 'start_time', 'end_time',
            'station', 'station_display', 'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'week_start', 'created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.first_name or obj.created_by.email.split('@')[0]
