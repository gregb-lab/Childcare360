/**
 * ParentStoryPlayer.jsx
 * Lightweight story player for the parent portal — shows published weekly stories
 * for their child. Embeds the StoryPlayer in a simple card list.
 *
 * Usage in ParentPortalModule.jsx:
 *   import ParentStoryPlayer from './ParentStoryPlayer.jsx';
 *   <ParentStoryPlayer childId={child.id} childName={child.first_name} />
 */
import { useState, useEffect, useRef } from "react";

const API = (path, opts = {}) => {
  const t = localStorage.getItem("c360_token"), tid = localStorage.getItem("c360_tenant");
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(tid ? { "x-tenant-id": tid } : {}) },
    method: opts.method || "GET", ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  }).then(r => r.json());
};

const DARK = "#3D3248", MUTED = "#8A7F96", P = "#7C3AED";

function MiniPlayer({ story, onClose }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const animRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const startTime = useRef(null);
  const images = useRef([]);
  const DURATION = 22000;
  const photos = story.photo_urls || [];

  useEffect(() => {
    const placeholders = [
      "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600",
      "https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=600",
    ];
    const urls = photos.length ? photos : placeholders;
    images.current = urls.map(url => { const img = new Image(); img.crossOrigin = "anonymous"; img.src = url; return img; });
    return () => { cancelAnimationFrame(animRef.current); if (window.speechSynthesis) window.speechSynthesis.cancel(); if (audioRef.current) audioRef.current.pause(); };
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const elapsed = startTime.current ? Date.now() - startTime.current : 0;
    const t = Math.min(elapsed / DURATION, 1);

    const urls = photos.length ? photos : [""];
    const idx = Math.min(Math.floor(t * urls.length), urls.length - 1);
    const img = images.current[idx];
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#2D1B69"); grad.addColorStop(1, "#4C1D95");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    if (img?.complete && img.naturalWidth) {
      const scale = 1 + ((t * urls.length) % 1) * 0.07;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const aspect = iw / ih, ca = W / H;
      let sw, sh, sx, sy;
      if (aspect > ca) { sh = ih; sw = ih * ca; sx = (iw - sw) / 2; sy = 0; }
      else { sw = iw; sh = iw / ca; sx = 0; sy = (ih - sh) / 2; }
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -H / 2);
      ctx.globalAlpha = 0.82; ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      ctx.restore();
    }

    const ov = ctx.createLinearGradient(0, H * 0.5, 0, H);
    ov.addColorStop(0, "rgba(0,0,0,0)"); ov.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = ov; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = "#A78BFA"; ctx.fillRect(0, H - 3, W * t, 3);

    ctx.fillStyle = "rgba(124,58,237,0.85)"; ctx.roundRect?.(10, 10, 110, 20, 5) || (() => { ctx.beginPath(); ctx.rect(10, 10, 110, 20); })(); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "left"; ctx.fillText("✨ Week Story", 17, 23);

    if (t >= 1) {
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px Georgia,serif"; ctx.textAlign = "center";
      ctx.fillText("💛", W / 2, H / 2 - 10); ctx.font = "bold 13px system-ui"; ctx.fillText("Until next week!", W / 2, H / 2 + 14);
      cancelAnimationFrame(animRef.current); setPlaying(false); setDone(true); return;
    }
    animRef.current = requestAnimationFrame(draw);
  };

  const play = () => {
    setDone(false); setPlaying(true); startTime.current = Date.now();
    if (audioRef.current) { audioRef.current.volume = 0.3; audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(story.script);
      u.rate = 0.88; u.pitch = 1.05; u.lang = "en-AU";
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find(v => v.lang?.startsWith("en") && (v.name.includes("Karen") || v.name.includes("Samantha") || v.name.includes("Moira")));
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    }
    animRef.current = requestAnimationFrame(draw);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
      <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}>
        <canvas ref={canvasRef} width={340} height={604} style={{ display: "block", borderRadius: 20 }} />
        {!playing && !done && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.32)" }}>
            <button onClick={play} style={{ width: 68, height: 68, borderRadius: "50%", background: "rgba(255,255,255,0.95)", border: "none", cursor: "pointer", fontSize: 26 }}>▶</button>
          </div>
        )}
        {done && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={play} style={{ padding: "12px 28px", borderRadius: 30, background: P, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>↺ Watch Again</button>
          </div>
        )}
      </div>
      {story.music_track_url && <audio ref={audioRef} src={story.music_track_url} loop preload="auto" />}
      <div style={{ marginTop: 18, textAlign: "center" }}>
        <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Week of {story.week_start}</div>
        <button onClick={onClose} style={{ color: "rgba(255,255,255,0.55)", background: "none", border: "none", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>Close</button>
      </div>
    </div>
  );
}

export default function ParentStoryPlayer({ childId, childName }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    if (!childId) return;
    API(`/api/stories/parent/${childId}`)
      .then(r => setStories(r.stories || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  if (loading) return <div style={{ textAlign: "center", padding: 24, color: MUTED, fontSize: 13 }}>Loading stories…</div>;
  if (!stories.length) return (
    <div style={{ textAlign: "center", padding: "24px 16px", color: MUTED }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: DARK }}>No stories yet</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>Check back at the end of the week — your educator is capturing {childName || "your child"}'s journey!</div>
    </div>
  );

  return (
    <div>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: DARK }}>✨ {childName ? `${childName}'s` : "Weekly"} Stories</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {stories.map(s => (
          <div key={s.id} onClick={() => setPlaying(s)}
            style={{ borderRadius: 14, overflow: "hidden", cursor: "pointer", boxShadow: "0 4px 16px rgba(124,58,237,0.12)", border: "1px solid #EDE8F4", background: "#fff" }}>
            <div style={{ aspectRatio: "9/12", background: "linear-gradient(135deg,#2D1B69,#7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {s.photo_urls?.[0] && <img src={s.photo_urls[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} crossOrigin="anonymous" />}
              <div style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>▶</div>
              <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 10, fontWeight: 600, opacity: 0.8 }}>
                {s.photo_urls?.length > 0 ? `${s.photo_urls.length} photos` : ""}
              </div>
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: DARK }}>Week of</div>
              <div style={{ fontSize: 11, color: MUTED }}>{s.week_start}</div>
            </div>
          </div>
        ))}
      </div>
      {playing && <MiniPlayer story={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
