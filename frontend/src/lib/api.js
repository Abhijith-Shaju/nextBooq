const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function fetchAPI(endpoint, options = {}) {
  const { headers, ...rest } = options;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...rest,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'API request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Authentication API
export const apiLogin = (email, password) =>
  fetchAPI('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const apiRegister = (name, email, phone, password) =>
  fetchAPI('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, phone, password }),
  });

// Cafe Public API
export const apiGetCafeBySlug = (slug) => fetchAPI(`/cafes/slug/${slug}`);

export const apiGetAvailableSlots = (cafeId, date, time, partySize, durationMinutes = 90) => {
  const query = new URLSearchParams({
    date,
    time,
    partySize,
    durationMinutes,
  }).toString();
  return fetchAPI(`/cafes/${cafeId}/available-slots?${query}`);
};

export const apiCreateReservation = (cafeId, bookingData, token) =>
  fetchAPI(`/cafes/${cafeId}/reservations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(bookingData),
  });

// Host Stand / Dashboard API
export const apiGetDailyManifest = (cafeId, token, date = null) => {
  const query = date ? `?date=${date}` : '';
  return fetchAPI(`/cafes/${cafeId}/reservations${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const apiUpdateReservationStatus = (cafeId, resId, status, version, token) =>
  fetchAPI(`/cafes/${cafeId}/reservations/${resId}/status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, version }),
  });

// Table Management API
export const apiGetTables = (cafeId, token) =>
  fetchAPI(`/cafes/${cafeId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const apiCreateTable = (cafeId, tableData, token) =>
  fetchAPI(`/cafes/${cafeId}/tables`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(tableData),
  });

export const apiUpdateTable = (cafeId, tableId, tableData, token) =>
  fetchAPI(`/cafes/${cafeId}/tables/${tableId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(tableData),
  });

// Webhook simulator for local testing
export const apiSimulateWebhook = (orderId) =>
  fetchAPI('/webhooks/razorpay', {
    method: 'POST',
    body: JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_sim_${Date.now()}`,
            order_id: orderId,
            status: 'captured',
          },
        },
      },
    }),
  });

// Admin Cafe Seeder for Quickstart
export const apiCreateCafe = (cafeData, token) =>
  fetchAPI('/cafes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(cafeData),
  });
