import { useEffect } from 'react';
import { EVENTS } from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';

/** Branche le cycle de vie du socket sur le store global. À monter une fois (App). */
export function useSocket(): void {
  const setConnected = useGameStore((s) => s.setConnected);
  const setRoom = useGameStore((s) => s.setRoom);
  const setResults = useGameStore((s) => s.setResults);
  const setToast = useGameStore((s) => s.setToast);

  useEffect(() => {
    socket.connect();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EVENTS.roomSnapshot, setRoom);
    socket.on(EVENTS.roundResults, setResults);
    socket.on(EVENTS.errorToast, setToast);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EVENTS.roomSnapshot, setRoom);
      socket.off(EVENTS.roundResults, setResults);
      socket.off(EVENTS.errorToast, setToast);
      socket.disconnect();
    };
  }, [setConnected, setRoom, setResults, setToast]);
}
