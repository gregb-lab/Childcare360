/**
 * StoryPlayer.jsx — Weekly Story Player
 *
 * A 15–25 second animated story player similar to Google Photos / Instagram Stories.
 * Pure CSS transitions — no video encoding, no FFmpeg, works in-browser.
 *
 * Props:
 *   story   — { slides, music_track, duration_secs, title, week_starting }
 *   onClose — callback when story ends or user closes
 *   autoPlay — boolean (default true)
 *
 * Usage:
 *   import StoryPlayer from './StoryPlayer.jsx';
 *   {viewingStory && <StoryPlayer story={viewingStory} onClose={() => setViewingStory(null)} />}
 */
import { useState, useEffect, useRef, useCallback } from "react";

const MUSIC_TRACKS = {
  'gentle-piano':    'https://www.bensound.com/bensound-music/bensound-slowmotion.mp3',
  'playful-ukulele': 'https://www.bensound.com/bensound-music/bensound-ukulele.mp3',
  'warm-acoustic':   'https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3',
  'dreamy':          'https://www.bensound.com/bensound-music/bensound-dreams.mp3',
};

const EYLF_COLORS = ['#7C3AED', '#0891B2', '#16A34A', '#D97706', '#DC2626'];

// Progress bar for each slide
function ProgressBar({ total, current, elapsed, slideTotal }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", gap: 4, padding: "12px 14px 0" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: "rgba(255,255,255,0.35)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 3, background: "#fff",
            width: i < current ? "100%" : i === current ? `${Math.min(100, (elapsed / slideTotal) * 100)}%` : "0%",
            transition: i === current ? "none" : "none",
          }} />
        </div>
      ))}
    </div>
  );
}

function TitleSlide({ slide }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #3D3248 0%, #7C3AED 100%)", padding: 32, boxSizing: "border-box" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>✨</div>
      <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 800, textAlign: "center", margin: "0 0 10px", lineHeight: 1.3 }}>{slide.text}</h2>
      <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, textAlign: "center", margin: 0 }}>{slide.subtext}</p>
    </div>
  );
}

function PhotoSlide({ slide, isEntering, transition }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const enterStyle = isEntering
    ? transition === 'slide'
      ? { transform: "translateX(0)", opacity: 1 }
      : { opacity: 1, transform: "scale(1)" }
    : transition === 'slide'
      ? { transform: "translateX(8px)", opacity: 0 }
      : { opacity: 0, transform: "scale(1.04)" };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#111", overflow: "hidden" }}>
      {slide.photo_url ? (
        <img
          src={slide.photo_url}
          alt=""
          onLoad={() => setImageLoaded(true)}
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            transition: "opacity 0.6s ease, transform 0.6s ease",
            ...enterStyle,
            // Ken Burns effect: slow pan
            animation: imageLoaded ? "kenBurns 8s ease-in-out infinite alternate" : "none",
          }}
        />
      ) : (
        // Placeholder when no photo
        <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #EDE4F0, #C4B5FD)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 64, opacity: 0.4 }}>📸</span>
        </div>
      )}
      {/* Caption overlay */}
      {slide.caption && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.7))", padding: "32px 20px 20px" }}>
          <p style={{ color: "#fff", fontSize: 15, fontWeight: 500, margin: 0, lineHeight: 1.4, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>{slide.caption}</p>
        </div>
      )}
      {/* Source badge */}
      {slide.source === 'observation' && (
        <div style={{ position: "absolute", top: 56, right: 14, background: "rgba(124,58,237,0.85)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10 }}>Learning Moment</div>
      )}
    </div>
  );
}

function TextSlide({ slide }) {
  const isHighlight = slide.style === 'highlight';
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 36, boxSizing: "border-box", background: isHighlight ? "linear-gradient(135deg, #F0EBF8, #EDE4F0)" : "#fff" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 14 }}>🌱</div>
        <p style={{ fontSize: 19, fontWeight: 700, color: "#3D3248", margin: 0, lineHeight: 1.5 }}>{slide.text}</p>
      </div>
    </div>
  );
}

function ClosingSlide({ slide, childName }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)", padding: 32, boxSizing: "border-box" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>💛</div>
      <h3 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 10px" }}>{slide.text}</h3>
      <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, textAlign: "center", margin: 0 }}>Shared with love by the team at your centre</p>
    </div>
  );
}

