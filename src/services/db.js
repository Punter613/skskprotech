const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = url && key ? createClient(url, key) : null;

module.exports = supabase;
