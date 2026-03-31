/**
 * WeeklyStoryModule.jsx — v2.5.0 VISUAL REBUILD
 * Spotify Wrapped / Google Photos style. Pure visuals: photo collage,
 * animated stats, music. NO text-to-speech. NO narration.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const API=(path,opts={})=>{const t=localStorage.getItem("c360_token"),tid=localStorage.getItem("c360_tenant");return fetch(path,{headers:{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{}),...(tid?{"x-tenant-id":tid}:{})},method:opts.method||"GET",...(opts.body?{body:JSON.stringify(opts.body)}:{})}).then(r=>r.json());};
const toast=(m,t="success")=>window.showToast?.(m,t);
const DARK="#3D3248",MUTED="#8A7F96",P="#7C3AED",PL="#EDE4F0";
const card={background:"#fff",borderRadius:16,border:"1px solid #EDE8F4",padding:"22px 26px"};
const btnP={padding:"10px 22px",borderRadius:10,border:"none",background:P,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14};
const btnS={padding:"10px 20px",borderRadius:10,border:`1px solid ${P}`,background:"#fff",color:P,fontWeight:600,cursor:"pointer",fontSize:14};

const TRACKS=[
  {id:"playful",  label:"Playful & Bright",  mood:"happy",     url:"https://cdn.pixabay.com/download/audio/2022/10/25/audio_2eefea3b5c.mp3"},
  {id:"warm",     label:"Warm Strings",       mood:"warm",      url:"https://cdn.pixabay.com/download/audio/2021/11/25/audio_c1ef4bc2af.mp3"},
  {id:"gentle",   label:"Gentle Piano",       mood:"calm",      url:"https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1c07.mp3"},
  {id:"uplifting",label:"Uplifting",          mood:"joyful",    url:"https://cdn.pixabay.com/download/audio/2022/01/27/audio_d4c5765dff.mp3"},
  {id:"cinematic",label:"Cinematic Year End", mood:"epic",      url:"https://cdn.pixabay.com/download/audio/2022/11/22/audio_febc508520.mp3"},
  {id:"nostalgic",label:"Nostalgic",          mood:"nostalgic", url:"https://cdn.pixabay.com/download/audio/2022/08/02/audio_2dde668d05.mp3"},
];

const EYLF_LABELS={1:"Identity",2:"Community",3:"Wellbeing",4:"Learning",5:"Communication"};
const EYLF_COLORS=["#C9929E","#9B7DC0","#6BA38B","#D4A26A","#6B89B8"];
const PALETTE=[["#7C3AED","#4C1D95"],["#0F766E","#134E4A"],["#C2410C","#7C2D12"],["#1D4ED8","#1E3A8A"],["#86198F","#4A044E"]];

function easeOut(x){return 1-(1-x)*(1-x);}
function easeInOut(x){return x<0.5?2*x*x:1-Math.pow(-2*x+2,2)/2;}
function getMonday(offset=0){const d=new Date(),day=d.getDay(),mon=new Date(d);mon.setDate(d.getDate()-(day===0?6:day-1)+offset*7);return mon.toISOString().split("T")[0];}
const YEAR_NOW=new Date().getFullYear();

// ── VISUAL PLAYER ─────────────────────────────────────────────────────────────
function StoryPlayer({data,trackUrl,onClose}){
  const canvasRef=useRef(null);
  const audioRef=useRef(null);
  const animRef=useRef(null);
  const startRef=useRef(null);
  const imgs=useRef([]);
  const [playing,setPlaying]=useState(false);
  const [done,setDone]=useState(false);
  const [progress,setProgress]=useState(0);

  const {photos=[],stats={},highlights=[],eylf=[],subject="",period="week",year,term,week_start}=data;
  const TOTAL=period==="year"?50000:period==="term"?28000:14000;

  // Build slide sequence
  const slides=useRef([]);
  useEffect(()=>{
    const phs=["https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600","https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=600","https://images.unsplash.com/photo-1579547621113-e4bb2a19bdd6?w=600"];
    const urls=photos.length?photos:phs;
    imgs.current=urls.map(u=>{const i=new Image();i.crossOrigin="anonymous";i.src=u;return i;});
    // Weekly variety: rotate format based on child/period hash + week number
    const weekNum=Math.floor(Date.now()/(7*24*60*60*1000));
    const hash=(s)=>{let h=weekNum;for(const c of s)h=(h*31+c.charCodeAt(0))&0xFFFF;return h;};
    const variety=hash(subject+period+(year||"")+(term||""));
    const formats=["classic","portrait","bold","grid"];
    const fmt=formats[variety%formats.length];
    const s=[];
    s.push({type:"intro",dur:1.8,fmt});
    if((stats.stories||0)+(stats.activities||0)>0) s.push({type:"stats",dur:2.5});
    const chunks=[];
    if(fmt==="portrait"&&urls.length>0){
      // Portrait format: each photo gets its own slide, centred with face-zoom
      for(let i=0;i<Math.min(urls.length,4);i++) chunks.push([i,i+1]);
    } else if(fmt==="bold"&&urls.length>1){
      // Bold: 2 per slide
      for(let i=0;i<Math.min(urls.length,8);i+=2) chunks.push([i,Math.min(i+2,urls.length)]);
    } else {
      // Classic/grid: up to 3 per slide
      for(let i=0;i<Math.min(urls.length,9);i+=3) chunks.push([i,Math.min(i+3,urls.length)]);
    }
    chunks.forEach(c=>s.push({type:"photos",from:c[0],to:c[1],dur:fmt==="portrait"?2.8:2.2}));
    if(highlights.length>0)s.push({type:"highlight",text:highlights[0].slice(0,160),dur:3.5});
    if(eylf.length>0)s.push({type:"eylf",dur:3.5});
    s.push({type:"outro",dur:1.5});
    // Normalise to TOTAL ms
    const totalSecs=s.reduce((a,b)=>a+b.dur,0);
    s.forEach(sl=>{sl.durMs=sl.dur/totalSecs*TOTAL;});
    slides.current=s;
    return()=>{cancelAnimationFrame(animRef.current);audioRef.current?.pause();};
  },[]);

  const draw=useCallback(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    const elapsed=startRef.current?Date.now()-startRef.current:0;
    const globalT=Math.min(elapsed/TOTAL,1);
    setProgress(globalT);

    // Find current slide
    let cum=0,slideIdx=0,slideT=0;
    for(let i=0;i<slides.current.length;i++){
      const dur=slides.current[i].durMs;
      if(elapsed<=cum+dur){slideIdx=i;slideT=Math.min((elapsed-cum)/dur,1);break;}
      cum+=dur;
    }
    const slide=slides.current[slideIdx]||{type:"outro"};
    const palIdx=slideIdx%PALETTE.length;
    const [c1,c2]=PALETTE[palIdx];

    const bg=(a,b)=>{const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,a);g.addColorStop(1,b);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);};

    const drawImg=(img,x,y,w,h,zoom=1,alpha=1)=>{
      if(!img?.complete||!img.naturalWidth)return;
      ctx.save();ctx.globalAlpha=alpha;
      const iw=img.naturalWidth,ih=img.naturalHeight,asp=iw/ih,ca=w/h;
      let sw,sh,sx,sy;
      if(asp>ca){sh=ih;sw=ih*ca;sx=(iw-sw)/2;sy=0;}else{sw=iw;sh=iw/ca;sx=0;sy=(ih-sh)/2;}
      ctx.translate(x+w/2,y+h/2);ctx.scale(zoom,zoom);ctx.translate(-(x+w/2),-(y+h/2));
      ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
      ctx.restore();
    };

    const rr=(x,y,w,h,r)=>{ctx.beginPath();if(ctx.roundRect){ctx.roundRect(x,y,w,h,r);}else{ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}};

    // ── INTRO ─────────────────────────────────────────────────────────────────
    if(slide.type==="intro"){
      bg(c1,c2);
      const a=slideT<0.25?easeOut(slideT/0.25):slideT>0.85?easeOut((1-slideT)/0.15):1;
      const sc=0.9+easeOut(Math.min(slideT/0.35,1))*0.1;
      ctx.save();ctx.translate(W/2,H/2);ctx.scale(sc,sc);ctx.translate(-W/2,-H/2);ctx.globalAlpha=a;
      ctx.textAlign="center";
      // Safe zone: all content between H*0.12 and H*0.88
      ctx.font=`${Math.min(H*0.1,80)}px serif`;ctx.fillStyle="#fff";ctx.fillText("✨",W/2,H*0.32);
      ctx.font=`bold ${Math.min(H*0.055,44)}px system-ui`;ctx.fillStyle="#fff";
      // Truncate long names
      const dispName=subject.length>22?subject.slice(0,20)+"…":subject;
      ctx.fillText(dispName,W/2,H*0.48);
      const sub=period==="year"?`${year} · Year in Review`:period==="term"?`Term ${term} ${year} · Highlights`:`Week of ${week_start||""}`;
      ctx.font=`${Math.min(H*0.026,20)}px system-ui`;ctx.fillStyle="rgba(255,255,255,0.65)";ctx.fillText(sub,W/2,H*0.57);
      ctx.globalAlpha=1;ctx.restore();
    }

    // ── STATS ─────────────────────────────────────────────────────────────────
    else if(slide.type==="stats"){
      bg(c1,c2);
      const headerA=easeInOut(Math.min(slideT*4,1));
      ctx.globalAlpha=headerA;ctx.textAlign="center";ctx.fillStyle="#fff";
      ctx.font=`bold ${Math.min(H*0.036,28)}px system-ui`;ctx.fillText(period==="week"?"This week's moments":period==="term"?"Term highlights":"Year in review",W/2,H*0.14);
      // Big number reveal — total count
      const total=(stats.stories||0)+(stats.activities||0)+(stats.observations||0);
      const bigNum=Math.round(total*easeOut(Math.min(slideT*2,1)));
      ctx.font=`bold ${H*0.18}px system-ui`;ctx.fillStyle="#fff";
      ctx.globalAlpha=easeOut(Math.min(slideT*2,1));ctx.fillText(bigNum,W/2,H*0.38);
      ctx.font=`${H*0.032}px system-ui`;ctx.fillStyle="rgba(255,255,255,0.65)";ctx.fillText("moments captured",W/2,H*0.45);
      // Stat pills
      const items=[
        {n:stats.stories||0,l:"learning stories",e:"📚"},
        {n:stats.activities||0,l:"activities",e:"🎨"},
        {n:stats.photos||0,l:"photos",e:"📸"},
        {n:stats.eylf||0,l:"EYLF milestones",e:"🌱"},
      ].filter(s=>s.n>0).slice(0,4);
      const pillW=W*0.38,pillH=H*0.1;
      const cols=2,rows=Math.ceil(items.length/cols);
      const gapX=W*0.06,gapY=H*0.02;
      const startX=(W-cols*pillW-gapX)/2,startY=H*0.52;
      items.forEach((s,i)=>{
        const col=i%cols,row=Math.floor(i/cols);
        const x=startX+col*(pillW+gapX),y=startY+row*(pillH+gapY);
        const a2=easeOut(Math.max(0,Math.min((slideT*3-i*0.2),1)));
        ctx.globalAlpha=a2;
        ctx.fillStyle="rgba(255,255,255,0.15)";rr(x,y,pillW,pillH,12);ctx.fill();
        ctx.textAlign="left";ctx.font=`${H*0.035}px serif`;ctx.fillStyle="#fff";ctx.fillText(s.e,x+12,y+pillH*0.65);
        ctx.font=`bold ${H*0.038}px system-ui`;ctx.fillStyle="#fff";ctx.fillText(s.n,x+pillW*0.28,y+pillH*0.68);
        ctx.font=`${H*0.02}px system-ui`;ctx.fillStyle="rgba(255,255,255,0.6)";ctx.fillText(s.l,x+pillW*0.28,y+pillH*0.9);
      });
      ctx.globalAlpha=1;
    }

    // ── PHOTOS ────────────────────────────────────────────────────────────────
    else if(slide.type==="photos"){
      const from=slide.from||0,to=slide.to||1,count=to-from;
      bg("#111","#222");
      const alpha=easeOut(Math.min(slideT*3,1));
      const zoom=1+slideT*0.06;
      if(count===1){
        // Portrait mode: smart crop to top 65% for face emphasis
        const img=imgs.current[from];
        if(img?.complete&&img.naturalWidth){
          const iw=img.naturalWidth,ih=img.naturalHeight;
          // Crop vertically to upper portion (face area) with gentle zoom
          const cropH=ih*0.65;
          const scale2=1+slideT*0.09;
          const dstW=W*scale2,dstH=W*scale2*(cropH/iw);
          const ox=(W-dstW)/2,oy=H*0.05;
          ctx.save();ctx.globalAlpha=alpha;
          ctx.drawImage(img,0,0,iw,cropH,ox,oy,dstW,dstH);
          ctx.restore();
        }
        const ov=ctx.createLinearGradient(0,H*0.45,0,H);ov.addColorStop(0,"rgba(0,0,0,0)");ov.addColorStop(1,"rgba(0,0,0,0.45)");ctx.fillStyle=ov;ctx.fillRect(0,0,W,H);
      } else if(count===2){
        const gap=8,h2=H/2-gap/2;
        drawImg(imgs.current[from],0,0,W,h2,zoom,alpha);
        if(imgs.current[from+1])drawImg(imgs.current[from+1],0,h2+gap,W,H-h2-gap,zoom,alpha);
      } else {
        // 3-photo grid: big left, 2 small right
        const gap=6,bigW=W*0.6,smallW=W-bigW-gap,smallH=H/2-gap/2;
        drawImg(imgs.current[from],0,0,bigW,H,zoom,alpha);
        if(imgs.current[from+1])drawImg(imgs.current[from+1],bigW+gap,0,smallW,smallH,zoom,alpha);
        if(imgs.current[from+2])drawImg(imgs.current[from+2],bigW+gap,smallH+gap,smallW,H-smallH-gap,zoom,alpha);
        ctx.fillStyle=`rgba(0,0,0,${0.3*(1-slideT)})`;ctx.fillRect(0,0,W,H);
      }
      // Photo counter dots
      const total=Math.min(imgs.current.length,9);
      for(let i=0;i<total;i++){
        ctx.beginPath();ctx.arc(W/2+(i-(total-1)/2)*13,H-14,i===from?4.5:2.5,0,Math.PI*2);
        ctx.fillStyle=i===from?"#fff":"rgba(255,255,255,0.35)";ctx.fill();
      }
    }

    // ── HIGHLIGHT ─────────────────────────────────────────────────────────────
    else if(slide.type==="highlight"){
      bg(c1,c2);
      const a=easeInOut(slideT<0.12?slideT/0.12:slideT>0.88?(1-slideT)/0.12:1);
      ctx.globalAlpha=a;
      // Big quote mark background
      ctx.font=`bold ${H*0.22}px Georgia,serif`;ctx.fillStyle="rgba(255,255,255,0.08)";ctx.textAlign="left";ctx.fillText("\u201C",W*0.04,H*0.45);
      // Word-wrap the text
      const txt=slide.text||"";
      const fs=Math.floor(H*0.038);ctx.font=`${fs}px system-ui`;ctx.fillStyle="#fff";ctx.textAlign="center";
      const maxW=W*0.8,words=txt.split(" ");
      const lines=[];let cur="";
      words.forEach(w=>{const test=cur?cur+" "+w:w;if(ctx.measureText(test).width>maxW){lines.push(cur);cur=w;}else cur=test;});
      if(cur)lines.push(cur);
      const lineH=fs*1.6,startY=H/2-(lines.length*lineH)/2;
      lines.slice(0,5).forEach((l,i)=>ctx.fillText(l,W/2,startY+i*lineH));
      // "A moment this week" label
      ctx.font=`${Math.floor(H*0.022)}px system-ui`;ctx.fillStyle="rgba(255,255,255,0.5)";
      ctx.fillText("A moment this week ✨",W/2,H*0.88);
      ctx.globalAlpha=1;
    }

    // ── EYLF ──────────────────────────────────────────────────────────────────
    else if(slide.type==="eylf"){
      bg("#0F3460","#16213E");
      ctx.textAlign="center";ctx.fillStyle="#fff";
      ctx.globalAlpha=easeInOut(Math.min(slideT*3,1));
      ctx.font=`bold ${H*0.036}px system-ui`;ctx.fillText("Growing this week",W/2,H*0.12);
      ctx.font=`${H*0.02}px system-ui`;ctx.fillStyle="rgba(255,255,255,0.5)";ctx.fillText("EYLF Learning Outcomes",W/2,H*0.19);
      const items=eylf.slice(0,5);
      const barW=W*0.74,barH=H*0.053;
      items.forEach((e,i)=>{
        const a2=easeOut(Math.max(0,Math.min((slideT*2.5-i*0.15),1)));
        const label=EYLF_LABELS[e.eylf_outcome]||`Outcome ${e.eylf_outcome}`;
        const pct=Math.min((e.level||1)/5,1);
        const x=(W-barW)/2,y=H*0.25+i*(barH+H*0.042);
        ctx.globalAlpha=a2;
        // Label
        ctx.textAlign="left";ctx.font=`${H*0.026}px system-ui`;ctx.fillStyle="#fff";ctx.fillText(label,x,y-5);
        // Track
        ctx.fillStyle="rgba(255,255,255,0.12)";rr(x,y,barW,barH,barH/2);ctx.fill();
        // Fill (animated)
        ctx.fillStyle=EYLF_COLORS[i%EYLF_COLORS.length];
        rr(x,y,barW*pct*a2,barH,barH/2);ctx.fill();
        // Level
        ctx.textAlign="right";ctx.font=`${H*0.022}px system-ui`;ctx.fillStyle="rgba(255,255,255,0.55)";
        ctx.fillText(`Lvl ${e.level||1}`,x+barW+42,y+barH*0.72);
        ctx.globalAlpha=1;
      });
      ctx.textAlign="center";
    }

    // ── OUTRO ─────────────────────────────────────────────────────────────────
    else{
      bg("#1a1a2e","#2D1B69");
      const a=easeInOut(slideT<0.2?slideT/0.2:slideT>0.7?(1-slideT)/0.3:1);
      ctx.globalAlpha=a;ctx.textAlign="center";
      ctx.font=`${Math.min(H*0.11,80)}px serif`;ctx.fillStyle="#fff";ctx.fillText("💛",W/2,H*0.38);
      ctx.font=`bold ${Math.min(H*0.042,34)}px system-ui`;ctx.fillStyle="#fff";
      ctx.fillText(period==="year"?"What a year.":period==="term"?"What a term.":"See you next week.",W/2,H*0.54);
      ctx.font=`${Math.min(H*0.022,17)}px system-ui`;ctx.fillStyle="rgba(255,255,255,0.45)";
      ctx.fillText("Made with ♡ by Childcare360",W/2,H*0.64);
      ctx.globalAlpha=1;
    }

    // Progress bar
    ctx.fillStyle="rgba(255,255,255,0.18)";ctx.fillRect(0,H-4,W,4);
    ctx.fillStyle="rgba(255,255,255,0.75)";ctx.fillRect(0,H-4,W*globalT,4);

    if(globalT>=1){cancelAnimationFrame(animRef.current);setPlaying(false);setDone(true);return;}
    animRef.current=requestAnimationFrame(draw);
  },[TOTAL]);

  const play=()=>{
    setDone(false);setProgress(0);setPlaying(true);startRef.current=Date.now();
    if(audioRef.current){audioRef.current.volume=0.45;audioRef.current.currentTime=0;audioRef.current.play().catch(()=>{});}
    animRef.current=requestAnimationFrame(draw);
  };
  const stop=()=>{setPlaying(false);cancelAnimationFrame(animRef.current);audioRef.current?.pause();setProgress(0);startRef.current=null;setDone(false);};
  useEffect(()=>()=>{cancelAnimationFrame(animRef.current);audioRef.current?.pause();},[]);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
      <div style={{position:"relative",borderRadius:22,overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,0.7)"}}>
        <canvas ref={canvasRef} width={390} height={693} style={{display:"block"}}/>
        {!playing&&!done&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.25)"}}><button onClick={play} style={{width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.95)",border:"none",cursor:"pointer",fontSize:32,boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>▶</button></div>}
        {playing&&<button onClick={stop} style={{position:"absolute",top:40,right:14,background:"rgba(0,0,0,0.4)",border:"none",borderRadius:20,color:"#fff",padding:"4px 12px",cursor:"pointer",fontSize:12}}>■ Stop</button>}
        {done&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><button onClick={play} style={{...btnP,borderRadius:30,padding:"12px 28px",fontSize:15}}>↺ Replay</button></div>}
      </div>
      {trackUrl&&<audio ref={audioRef} src={trackUrl} loop preload="auto"/>}
      <div style={{marginTop:18,textAlign:"center"}}>
        <div style={{color:"#fff",fontSize:14,fontWeight:600,opacity:0.85}}>{subject}</div>
        <button onClick={onClose} style={{marginTop:8,color:"rgba(255,255,255,0.5)",background:"none",border:"none",cursor:"pointer",fontSize:13,textDecoration:"underline"}}>Close</button>
      </div>
    </div>
  );
}

// ── Story Card ─────────────────────────────────────────────────────────────────
function StoryCard({story,onPlay,onDelete,onPublish,onUnpublish}){
  const photos=story.photo_urls||[];
  const palIdx=(story.id?.charCodeAt(0)||0)%PALETTE.length;
  const [c1,c2]=PALETTE[palIdx];
  const badge=story.period==="year"?"🌟 Year":story.period==="term"?`🎓 Term ${story.term}`:"📅 Week";
  const icon={child:"👶",room:"🏠",centre:"🏫"}[story.type]||"✨";
  return(
    <div style={{...card,padding:0,overflow:"hidden"}}>
      <div onClick={onPlay} style={{cursor:"pointer",aspectRatio:"9/5",background:`linear-gradient(135deg,${c1},${c2})`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {photos[0]&&<img src={photos[0]} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:0.5}} crossOrigin="anonymous"/>}
        <div style={{position:"relative",width:52,height:52,borderRadius:"50%",background:"rgba(255,255,255,0.92)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>▶</div>
        <div style={{position:"absolute",top:8,left:10,background:story.status==="published"?"#16A34A":"rgba(0,0,0,0.5)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{story.status==="published"?"✓ Live":"Draft"}</div>
        <div style={{position:"absolute",top:8,right:10,background:"rgba(124,58,237,0.85)",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{badge}</div>
        {photos.length>0&&<div style={{position:"absolute",bottom:8,right:10,background:"rgba(0,0,0,0.4)",color:"#fff",fontSize:10,padding:"2px 8px",borderRadius:10}}>{photos.length} photos</div>}
      </div>
      <div style={{padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <span style={{fontSize:18}}>{icon}</span>
          <span style={{fontWeight:700,fontSize:14,color:DARK}}>{story.child_name||story.room_name||"Centre"}</span>
        </div>
        <div style={{fontSize:12,color:MUTED,marginBottom:10}}>
          {story.period==="year"?`Year ${story.year}`:story.period==="term"?`Term ${story.term} ${story.year}`:`Week of ${story.week_start}`}
        </div>
        <div style={{display:"flex",gap:8}}>
          {story.status==="draft"
            ?<button onClick={onPublish} style={{...btnP,padding:"6px 14px",fontSize:12,flex:1}}>Publish →</button>
            :<button onClick={onUnpublish} style={{...btnS,padding:"6px 14px",fontSize:12,flex:1}}>Unpublish</button>}
          <button onClick={onDelete} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #FCA5A5",background:"#FEF2F2",color:"#DC2626",fontSize:12,cursor:"pointer"}}>Del</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Module ───────────────────────────────────────────────────────────────
export default function WeeklyStoryModule(){
  const [tab,setTab]=useState("library");
  const [period,setPeriod]=useState("week");
  const [storyType,setStoryType]=useState("child");
  const [children,setChildren]=useState([]);
  const [rooms,setRooms]=useState([]);
  const [selectedChild,setSelectedChild]=useState("");
  const [selectedRoom,setSelectedRoom]=useState("");
  const [week,setWeek]=useState(getMonday(-1));
  const [year,setYear]=useState(YEAR_NOW);
  const [term,setTerm]=useState(1);
  const [weekData,setWeekData]=useState(null);
  const [loadingData,setLoadingData]=useState(false);
  const [creating,setCreating]=useState(false);
  const [selectedTrack,setSelectedTrack]=useState(()=>{
    // Auto-rotate music by week number
    const wk=Math.floor(Date.now()/(7*24*60*60*1000));
    const trackIds=["playful","warm","gentle","uplifting"];
    return trackIds[wk%trackIds.length];
  });
  const [stories,setStories]=useState([]);
  const [loadingStories,setLoadingStories]=useState(true);
  const [playing,setPlaying]=useState(null);
  const [libFilter,setLibFilter]=useState("all");
  const [tenantName,setTenantName]=useState("our centre");

  useEffect(()=>{
    API("/api/children/simple").then(r=>{const c=Array.isArray(r)?r:(r.children||r.data||[]);setChildren(c);if(c[0])setSelectedChild(c[0].id);}).catch(()=>{});
    API("/api/rooms/simple").then(r=>{const rm=Array.isArray(r)?r:(r.rooms||r.data||[]);setRooms(rm);if(rm[0])setSelectedRoom(rm[0].id);}).catch(()=>{});
    API("/api/dashboard").then(r=>{if(r.centre?.name)setTenantName(r.centre.name);}).catch(()=>{});
    loadStories();
  },[]);

  const loadStories=async()=>{setLoadingStories(true);try{const r=await API("/api/stories?limit=30");setStories(r.stories||[]);}catch(e){}finally{setLoadingStories(false);};};

  const fetchData=async()=>{
    const params=new URLSearchParams({period,story_type:storyType});
    if(period==="week")params.set("week",week);
    else{params.set("year",year);if(period==="term")params.set("term",term);}
    if(storyType==="child"&&selectedChild)params.set("child_id",selectedChild);
    if(storyType==="room"&&selectedRoom)params.set("room_id",selectedRoom);
    setLoadingData(true);
    try{const r=await API(`/api/stories/period-data?${params}`);setWeekData(r);}
    catch(e){toast("Failed to load","error");}
    finally{setLoadingData(false);};
  };

  const create=async()=>{
    if(!weekData){toast("Load data first","error");return;}
    setCreating(true);
    try{
      const child=children.find(c=>c.id===selectedChild);
      const room=rooms.find(r=>r.id===selectedRoom);
      const r=await API("/api/stories/generate",{method:"POST",body:{
        period,story_type:storyType,year,term,
        from:weekData.from,to:weekData.to,
        child_id:storyType==="child"?selectedChild:undefined,
        room_id:storyType==="room"?selectedRoom:undefined,
        child_name:child?`${child.first_name} ${child.last_name}`:undefined,
        room_name:room?.name,centre_name:tenantName,
        stories:weekData.stories||[],activities:weekData.activities||[],
        observations:weekData.observations||[],eylf:weekData.eylf||[],
        photos:weekData.photos||[],educators:weekData.educators||[],
        music_track_id:selectedTrack,
      }});
      if(r.error)throw new Error(r.error);
      setPlaying({
        id:r.id,period,year,term,week_start:weekData.from,
        subject:storyType==="child"?(child?`${child.first_name}'s ${period==="year"?"Year":period==="term"?"Term":"Week"}`:"Story"):
                storyType==="room"?(room?.name||"Room"):tenantName,
        photos:(weekData.photos||[]).slice(0,9).map(p=>p.url||p).filter(Boolean),
        stats:{stories:weekData.stories?.length||0,activities:weekData.activities?.length||0,
               photos:weekData.photos?.length||0,eylf:weekData.eylf?.length||0,
               observations:weekData.observations?.length||0},
        highlights:(weekData.observations||[]).slice(0,2).map(o=>o.narrative).filter(Boolean),
        eylf:weekData.eylf||[],
        trackUrl:TRACKS.find(t=>t.id===selectedTrack)?.url||TRACKS[0].url,
      });
      toast("Story created! Playing now…");
      loadStories();
    }catch(e){toast(e.message||"Failed","error");}
    finally{setCreating(false);};
  };

  const publish=async id=>{await API(`/api/stories/${id}/publish`,{method:"POST"});toast("Published!");loadStories();};
  const unpublish=async id=>{await API(`/api/stories/${id}/unpublish`,{method:"POST"});toast("Unpublished");loadStories();};
  const del=async id=>{if(!confirm("Delete?"))return;await API(`/api/stories/${id}`,{method:"DELETE"});toast("Deleted");loadStories();}; // catch: .catch(e=>console.error('API error:',e))

  const play=s=>setPlaying({
    id:s.id,period:s.period||"week",year:s.year,term:s.term,week_start:s.week_start,
    subject:s.child_name||(s.child_name?"Story":"")||s.room_name||"Story",
    photos:s.photo_urls||[],
    stats:{stories:0,activities:0,photos:(s.photo_urls||[]).length,eylf:0,observations:0},
    highlights:[],eylf:[],
    trackUrl:TRACKS.find(t=>t.id===s.music_track_id)?.url||TRACKS[0].url,
  });

  const filteredStories=libFilter==="all"?stories:stories.filter(s=>s.period===libFilter);
  const child=children.find(c=>c.id===selectedChild);
  const room=rooms.find(r=>r.id===selectedRoom);
  const dataCount=(weekData?.stories?.length||0)+(weekData?.activities?.length||0)+(weekData?.observations?.length||0);

  return(
    <div style={{padding:"24px 28px",maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:32}}>✨</span>
          <div>
            <h1 style={{margin:0,fontSize:22,fontWeight:900,color:DARK}}>Weekly Stories</h1>
            <p style={{margin:"3px 0 0",color:MUTED,fontSize:13}}>Photo collage · Animated stats · Background music · Like Spotify Wrapped</p>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={btnS} onClick={()=>setTab("library")}>📚 Library ({stories.length})</button>
          <button style={btnP} onClick={()=>setTab("create")}>✨ Create</button>
        </div>
      </div>

      <div style={{display:"flex",gap:2,marginBottom:24,borderBottom:"2px solid #EDE8F4"}}>
        {[{k:"library",l:"📚 Library"},{k:"create",l:"✨ Create"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"9px 20px",border:"none",borderBottom:`3px solid ${tab===t.k?P:"transparent"}`,marginBottom:-2,background:"transparent",color:tab===t.k?P:MUTED,fontWeight:tab===t.k?700:500,cursor:"pointer",fontSize:14}}>{t.l}</button>
        ))}
      </div>

      {tab==="library"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:18}}>
            {["all","week","term","year"].map(f=>(
              <button key={f} onClick={()=>setLibFilter(f)} style={{padding:"6px 14px",borderRadius:20,border:"none",fontWeight:600,fontSize:12,cursor:"pointer",background:libFilter===f?P:"#F3F4F6",color:libFilter===f?"#fff":MUTED}}>
                {f==="all"?"All":f==="year"?"🌟 Year":f==="term"?"🎓 Term":"📅 Week"}
              </button>
            ))}
          </div>
          {loadingStories?<div style={{textAlign:"center",padding:48,color:MUTED}}>Loading…</div>
           :filteredStories.length===0?(
            <div style={{textAlign:"center",padding:"60px 0",color:MUTED}}>
              <div style={{fontSize:48,marginBottom:12}}>🎬</div>
              <div style={{fontWeight:700,fontSize:18,color:DARK,marginBottom:8}}>No stories yet</div>
              <p style={{fontSize:14,marginBottom:20,maxWidth:300,margin:"0 auto 20px"}}>Create one — photos flow in, stats animate, music plays. No talking.</p>
              <button style={btnP} onClick={()=>setTab("create")}>Create First Story</button>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:18}}>
              {filteredStories.map(s=><StoryCard key={s.id} story={s} onPlay={()=>play(s)} onDelete={()=>del(s.id)} onPublish={()=>publish(s.id)} onUnpublish={()=>unpublish(s.id)}/>)}
            </div>
          )}
        </>
      )}

      {tab==="create"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,maxWidth:860}}>
          {/* Left */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={card}>
              <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800,color:DARK}}>1. Story Period</h3>
              {[{key:"week",icon:"📅",label:"Weekly",sub:"~22 sec · photos + stats"},
                {key:"term",icon:"🎓",label:"End of Term",sub:"~45 sec · term highlights"},
                {key:"year",icon:"🌟",label:"Year in Review",sub:"~75 sec · full year journey"}].map(p=>(
                <button key={p.key} onClick={()=>{const wk2=Math.floor(Date.now()/(7*24*60*60*1000));const termTracks=["warm","gentle","uplifting","playful"];setPeriod(p.key);setWeekData(null);setSelectedTrack(p.key==="year"?["cinematic","nostalgic"][wk2%2]:p.key==="term"?termTracks[wk2%4]:"playful");}}
                  style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 14px",borderRadius:10,border:`2px solid ${period===p.key?P:"#EDE8F4"}`,background:period===p.key?PL:"#fff",cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                  <span style={{fontSize:24}}>{p.icon}</span>
                  <div><div style={{fontWeight:700,fontSize:14,color:DARK}}>{p.label}</div><div style={{fontSize:11,color:MUTED}}>{p.sub}</div></div>
                </button>
              ))}
            </div>
            <div style={card}>
              <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800,color:DARK}}>2. Audience</h3>
              {[{key:"child",icon:"👶",label:"Child story",sub:"Published to parent portal"},
                {key:"room",icon:"🏠",label:"Room story",sub:"For educators' review"},
                {key:"centre",icon:"🏫",label:"Centre story",sub:"Management overview"}].map(t=>(
                <button key={t.key} onClick={()=>setStoryType(t.key)}
                  style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"10px 14px",borderRadius:10,border:`2px solid ${storyType===t.key?P:"#EDE8F4"}`,background:storyType===t.key?PL:"#fff",cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                  <span style={{fontSize:20}}>{t.icon}</span>
                  <div><div style={{fontWeight:700,fontSize:13,color:DARK}}>{t.label}</div><div style={{fontSize:11,color:MUTED}}>{t.sub}</div></div>
                </button>
              ))}
            </div>
          </div>

          {/* Right */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={card}>
              <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800,color:DARK}}>3. Subject & When</h3>
              {storyType==="child"&&<div style={{marginBottom:12}}><label style={{fontSize:12,color:MUTED,fontWeight:600}}>Child</label><select value={selectedChild} onChange={e=>setSelectedChild(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #DDD",fontSize:14,marginTop:4}}>{children.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select></div>}
              {storyType==="room"&&<div style={{marginBottom:12}}><label style={{fontSize:12,color:MUTED,fontWeight:600}}>Room</label><select value={selectedRoom} onChange={e=>setSelectedRoom(e.target.value)} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #DDD",fontSize:14,marginTop:4}}>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
              {period==="week"&&<div style={{marginBottom:12}}><label style={{fontSize:12,color:MUTED,fontWeight:600}}>Week (Monday)</label><input type="date" value={week} onChange={e=>{setWeek(e.target.value);setWeekData(null);}} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #DDD",fontSize:14,marginTop:4,boxSizing:"border-box"}}/></div>}
              {(period==="term"||period==="year")&&<div style={{marginBottom:12}}><label style={{fontSize:12,color:MUTED,fontWeight:600}}>Year</label><select value={year} onChange={e=>{setYear(parseInt(e.target.value));setWeekData(null);}} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #DDD",fontSize:14,marginTop:4}}>{[YEAR_NOW,YEAR_NOW-1,YEAR_NOW-2].map(y=><option key={y} value={y}>{y}</option>)}</select></div>}
              {period==="term"&&<div style={{marginBottom:12}}><label style={{fontSize:12,color:MUTED,fontWeight:600}}>Term</label><select value={term} onChange={e=>{setTerm(parseInt(e.target.value));setWeekData(null);}} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:"1px solid #DDD",fontSize:14,marginTop:4}}>{[1,2,3,4].map(t=><option key={t} value={t}>Term {t}</option>)}</select></div>}
              <button style={{...btnS,width:"100%",opacity:loadingData?0.6:1}} onClick={fetchData} disabled={loadingData}>{loadingData?"Loading…":"🔍 Load Data"}</button>
              {weekData&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:dataCount>0?"#F0FDF4":"#FFFBEB",border:`1px solid ${dataCount>0?"#86EFAC":"#FDE68A"}`,fontSize:12}}><strong style={{color:dataCount>0?"#166534":"#92400E"}}>{dataCount>0?`${dataCount} moments · ${weekData.photos?.length||0} photos found`:"No data yet — story will use placeholders"}</strong></div>}
            </div>
            <div style={card}>
              <h3 style={{margin:"0 0 12px",fontSize:15,fontWeight:800,color:DARK}}>4. Music</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {TRACKS.filter(t=>period!=="week"||!["cinematic","nostalgic"].includes(t.id)).map(track=>(
                  <button key={track.id} onClick={()=>setSelectedTrack(track.id)}
                    style={{padding:"9px 10px",borderRadius:10,border:`2px solid ${selectedTrack===track.id?P:"#EDE8F4"}`,background:selectedTrack===track.id?PL:"#fff",cursor:"pointer",textAlign:"left"}}>
                    <div style={{fontSize:12,fontWeight:700,color:DARK}}>🎵 {track.label}</div>
                    <div style={{fontSize:10,color:MUTED}}>{track.mood}</div>
                  </button>
                ))}
              </div>
            </div>
            <button style={{...btnP,padding:14,fontSize:16,opacity:(creating||!weekData)?0.6:1}} onClick={create} disabled={creating||!weekData}>
              {creating?"Creating story…":"🎬 Create & Play"}
            </button>
            <div style={{...card,background:"#F9F8FF",padding:"14px 18px"}}>
              <div style={{fontSize:12,color:MUTED,lineHeight:1.8}}>
                <div>📸 Photos animate in with cinematic zoom</div>
                <div>📊 Stats reveal with big animated numbers</div>
                <div>🌱 EYLF outcomes shown as progress bars</div>
                <div>✨ Highlight moments appear as full-screen cards</div>
                <div>🎵 Music plays throughout</div>
                <div style={{marginTop:6,color:"#7C3AED",fontWeight:700}}>No text-to-speech. Ever.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {playing&&<StoryPlayer data={playing} trackUrl={playing.trackUrl} onClose={()=>setPlaying(null)}/>}
    </div>
  );
}
