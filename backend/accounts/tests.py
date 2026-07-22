from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import CustomUser, Order


class CartApiTests(APITestCase):
    def setUp(self):
        self.user_email = 'cart-user@test.com'
        self.user = CustomUser.objects.create_user(
            username=self.user_email,
            email=self.user_email,
            password='test-password-123',
            first_name='Cart',
        )
        self.cart_url = '/api/auth/cart/'
        self.orders_url = '/api/auth/orders/'
        self.client.force_authenticate(user=self.user)

    def test_cart_can_be_saved_and_fetched(self):
        payload = {
            'email': self.user_email,
            'items': [
                {'name': 'Chocolate Milk', 'quantity': 2, 'price': '149.00'},
                {'name': 'Cookies & Cream', 'quantity': 1, 'price': '159.00'},
            ],
        }

        save_response = self.client.put(self.cart_url, payload, format='json')
        self.assertEqual(save_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(save_response.data['items']), 2)
        self.assertEqual(save_response.data['total_items'], 3)

        get_response = self.client.get(self.cart_url)
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(get_response.data['items']), 2)
        self.assertEqual(get_response.data['total_items'], 3)
        self.assertEqual(str(get_response.data['total_price']), '457.00')

    def test_cart_can_be_cleared(self):
        self.client.put(
            self.cart_url,
            {
                'email': self.user_email,
                'items': [{'name': 'Vanilla Milkshake', 'quantity': 1, 'price': '149.00'}],
            },
            format='json',
        )

        clear_response = self.client.delete(self.cart_url, format='json')
        self.assertEqual(clear_response.status_code, status.HTTP_200_OK)

        get_response = self.client.get(self.cart_url)
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data['items'], [])
        self.assertEqual(get_response.data['total_items'], 0)

    def test_order_create_returns_order_token(self):
        order_response = self.client.post(
            self.orders_url,
            {
                'email': self.user_email,
                'total_price': '298.00',
                'items': [
                    {'name': 'Chocolate Milk', 'quantity': 1, 'price': '149.00'},
                    {'name': 'Strawberry Milk', 'quantity': 1, 'price': '149.00'},
                ],
            },
            format='json',
        )
        self.assertEqual(order_response.status_code, status.HTTP_201_CREATED)
        self.assertIn('order_token', order_response.data)
        self.assertTrue(order_response.data['order_token'])

    def test_order_saves_dine_in_metadata(self):
        order_response = self.client.post(
            self.orders_url,
            {
                'email': self.user_email,
                'total_price': '149.00',
                'order_type': 'Dine-In',
                'table_number': '5',
                'customer_name': 'Walk In Guest',
                'items': [
                    {'name': 'Chocolate Milk', 'quantity': 1, 'price': '149.00'},
                ],
            },
            format='json',
        )

        self.assertEqual(order_response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(id=order_response.data['order_id'])
        self.assertEqual(order.order_type, 'dine_in')
        self.assertEqual(order.table_number, '5')
        self.assertEqual(order.customer_name, 'Walk In Guest')

    def test_cannot_cancel_another_users_order_via_email_spoof(self):
        order_response = self.client.post(
            self.orders_url,
            {
                'email': self.user_email,
                'total_price': '149.00',
                'items': [{'name': 'Chocolate Milk', 'quantity': 1, 'price': '149.00'}],
            },
            format='json',
        )
        order_id = order_response.data['order_id']
        attacker = CustomUser.objects.create_user(
            username='attacker@test.com',
            email='attacker@test.com',
            password='test-password-123',
        )
        self.client.force_authenticate(user=attacker)
        cancel = self.client.post(
            f'/api/auth/orders/{order_id}/cancel/',
            {'email': self.user_email, 'cancel_reason': 'Changed mind'},
            format='json',
        )
        self.assertEqual(cancel.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Order.objects.get(id=order_id).status, 'pending')

    def test_customer_cannot_self_mark_payment_paid(self):
        order_response = self.client.post(
            self.orders_url,
            {
                'email': self.user_email,
                'total_price': '149.00',
                'items': [{'name': 'Chocolate Milk', 'quantity': 1, 'price': '149.00'}],
            },
            format='json',
        )
        order_id = order_response.data['order_id']
        pay = self.client.patch(
            f'/api/auth/orders/{order_id}/payment/',
            {'payment_method': 'gcash', 'payment_status': 'paid'},
            format='json',
        )
        self.assertEqual(pay.status_code, status.HTTP_200_OK)
        self.assertEqual(pay.data['payment_status'], 'unpaid')
        self.assertEqual(pay.data['payment_method'], 'gcash')


class SmartEtaApiTests(APITestCase):
    def setUp(self):
        self.user_email = 'eta-user@test.com'
        CustomUser.objects.create_user(
            username=self.user_email,
            email=self.user_email,
            password='test-password-123',
            first_name='Eta',
        )
        self.orders_url = '/api/auth/orders/'

    def _create_order(self, email=None):
        payload = {
            'email': email or self.user_email,
            'total_price': '149.00',
            'items': [
                {'name': 'Chocolate Milk', 'quantity': 1, 'price': '149.00'},
            ],
        }
        return self.client.post(self.orders_url, payload, format='json')

    def test_order_create_returns_smart_eta(self):
        response = self._create_order()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('eta', response.data)
        self.assertIn('eta_label', response.data['eta'])
        self.assertGreater(response.data['eta']['eta_seconds'], 0)

    def test_order_detail_includes_smart_eta(self):
        create_response = self._create_order()
        order_id = create_response.data['order_id']
        detail_response = self.client.get(f'/api/auth/orders/{order_id}/')
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertIn('eta', detail_response.data)
        self.assertEqual(detail_response.data['eta']['status'], 'pending')

    def test_order_eta_endpoint(self):
        create_response = self._create_order()
        order_id = create_response.data['order_id']
        eta_response = self.client.get(f'/api/auth/orders/{order_id}/eta/')
        self.assertEqual(eta_response.status_code, status.HTTP_200_OK)
        self.assertEqual(eta_response.data['status'], 'pending')
        self.assertIn('message', eta_response.data)

    def test_eta_preview_endpoint(self):
        preview_response = self.client.get('/api/auth/eta/preview/?item_count=2')
        self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_response.data['status'], 'preview')
        self.assertGreaterEqual(preview_response.data['item_units'], 1)

    def test_queue_ahead_increases_eta(self):
        first = self._create_order()
        second = self._create_order()
        first_eta = first.data['eta']['eta_seconds']
        second_eta = second.data['eta']['eta_seconds']
        self.assertGreaterEqual(second_eta, first_eta)
        self.assertEqual(second.data['eta']['queue_ahead'], 1)
        self.assertEqual(first.data['eta']['queue_position'], 1)
        self.assertEqual(second.data['eta']['queue_position'], 2)
        self.assertIn('in line', second.data['eta']['message'].lower())

    def test_eta_includes_queue_position_fields(self):
        response = self._create_order()
        eta = response.data['eta']
        self.assertIn('queue_position', eta)
        self.assertIn('queue_ahead', eta)
        self.assertEqual(eta['queue_position'], eta['queue_ahead'] + 1)


