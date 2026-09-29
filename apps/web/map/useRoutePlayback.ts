import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoutePiece } from './model';

export type PlaybackPhase = 'idle' | 'drawing' | 'transition' | 'arrived';

/**
 * Drives progressive route drawing. `progressRef.current` runs from 0 to pieces.length:
 * floor pieces draw at walking-proportional speed; before each vertical piece the animation
 * pauses on a transition phase so the UI can announce "Take the escalator to Level 1".
 * Renderers read the ref every frame, so playback never re-renders React per frame.
 */
export function useRoutePlayback(
  pieces: RoutePiece[],
  options: { reducedMotion: boolean; key: string },
) {
  const progressRef = useRef(0);
  const [pieceIndex, setPieceIndex] = useState(0);
  const [phase, setPhase] = useState<PlaybackPhase>('idle');
  const frame = useRef<number | null>(null);
  const run = useRef(0);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const play = useCallback(() => {
    stop();
    run.current += 1;
    const token = run.current;
    if (!pieces.length) {
      progressRef.current = 0;
      setPhase('idle');
      return;
    }
    if (options.reducedMotion) {
      progressRef.current = pieces.length;
      setPieceIndex(pieces.length - 1);
      setPhase('arrived');
      return;
    }
    progressRef.current = 0;
    let index = 0;
    let started = performance.now();
    let pausing = false;
    const durationOf = (piece: RoutePiece) =>
      piece.kind === 'floor' ? Math.min(3400, Math.max(1100, (piece.length / 38) * 1000)) : 1300;
    setPieceIndex(0);
    setPhase(pieces[0].kind === 'vertical' ? 'transition' : 'drawing');
    if (pieces[0].kind === 'vertical') pausing = true;

    const tick = (now: number) => {
      if (token !== run.current) return;
      const piece = pieces[index];
      if (pausing) {
        if (now - started >= 1500) {
          pausing = false;
          started = now;
        }
        frame.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - started) / durationOf(piece));
      const eased = piece.kind === 'floor' ? 1 - Math.pow(1 - t, 2.2) : t;
      progressRef.current = index + eased;
      if (t >= 1) {
        index += 1;
        started = now;
        if (index >= pieces.length) {
          progressRef.current = pieces.length;
          setPhase('arrived');
          frame.current = null;
          return;
        }
        setPieceIndex(index);
        if (pieces[index].kind === 'vertical') {
          pausing = true;
          setPhase('transition');
        } else {
          setPhase('drawing');
        }
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [pieces, options.reducedMotion]);

  const skip = useCallback(() => {
    stop();
    run.current += 1;
    progressRef.current = pieces.length;
    setPieceIndex(Math.max(0, pieces.length - 1));
    setPhase(pieces.length ? 'arrived' : 'idle');
  }, [pieces]);

  useEffect(() => {
    play();
    return stop;
    // Replay whenever the route itself changes (e.g. accessible toggle or a closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.key, pieces.length]);

  return { progressRef, pieceIndex, phase, replay: play, skip, piece: pieces[pieceIndex] ?? null };
}
