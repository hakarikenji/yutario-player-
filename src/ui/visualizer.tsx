/**
 * Visualizer — high-performance canvas rendering driven by the engine
 * analyser. Bars, wave, and "aura" modes; degrades to idle animation
 * when the graph is not yet live.
 */
import { useEffect, useRef } from "react";
import { audioEngine } from "../audio/engine";
import { cn } from "../lib/utils";

interface VisualizerProps {
  mode?: "bars" | "wave" | "aura";
  className?: string;
  barCount?: number;
  color?: string;
  colorDim?: string;
}

export function Visualizer({ mode = "bars", className, barCount = 48, color = "#A855F7", colorDim = "rgba(168,85,247,0.25)" }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const freq = new Uint8Array(256);
    const wave = new Uint8Array(512);
    let idlePhase = 0;

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, w, h);

      const live = audioEngine.getSpectrum(freq);
      audioEngine.getWaveform(wave);
      idlePhase += 0.03;

      if (mode === "bars") {
        const bars = Math.min(barCount, freq.length);
        const bw = w / bars;
        for (let i = 0; i < bars; i++) {
          const v = live ? freq[Math.floor((i / bars) * (freq.length * 0.72))] / 255 : 0;
          const idle = live ? 0 : 0.06 + 0.05 * Math.sin(idlePhase + i * 0.35);
          const bh = Math.max(2, (v + idle) * h * 0.92);
          const x = i * bw;
          const grad = ctx2d.createLinearGradient(0, h - bh, 0, h);
          grad.addColorStop(0, color);
          grad.addColorStop(1, colorDim);
          ctx2d.fillStyle = grad;
          const r = Math.min(2.5, bw / 3);
          ctx2d.beginPath();
          ctx2d.roundRect(x + bw * 0.15, h - bh, bw * 0.7, bh, r);
          ctx2d.fill();
        }
      } else if (mode === "wave") {
        ctx2d.lineWidth = 2;
        const grad = ctx2d.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, colorDim);
        grad.addColorStop(0.5, color);
        grad.addColorStop(1, colorDim);
        ctx2d.strokeStyle = grad;
        ctx2d.beginPath();
        const mid = h / 2;
        for (let x = 0; x < w; x++) {
          const idx = Math.floor((x / w) * wave.length);
          const v = live ? (wave[idx] - 128) / 128 : Math.sin(x * 0.02 + idlePhase) * 0.18;
          const y = mid + v * h * 0.42;
          if (x === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.stroke();
      } else {
        // aura: mirrored bars + glow center
        const bars = Math.min(barCount, 40);
        const bw = w / bars;
        const mid = h / 2;
        for (let i = 0; i < bars; i++) {
          const v = live ? freq[Math.floor((i / bars) * (freq.length * 0.7))] / 255 : 0.05 + 0.04 * Math.sin(idlePhase + i * 0.4);
          const bh = Math.max(2, v * h * 0.45);
          const x = i * bw + bw * 0.18;
          ctx2d.fillStyle = color;
          ctx2d.globalAlpha = 0.85;
          ctx2d.beginPath();
          ctx2d.roundRect(x, mid - bh, bw * 0.64, bh, 2);
          ctx2d.roundRect(x, mid, bw * 0.64, bh, 2);
          ctx2d.fill();
        }
        ctx2d.globalAlpha = 1;
      }

      raf.current = requestAnimationFrame(draw);
    };

    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [mode, barCount, color, colorDim]);

  return <canvas ref={canvasRef} className={cn("h-16 w-full", className)} aria-hidden />;
}
