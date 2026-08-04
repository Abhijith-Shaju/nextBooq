'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useSlugCheck(slug: string) {
  const [debouncedSlug, setDebouncedSlug] = useState(slug);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSlug(slug.trim().toLowerCase());
    }, 400);

    return () => clearTimeout(handler);
  }, [slug]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['check-slug', debouncedSlug],
    queryFn: async () => {
      if (!debouncedSlug || debouncedSlug.length < 3) {
        return { isAvailable: false, reason: 'Too short' };
      }
      try {
        const response = await apiClient(`/onboarding/check-slug?slug=${debouncedSlug}`);
        return response;
      } catch (err: any) {
        if (err?.status === 409) {
          return { isAvailable: false, reason: 'Slug already taken' };
        }
        return { isAvailable: true };
      }
    },
    enabled: debouncedSlug.length >= 3,
    staleTime: 1000 * 60,
  });

  return {
    isChecking: isLoading,
    isAvailable: data?.isAvailable ?? false,
    reason: data?.reason,
    debouncedSlug,
  };
}
