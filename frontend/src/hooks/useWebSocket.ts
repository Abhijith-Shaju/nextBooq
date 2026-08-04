'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

export function useWebSocket(cafeId: string | undefined) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!cafeId) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
    const socket: Socket = io(socketUrl, {
      withCredentials: true,
      query: { cafeId },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    const handleEvent = () => {
      // Invalidate relevant query caches silently
      queryClient.invalidateQueries({ queryKey: ['reservations', cafeId] });
      queryClient.invalidateQueries({ queryKey: ['tables', cafeId] });
    };

    socket.on('reservation_created', handleEvent);
    socket.on('reservation_updated', handleEvent);
    socket.on('table_status_changed', handleEvent);

    return () => {
      socket.off('reservation_created', handleEvent);
      socket.off('reservation_updated', handleEvent);
      socket.off('table_status_changed', handleEvent);
      socket.disconnect();
    };
  }, [cafeId, queryClient]);

  return { isConnected };
}