class SqlInjectionDefenseTests(APITestCase):
    """Parameterized queries + input validation must reject classic SQLi probes."""

    def setUp(self):
        self.user_email = 'safe-user@test.com'
        CustomUser.objects.create_user(
            username=self.user_email,
            email=self.user_email,
            password='test-password-123',
            first_name='Safe',
        )

    def test_order_list_rejects_sql_injection_email(self):
        payloads = [
            "'; OR 1=1 --@test.com",
            "admin'--@x.com",
            "1; DROP TABLE accounts_order;--@x.com",
            "a@b.com' UNION SELECT * FROM accounts_customuser--",
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                res = self.client.get('/api/auth/orders/', {'email': payload})
                # Unauthenticated list is blocked (401); email spoofing never reaches the ORM.
                self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_400_BAD_REQUEST))
                self.assertEqual(CustomUser.objects.count(), 1)

    def test_login_rejects_sql_injection_email(self):
        res = self.client.post(
            '/api/auth/jwt/login/',
            {'email': "' OR '1'='1", 'password': 'x'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_null_byte_query_rejected(self):
        res = self.client.get('/api/auth/orders/?email=safe-user%00@test.com')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_orm_lookup_treats_injection_as_literal_email(self):
        """Even if validation were bypassed, ORM would still bind as a parameter."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        evil = "nobody' OR '1'='1"
        with CaptureQueriesContext(connection) as ctx:
            list(CustomUser.objects.filter(email=evil))
        self.assertTrue(ctx.captured_queries)
        sql = ctx.captured_queries[-1]['sql']
        # Parameterized — payload is not concatenated as executable SQL keywords.
        self.assertIn('WHERE', sql.upper())
        self.assertNotIn("OR '1'='1", sql)

    def test_execute_parameterized_requires_bound_params(self):
        from django.db import connection
        from .sql_safety import execute_parameterized, UnsafeSQLError

        with connection.cursor() as cursor:
            execute_parameterized(
                cursor,
                'SELECT COUNT(*) FROM accounts_customuser WHERE email = %s',
                [self.user_email],
            )
            self.assertEqual(cursor.fetchone()[0], 1)

            with self.assertRaises(UnsafeSQLError):
                execute_parameterized(cursor, '', [])

