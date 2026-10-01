import { useEffect, useRef } from 'preact/hooks';
import { game } from '../hooks';
import { Panel } from '../Panel';
import { CONFIG } from '../../config';
import { WorldMap } from '../worldMap';
import { BIOMES } from '../../data/biomes';

export function MapPanel() {
  const ref = useRef<HTMLCanvasElement>(null);
  const sim = game.sim!;
  useEffect(() => {
    let raf = 0;
    const W = CONFIG.worldSize;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      const wm = sim.worldMap;
      if (!cv) return;
      const ctx = cv.getContext('2d')!;
      const S = cv.width;
      ctx.fillStyle = '#10202a';
      ctx.fillRect(0, 0, S, S);
      if (wm) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(wm.canvas, 0, 0, S, S);
        if (wm.progress < 1) {
          ctx.fillStyle = '#fff';
          ctx.fillText(`Surveying… ${Math.round(wm.progress * 100)}%`, 10, 20);
        }
      }
      const px = (v: number) => ((v + W / 2) / W) * S;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      for (const b of BIOMES) {
        const visited = game.state!.world.visited.includes(b.id);
        ctx.fillStyle = visited ? '#fff' : 'rgba(255,255,255,0.45)';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        const t = visited ? b.name : '???';
        ctx.strokeText(t, px(b.center[0]), px(b.center[1]));
        ctx.fillText(t, px(b.center[0]), px(b.center[1]));
      }
      for (const st of sim.fastTravel?.stations() ?? []) {
        ctx.fillStyle = st.unlocked ? '#ffd84a' : '#777';
        ctx.beginPath();
        ctx.arc(px(st.x), px(st.z), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = '#ff3a3a';
      ctx.beginPath();
      ctx.arc(px(sim.player.x), px(sim.player.z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  const click = (e: MouseEvent) => {
    const cv = ref.current!;
    const r = cv.getBoundingClientRect();
    const W = CONFIG.worldSize;
    const x = ((e.clientX - r.left) / r.width) * W - W / 2;
    const z = ((e.clientY - r.top) / r.height) * W - W / 2;
    const ft = sim.fastTravel;
    if (ft) {
      const st = ft.nearestStation(x, z, 90);
      if (st) ft.travel(st.id);
    }
  };
  return (
    <Panel title="World Map" wide>
      <div class="body" style="display:flex;justify-content:center">
        <canvas
          ref={ref}
          width={720}
          height={720}
          style="max-width:100%;max-height:70vh;aspect-ratio:1;border-radius:8px;border:2px solid var(--bark-3);cursor:pointer"
          onClick={click}
        />
      </div>
      <div style="padding:0 16px 12px;font-size:0.85rem;color:var(--parch-dim)">
        Click an unlocked fast-travel station (yellow) to travel (costs money). Dashed line = railway.
      </div>
    </Panel>
  );
}
void WorldMap;
