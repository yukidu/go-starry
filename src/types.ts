export interface Env {
  DB: D1Database;
  STARRY_ID_DB: D1Database;
  IP_HASH_SALT?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
}

export interface ShortLink {
  id: string;
  owner_user_id: string;
  slug: string;
  destination_url: string;
  title: string | null;
  note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  redirect_type: number;
  click_count: number;
  last_clicked_at: string | null;
}