export default function StoryPlayer({ story, onClose, autoPlay = true }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(!autoPlay);
  const [muted, setMuted] = useState(false);
  const [entering, setEntering] = useState(true);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const TICK = 100; // ms

  const slides = story?.slides || [];
  const slide = slides[currentSlide];
  const slideDur = (slide?.duration || 4) * 1000; // ms

  const advance = useCallback(() => {
    setEntering(false);
    setTimeout(() => {
      setCurrentSlide(i => {
        const next = i + 1;
        if (next >= slides.length) { onClose?.(); return i; }
        setElapsed(0);
        setEntering(true);
        return next;
      });
    }, 300); // transition gap
  }, [slides.length, onClose]);

  // Timer tick
  useEffect(() => {
    if (paused || !slide) return;
    timerRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + TICK;
        if (next >= slideDur) { advance(); return slideDur; }
        return next;
      });
    }, TICK);
    return () => clearInterval(timerRef.current);
  }, [paused, slide, slideDur, advance]);

  // Audio
  useEffect(() => {
    const trackUrl = story?.music_track ? MUSIC_TRACKS[story.music_track] : null;
    if (!trackUrl || !audioRef.current) return;
    audioRef.current.src = trackUrl;
    audioRef.current.volume = 0.35;
    audioRef.current.loop = true;
    if (!paused) audioRef.current.play().catch(() => {});
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; } };
  }, [story?.music_track]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (paused) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
  }, [paused]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      if (e.key === 'ArrowRight') advance();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, advance]);

  if (!story || slides.length === 0) return null;

  const renderSlide = (s, isEntering) => {
    if (!s) return null;
    switch (s.type) {
      case 'title':   return <TitleSlide slide={s} />;
      case 'photo':   return <PhotoSlide slide={s} isEntering={isEntering} transition={s.transition} />;
      case 'text':    return <TextSlide slide={s} />;
      case 'closing': return <ClosingSlide slide={s} />;
      default:        return <PhotoSlide slide={s} isEntering={isEntering} transition="fade" />;
    }
  };

  return (
    <>
      {/* Ken Burns keyframe — injected once */}
      <style>{`
        @keyframes kenBurns {
          0%   { transform: scale(1) translate(0,0); }
          100% { transform: scale(1.08) translate(-2%,-1%); }
        }
      `}</style>

      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={() => setPaused(p => !p)}>

        {/* Story container — portrait 9:16 ratio */}
        <div style={{ position: "relative", width: "min(400px, 90vw)", height: "min(711px, 80vh)", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
          onClick={e => e.stopPropagation()}>

          {/* Progress bars */}
          <ProgressBar total={slides.length} current={currentSlide} elapsed={elapsed} slideTotal={slideDur} />

          {/* Top controls */}
          <div style={{ position: "absolute", top: 28, right: 14, zIndex: 25, display: "flex", gap: 8 }}>
            <button onClick={() => setMuted(m => !m)}
              style={{ background: "rgba(0,0,0,0.4)", border: "none", color: "#fff", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {muted ? "🔇" : "🔊"}
            </button>
            <button onClick={onClose}
              style={{ background: "rgba(0,0,0,0.4)", border: "none", color: "#fff", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✕
            </button>
          </div>

          {/* Slide */}
          <div style={{ width: "100%", height: "100%", transition: entering ? "opacity 0.4s ease" : "none", opacity: entering ? 1 : 0.3 }}>
            {renderSlide(slide, entering)}
          </div>

          {/* Tap zones: prev / pause / next */}
          <div style={{ position: "absolute", inset: 0, zIndex: 15, display: "flex" }}>
            <div style={{ flex: 1 }} onClick={e => { e.stopPropagation(); if (currentSlide > 0) { setCurrentSlide(i => i - 1); setElapsed(0); setEntering(true); } }} />
            <div style={{ flex: 2 }} onClick={e => { e.stopPropagation(); setPaused(p => !p); }} />
            <div style={{ flex: 1 }} onClick={e => { e.stopPropagation(); advance(); }} />
          </div>

          {/* Pause indicator */}
          {paused && (
            <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>⏸</div>
            </div>
          )}

          {/* Bottom: slide counter + duration */}
          <div style={{ position: "absolute", bottom: 14, left: 14, zIndex: 20, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "3px 8px", borderRadius: 10 }}>
              {currentSlide + 1} / {slides.length}
            </span>
            <span style={{ background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, padding: "3px 8px", borderRadius: 10 }}>
              {Math.round(story.duration_secs)}s
            </span>
          </div>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" style={{ display: "none" }} />
    </>
  );
}
