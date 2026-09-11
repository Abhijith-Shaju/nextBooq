import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/hooks/api/axios-instance';
import axios from 'axios';

/**
 * Checks whether a cafe slug is already taken.
 *
 * - Returns `'available'` when the backend 404s (slug is free).
 * - Returns `'taken'`     when the backend 200s (slug is in use).
 * - Returns `'checking'`  while the request is in flight.
 * - Returns `'idle'`      when the slug is blank or too short to bother checking.
 *
 * Callers are responsible for debouncing the slug value they pass in — the
 * hook fires a real request on every distinct non-empty slug it receives.
 */
export type SlugAvailability = 'idle' | 'checking' | 'available' | 'taken';

const MIN_SLUG_LENGTH = 3;

export function useSlugAvailability(slug: string): SlugAvailability {
  const trimmed = slug.trim().toLowerCase();
  const enabled = trimmed.length >= MIN_SLUG_LENGTH;

  const query = useQuery({
    queryKey: ['slug-availability', trimmed],
    queryFn: async () => {
      try {
        await axiosInstance.get(`/api/v1/cafes/slug/${encodeURIComponent(trimmed)}`);
        // 2xx → slug exists → taken
        return 'taken' as const;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return 'available' as const;
        }
        // Any other error (network, 5xx) — don't block the user; treat as
        // available so the form stays usable. The backend will catch conflicts
        // at submission time anyway.
        return 'available' as const;
      }
    },
    enabled,
    // Cache the result for 30 s — slugs don't change that fast, and this
    // prevents hammering the public endpoint on every keystroke.
    staleTime: 30 * 1000,
    retry: false,
  });

  if (!enabled) return 'idle';
  if (query.isFetching) return 'checking';
  if (query.data === 'taken') return 'taken';
  if (query.data === 'available') return 'available';
  // Initial load before first fetch completes
  return 'checking';
}
