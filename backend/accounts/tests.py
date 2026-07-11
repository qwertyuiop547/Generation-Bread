from rest_framework import status
from rest_framework.test import APITestCase

from .models import CustomUser


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

        get_response = self.client.get(self.cart_url, {'email': self.user_email})
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

        clear_response = self.client.delete(self.cart_url, {'email': self.user_email}, format='json')
        self.assertEqual(clear_response.status_code, status.HTTP_200_OK)

        get_response = self.client.get(self.cart_url, {'email': self.user_email})
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data['items'], [])
        self.assertEqual(get_response.data['total_items'], 0)

    def test_cart_is_cleared_after_successful_order(self):
        self.client.put(
            self.cart_url,
            {
                'email': self.user_email,
                'items': [
                    {'name': 'Chocolate Milk', 'quantity': 1, 'price': '149.00'},
                    {'name': 'Strawberry Milk', 'quantity': 1, 'price': '149.00'},
                ],
            },
            format='json',
        )

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

        cart_response = self.client.get(self.cart_url, {'email': self.user_email})
        self.assertEqual(cart_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cart_response.data['items'], [])
        self.assertEqual(cart_response.data['total_items'], 0)

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
        self.assertEqual(order_response.data['order_type'], 'dine_in')
        self.assertEqual(order_response.data['table_number'], '5')
        self.assertEqual(order_response.data['customer_name'], 'Walk In Guest')


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
