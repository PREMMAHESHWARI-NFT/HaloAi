import { useEffect, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export function useAuth() {
    const { ready, authenticated, user, login, logout } = usePrivy();

    const userId = useMemo(() => user?.id ?? null, [user]);

    useEffect(() => {
        if (ready && authenticated && userId) {
            window.electronAPI?.setAuthToken(userId);
        }
    }, [ready, authenticated, userId]);

    return { ready, authenticated, userId, login, logout };
}
