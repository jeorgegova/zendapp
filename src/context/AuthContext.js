import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId, accessToken) => {
    try {
      const response = await fetch(
        'https://gwpwntdwogxzmtegaaom.supabase.co/functions/v1/get-user-profile',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id: userId }),
        },
      );
      if (!response.ok) return null;
      const result = await response.json();
      return result.profile || null;
    } catch {
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      const p = await fetchProfile(data.session.user.id, data.session.access_token);
      setProfile(p);
    }
  }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      if (data.session?.user) {
        const p = await fetchProfile(data.session.user.id, data.session.access_token);
        setProfile(p);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const p = await fetchProfile(newSession.user.id, newSession.access_token);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = {
    session,
    profile,
    rol: profile?.rol || null,
    userId: session?.user?.id || null,
    accessToken: session?.access_token || null,
    loading,
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
