// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gwpwntdwogxzmtegaaom.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3cHdudGR3b2d4em10ZWdhYW9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2NzAyMjAsImV4cCI6MjA2MDI0NjIyMH0.kN83W-jHuNS6GX7kYCaBxx-1k3X964rkhdKAGaza8G4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    },
    global: {
      // 👇 Esto evita que cargue realtime-js y WebSocket en React Native
      fetch: fetch,
    },
    realtime: {
        enabled: false,
    }
  })