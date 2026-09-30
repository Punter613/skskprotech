'use strict';

const { createClient } = require('@supabase/supabase-js');

let authClient;

function configured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function client() {
  if (!configured()) return null;
  if (!authClient) {
    authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return authClient;
}

function shopIdFromUser(user) {
  const app = user?.app_metadata || {};
  const value = app.shop_id || app.tenant_id || '';
  return String(value).trim();
}

async function verifySupabaseAccessToken(token) {
  const supabase = client();
  if (!supabase || !token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;

  const shopId = shopIdFromUser(data.user);
  if (!shopId) {
    const error = new Error('Authenticated user is not assigned to a shop');
    error.code = 'SHOP_MEMBERSHIP_REQUIRED';
    throw error;
  }

  return {
    type: 'supabase_user',
    id: `user_${data.user.id}`,
    userId: data.user.id,
    shopId
  };
}

function resetAuthClientForTests() {
  authClient = undefined;
}

module.exports = { configured, verifySupabaseAccessToken, shopIdFromUser, resetAuthClientForTests };
