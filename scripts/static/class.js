(function(){
  var BOARDS=__BOARDS__;
  var slots=Array.from(document.querySelectorAll('[data-period]')); if(!slots.length||!('IntersectionObserver' in window)) return;
  var items=Array.from(document.querySelectorAll('.timetable li'));
  var board=document.querySelector('.chalkboard'), chalk=document.querySelector('.chalk'), lesson=document.querySelector('.lesson'), bar=document.querySelector('.progress');
  var still=window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('animate' in Element.prototype);
  var period='door', timer=null, seen={};

  // ---- chalk drawing, one layer at a time (mirrors the site's Sketch) ----
  function hide(root){
    root.querySelectorAll('text').forEach(function(t){t.style.opacity='0';});
    root.querySelectorAll('path').forEach(function(p){var f=p.getAttribute('fill');
      if(f&&f!=='none'){p.style.opacity='0';} else {var len=p.getTotalLength();p.style.strokeDasharray=String(len);p.style.strokeDashoffset=String(len);}});
  }
  function draw(root, seconds){
    var strokes=[], washes=[];
    root.querySelectorAll('path').forEach(function(p){var f=p.getAttribute('fill');
      if(f&&f!=='none') washes.push({el:p,o:Number(p.getAttribute('opacity')||1)}); else strokes.push({el:p,len:p.getTotalLength()});});
    root.querySelectorAll('text').forEach(function(t){washes.push({el:t,o:Number(t.getAttribute('opacity')||1)});});
    var total=strokes.reduce(function(a,s){return a+s.len;},0), speed=total/(seconds*1000);
    var plan=strokes.map(function(s){return {el:s.el,len:s.len,dur:Math.max(12,s.len/speed)};});
    var raw=plan.reduce(function(a,s){return a+s.dur*0.92;},0), k=(seconds*1000)/raw, t=0;
    plan.forEach(function(s){var dur=s.dur*k; s.el.style.strokeDasharray=String(s.len); s.el.style.strokeDashoffset=String(s.len);
      s.el.animate([{strokeDashoffset:s.len},{strokeDashoffset:0}],{duration:dur,delay:t,fill:'forwards',easing:'linear'}); t+=dur*0.92;});
    washes.forEach(function(w){w.el.style.opacity='0'; w.el.animate([{opacity:0},{opacity:w.o}],{duration:900,delay:t+100,fill:'forwards',easing:'ease-out'});});
  }
  function upto(key){ var m=/^period-(3|4):(\d)$/.exec(key); if(!m) return 0; var s=Math.min(3,Number(m[2])); return m[1]==='3'? s : 3+s; }
  function layers(key){
    var n=upto(key);
    Array.from(chalk.querySelectorAll('.chalk-layer')).forEach(function(l,i){var L=i+1;
      if(L>n){ if(!still) hide(l); delete seen[L]; return; }
      if(seen[L]) return; seen[L]=true; if(!still) draw(l,1.6);
    });
  }

  function show(key, samePeriod){
    var html=BOARDS[key]; if(!html) return;
    if(samePeriod){
      var tmp=document.createElement('div'); tmp.innerHTML=html;
      var np=tmp.querySelectorAll('p'), op=chalk.querySelectorAll('p');
      if(np.length===op.length){ np.forEach(function(p,i){op[i].className=p.className;}); layers(key); return; }
    }
    chalk.innerHTML=html; layers(key);
  }
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;
    var per=e.target.getAttribute('data-period'), st=e.target.getAttribute('data-step'); var key= per==='door'?'door':(per+':'+st);
    items.forEach(function(li){var a=li.querySelector('a');li.classList.toggle('on',a&&a.getAttribute('href')==='#'+per);});
    if(per!==period){ period=per; board.classList.remove('on'); board.classList.add('wipe'); clearTimeout(timer);
      timer=setTimeout(function(){ show(key,false); board.classList.remove('wipe'); board.classList.add('on'); },620); }
    else { show(key,true); }
  });},{rootMargin:'-48% 0px -51% 0px',threshold:0});
  slots.forEach(function(s){io.observe(s);});
  board.classList.add('on');
  function onScroll(){ if(!lesson||!bar) return; var r=lesson.getBoundingClientRect(); var total=r.height-window.innerHeight; var done=Math.min(1,Math.max(0,-r.top/Math.max(1,total))); bar.style.transform='scaleX('+done+')'; }
  window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
})();
