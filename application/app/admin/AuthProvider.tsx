import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  /**
   * The admin's own name, as they entered it when accepting their invite.
   * Null only for an admin who predates the name field and hasn't set one —
   * every display falls back to their email in that case.
   */
  adminName: string | null;
  isLoading: boolean;
  setAdminName: (name: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

type AdminIdentity = { isAdmin: boolean; fullName: string | null };

async function fetchAdminIdentity(userId: string): Promise<AdminIdentity> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to check admin status", error);
    return { isAdmin: false, fullName: null };
  }
  return { isAdmin: data !== null, fullName: data?.full_name ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let initialResolved = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        const identity = await fetchAdminIdentity(data.session.user.id);
        if (!cancelled) {
          setIsAdmin(identity.isAdmin);
          setAdminName(identity.fullName);
        }
      }
      if (!cancelled) {
        setIsLoading(false);
        initialResolved = true;
      }
    });

    // Supabase's SDK fires this on far more than sign-in/sign-out — it also
    // silently re-fires on background token refresh and on tab-visibility
    // re-validation. Only a genuine identity change (sign-in, sign-out, or
    // switching accounts) should gate rendering; a same-user re-fire must
    // just refresh the session reference, or every idle tab-refocus would
    // unmount the whole admin tree (and any in-progress form with it).
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession((prevSession) => {
        const identityChanged = (prevSession?.user.id ?? null) !== (nextSession?.user.id ?? null);
        if (identityChanged && initialResolved) {
          setIsLoading(true);
          if (nextSession) {
            fetchAdminIdentity(nextSession.user.id).then((identity) => {
              if (!cancelled) {
                setIsAdmin(identity.isAdmin);
                setAdminName(identity.fullName);
                setIsLoading(false);
              }
            });
          } else {
            setIsAdmin(false);
            setAdminName(null);
            setIsLoading(false);
          }
        }
        return nextSession;
      });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, isAdmin, adminName, isLoading, setAdminName, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
