import { useEffect } from 'react';
import {
  EVENTS,
  type CoHider,
  type ProgressUpdate,
  type RoomSnapshot,
  type SeekerTarget,
  type UnlockedArtwork,
} from '@mimic/shared';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';

/** Branche le cycle de vie du socket sur le store global. À monter une fois (App). */
export function useSocket(): void {
  const setConnected = useGameStore((s) => s.setConnected);
  const setPlayerId = useGameStore((s) => s.setPlayerId);
  const setRoom = useGameStore((s) => s.setRoom);
  const setResults = useGameStore((s) => s.setResults);
  const setToast = useGameStore((s) => s.setToast);

  useEffect(() => {
    socket.connect();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSession = (data: { playerId: string }) => setPlayerId(data.playerId);
    const onProgress = (p: ProgressUpdate) => {
      const auth = useAuthStore.getState();
      if (auth.user) auth.setUser({ ...auth.user, xp: p.xp, level: p.level });
      setToast(p.leveledUp ? `🎉 Niveau ${p.level} atteint ! +${p.gained} XP` : `+${p.gained} XP`);
    };
    const onGalleryUnlocked = ({ artworks }: { artworks: UnlockedArtwork[] }) => {
      if (artworks.length === 0) return;
      setToast(
        artworks.length === 1
          ? `🖼️ Nouvelle œuvre dans ta galerie : ${artworks[0]!.title}`
          : `🖼️ ${artworks.length} nouvelles œuvres dans ta galerie !`,
      );
    };
    // Cibles du chercheur : listener persistant (l'event précède le montage de la vue).
    const onTargets = (targets: SeekerTarget[]) =>
      useGameStore.getState().setSeekerTargets(targets);
    const onCoHiders = (hiders: CoHider[]) => useGameStore.getState().setCoHiders(hiders);
    const onCursor = (c: { x: number; y: number }) => useGameStore.getState().setSeekerCursor(c);
    const onRoom = (snap: RoomSnapshot) => {
      setRoom(snap);
      if (snap.phase !== 'seeking') {
        useGameStore.getState().setSeekerTargets([]);
        useGameStore.getState().setCoHiders([]);
        useGameStore.getState().setSeekerCursor(null);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EVENTS.session, onSession);
    socket.on(EVENTS.progress, onProgress);
    socket.on(EVENTS.galleryUnlocked, onGalleryUnlocked);
    socket.on(EVENTS.seekingTargets, onTargets);
    socket.on(EVENTS.seekingCohiders, onCoHiders);
    socket.on(EVENTS.seekerCursor, onCursor);
    socket.on(EVENTS.roomSnapshot, onRoom);
    socket.on(EVENTS.roundResults, setResults);
    socket.on(EVENTS.errorToast, setToast);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EVENTS.session, onSession);
      socket.off(EVENTS.progress, onProgress);
      socket.off(EVENTS.galleryUnlocked, onGalleryUnlocked);
      socket.off(EVENTS.seekingTargets, onTargets);
      socket.off(EVENTS.seekingCohiders, onCoHiders);
      socket.off(EVENTS.seekerCursor, onCursor);
      socket.off(EVENTS.roomSnapshot, onRoom);
      socket.off(EVENTS.roundResults, setResults);
      socket.off(EVENTS.errorToast, setToast);
      socket.disconnect();
    };
  }, [setConnected, setPlayerId, setRoom, setResults, setToast]);
}
