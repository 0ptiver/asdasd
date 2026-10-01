import { useEffect, useRef } from 'preact/hooks';
import { game } from './hooks';
import { CONFIG } from '../config';

/** Circular minimap: crop of the pre-rendered world map, rotating with the camera, plus compass. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      const sim = game.sim;
      const wm = sim?.worldMap;
      if (!cv || !sim) return;
      const ctx = cv.getContext('2d')!;
      const S = cv.width;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#10202a';
      ctx.fillRect(0, 0, S, S);
      const p = sim.player;
      const W = CONFIG.worldSize;
      const view = 420; // world units across
      const scale = S / view;
      if (wm) {
        ctx.translate(S / 2, S / 2);
        ctx.rotate(p.camYaw);
        ctx.imageSmoothingEnabled = false;
        const mapPx = wm.canvas.width;
        const k = (W / mapPx) * scale; // canvas px per map px
        ctx.drawImage(
          wm.canvas,
          -((p.x + W / 2) / W) * mapPx * k,
          -((p.z + W / 2) / W) * mapPx * k,
          mapPx * k,
          mapPx * k,
        );
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.restore();
      // player arrow (always up)
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(p.yaw - p.camYaw + Math.PI);
      ctx.fillStyle = '#ffd84a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // compass N marker
      const nx = S / 2 + Math.sin(p.camYaw) * (S / 2 - 12) * -1;
      const ny = S / 2 - Math.cos(p.camYaw) * (S / 2 - 12);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', nx, ny);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      class="minimap clickable"
      width={160}
      height={160}
      onClick={() => game.openPanel('map')}
    />
  );
}
