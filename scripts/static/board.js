(function(){var c=document.querySelector('canvas.board');if(!c)return;var x=c.getContext('2d');if(!x)return;
var w=c.width=640,h=c.height=360;x.fillStyle='#0c0d0c';x.fillRect(0,0,w,h);
for(var i=0;i<26;i++){var y=Math.random()*h,len=200+Math.random()*500,px=Math.random()*w-120;
var g=x.createLinearGradient(px,y,px+len,y);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,'+(0.012+Math.random()*0.02)+')');g.addColorStop(1,'rgba(255,255,255,0)');
x.fillStyle=g;x.save();x.translate(px,y);x.rotate((Math.random()-.5)*.12);x.fillRect(0,0,len,18+Math.random()*60);x.restore();}
var im=x.getImageData(0,0,w,h),d=im.data;for(var j=0;j<d.length;j+=4){var n=(Math.random()-.5)*10;d[j]+=n;d[j+1]+=n;d[j+2]+=n;}x.putImageData(im,0,0);})();
