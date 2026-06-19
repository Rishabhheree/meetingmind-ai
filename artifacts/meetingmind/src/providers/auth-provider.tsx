import { createContext, useContext, useEffect, useState } from 'react';
import { signInUser, createUser, getProfileById, type ProfileRecord } from '@/lib/db';

const SESSION_KEY = 'meetingmind_user_id';

interface AuthContextType {
  user: ProfileRecord | null;
  profile: ProfileRecord | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem(SESSION_KEY);
    if (storedId) {
      getProfileById(storedId).then((profile) => {
        setUser(profile || null);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  async function signIn(email: string, password: string) {
    const profile = await signInUser(email, password);
    localStorage.setItem(SESSION_KEY, profile.id);
    setUser(profile);
  }

  async function signUp(email: string, password: string, name: string) {
    const profile = await createUser({ email, password, name });
    localStorage.setItem(SESSION_KEY, profile.id);
    setUser(profile);
  }

  async function signOut() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile: user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
