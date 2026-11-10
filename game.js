(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startButton = document.getElementById('startButton');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const clockEl = document.getElementById('clock');
  const homeScoreEl = document.getElementById('homeScore');
  const awayScoreEl = document.getElementById('awayScore');
  const flash = document.getElementById('goalFlash');
  const goalCaption = document.getElementById('goalCaption');
  const pauseBadge = document.getElementById('pauseBadge');
  const keys = new Set();
  const W = 1000, H = 560;
  let cw = 0, ch = 0, dpr = 1, last = 0, elapsed = 0, running = false, paused = false, ended = false;
  let homeScore = 0, awayScore = 0, shots = 0, tackles = 0, possession = 50;
  let flashTimer = 0, messageTimer = 0, message = '';
  let audioOn = true, audioCtx = null;
  const player = {x: 340, y: 280, vx: 0, vy: 0, stamina: 100, hasBall: true, facing: 0};
  const ball = {x: 352, y: 280, vx: 0, vy: 0, owner: 'player', ownerId: 0, height: 0, spin: 0};
  let teammates = [], opponents = [], keeperHome, keeperAway;
  const touch = {x:0,y:0,active:false};
  let joystickPointer = null;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function freshTeams(){
    teammates = [
      {x:210,y:145,homeX:210,homeY:145,role:'wing',num:11,run:0},
      {x:255,y:410,homeX:255,homeY:410,role:'wing',num:7,run:0},
      {x:135,y:280,homeX:135,homeY:280,role:'mid',num:8,run:0},
      {x:90,y:190,homeX:90,homeY:190,role:'def',num:4,run:0},
      {x:90,y:370,homeX:90,homeY:370,role:'def',num:5,run:0}
    ];
    opponents = [
      {x:465,y:160,homeX:540,homeY:150,num:2}, {x:500,y:400,homeX:540,homeY:410,num:3},
      {x:615,y:265,homeX:640,homeY:260,num:6}, {x:690,y:155,homeX:730,homeY:160,num:8},
      {x:700,y:405,homeX:730,homeY:400,num:11}, {x:810,y:280,homeX:820,homeY:280,num:9}
    ];
    keeperHome = {x:54,y:280,homeX:54,homeY:280,num:1};
    keeperAway = {x:946,y:280,homeX:946,homeY:280,num:1};
  }
  freshTeams();
  function resize(){
    const r=canvas.getBoundingClientRect(); if(!r.width||!r.height)return;
    dpr=Math.min(window.devicePixelRatio||1,2); cw=r.width; ch=r.height;
    canvas.width=Math.round(cw*dpr); canvas.height=Math.round(ch*dpr);
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  }
  new ResizeObserver(resize).observe(canvas); resize();
  function tone(freq=440,duration=.08,type='sine',volume=.035){
    if(!audioOn)return;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch(e){}
  }
  function startGame(){
    if(ended){homeScore=awayScore=shots=tackles=0;elapsed=0;player.x=340;player.y=280;player.stamina=100;freshTeams();ball.owner='player';ball.ownerId=0;ball.x=352;ball.y=280;homeScoreEl.textContent='0';awayScoreEl.textContent='0';ended=false}
    running=true;paused=false;last=performance.now();overlay.classList.add('hidden');pauseBadge.classList.remove('show');document.getElementById('matchStatus').textContent='LIVE · MATCHDAY 08';tone(620,.12,'triangle');
  }
  function pauseGame(){if(!running||ended)return;paused=!paused;pauseBadge.classList.toggle('show',paused);if(!paused)last=performance.now()}
  startButton.addEventListener('click',startGame);
  document.getElementById('pauseButton').addEventListener('click',pauseGame);
  document.getElementById('soundButton').addEventListener('click',()=>{audioOn=!audioOn;document.querySelector('#soundButton span').textContent=audioOn?'SOUND ON':'SOUND OFF';if(audioOn)tone(600,.08)});
  document.getElementById('tableToggle').addEventListener('click',e=>{e.currentTarget.textContent=e.currentTarget.textContent.startsWith('FULL')?'LIVE TABLE ✓':'FULL TABLE ↗';tone(520,.05)});
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys.add(k);if(k===' '&&!e.repeat)shoot();if(k==='j'&&!e.repeat)passBall();if(k==='k'&&!e.repeat)tackle();if(k==='escape'||k==='p')pauseGame();if(k==='enter'&&!running)startGame()});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  const joy=document.getElementById('joystick'),knob=document.getElementById('joyKnob');
  function joyMove(e){if(joystickPointer!==e.pointerId)return;const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=26,len=Math.hypot(dx,dy),scale=len>max?max/len:1;touch.x=dx*scale/max;touch.y=dy*scale/max;knob.style.transform=`translate(${touch.x*24}px,${touch.y*24}px)`}
  joy.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e)});
  joy.addEventListener('pointermove',joyMove);
  function joyEnd(e){if(joystickPointer===e.pointerId){joystickPointer=null;touch.x=touch.y=0;knob.style.transform='translate(0,0)'}}
  joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
  document.querySelectorAll('.action-btn').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(b.dataset.action==='shoot')shoot();if(b.dataset.action==='pass')passBall();if(b.dataset.action==='tackle')tackle()})});
  function nearestTeammate(){let best=null,bd=Infinity;for(const t of teammates){let d=dist(player,t);if(d<bd){bd=d;best=t}}return best}
  function kick(target,power,loft=0){ball.owner=null;ball.ownerId=-1;ball.x=player.x+Math.cos(player.facing)*21;ball.y=player.y+Math.sin(player.facing)*21;let dx=target.x-ball.x,dy=target.y-ball.y,len=Math.hypot(dx,dy)||1;ball.vx=dx/len*power;ball.vy=dy/len*power;ball.height=loft;ball.spin=0;player.hasBall=false}
  function shoot(){if(!running||paused||ended)return;if(ball.owner==='player'||dist(player,ball)<34){shots++;document.getElementById('shotsStat').textContent=String(shots).padStart(2,'0');player.facing=player.facing||0;const goalY=280+(Math.random()-.5)*95;kick({x:1030,y:goalY},690,1);tone(175,.18,'triangle',.065);message='SHOT!';messageTimer=.55}}
  function passBall(){if(!running||paused||ended||!(ball.owner==='player'||dist(player,ball)<32))return;const t=nearestTeammate();if(!t)return;let lead={x:clamp(t.x+Math.max(15,Math.abs(850-t.x)*.18),40,930),y:clamp(t.y+t.vy*.35,40,520)};kick(lead,500,0);tone(330,.07,'sine');message='PASS';messageTimer=.4}
  function tackle(){if(!running||paused||ended)return;let target=null,bd=64;for(const o of opponents){const d=dist(player,o);if(d<bd){bd=d;target=o}}if(target){if(ball.owner==='opponent'||ball.owner===null){ball.owner='player';ball.ownerId=0;player.hasBall=true;ball.vx=ball.vy=0;tackles++;document.getElementById('tacklesStat').textContent=String(tackles).padStart(2,'0');tone(160,.11,'square');message='WIN IT BACK';messageTimer=.7}else{target.x+=38;target.y+=(target.y<player.y?-15:15);tone(120,.07,'square')}}}
  function moveToward(obj,x,y,speed,dt){let dx=x-obj.x,dy=y-obj.y,len=Math.hypot(dx,dy);if(len>1){let step=Math.min(len,speed*dt);obj.x+=dx/len*step;obj.y+=dy/len*step}}
  function goal(home){if(home){homeScore++;homeScoreEl.textContent=homeScore;goalCaption.textContent='S.C. KIRYAT GAT'}else{awayScore++;awayScoreEl.textContent=awayScore;goalCaption.textContent="MACCABI SHA'ARAYIM"}flash.classList.add('show');flashTimer=1.35;tone(home?720:260,.5,'sawtooth',.045);setTimeout(()=>flash.classList.remove('show'),1000);message=home?'WHAT A FINISH!':'THEY FOUND A WAY THROUGH';messageTimer=1.4;player.x=home?340:660;player.y=280;player.hasBall=home;ball.owner=home?'player':'opponent';ball.ownerId=home?0:3;ball.x=player.x+12;ball.y=player.y;ball.vx=ball.vy=0;opponents.forEach(o=>{o.x=o.homeX;o.y=o.homeY});teammates.forEach(t=>{t.x=t.homeX;t.y=t.homeY})}
  function update(dt){if(!running||paused||ended)return;elapsed+=dt;const mins=Math.min(90,Math.floor(elapsed));clockEl.textContent=`${String(mins).padStart(2,'0')}:${String(Math.floor(elapsed%1*60)).padStart(2,'0')}`;if(elapsed>=90){ended=true;running=false;overlay.classList.remove('hidden');overlayTitle.innerHTML=homeScore>awayScore?'A WIN FOR<br><em>KIRYAT GAT</em>':homeScore===awayScore?'POINTS<br><em>SHARED</em>':'THE FIGHT<br><em>GOES ON</em>';overlayText.textContent=homeScore>awayScore?'Three points in the bag. The promotion push is alive.':homeScore===awayScore?'A hard-fought point under the Ramat Gan sun.':'Full time. Regroup, reset, and go again next matchday.';startButton.innerHTML='<span>PLAY AGAIN</span><b>→</b>';document.getElementById('matchStatus').textContent='FULL TIME';return}
    const sprint=keys.has('shift')&&player.stamina>2, speed=sprint?285:205;let ix=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touch.x,iy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touch.y;let il=Math.hypot(ix,iy);if(il>1){ix/=il;iy/=il}if(il>.08){player.facing=Math.atan2(iy,ix);player.x+=ix*speed*dt;player.y+=iy*speed*dt;player.stamina=clamp(player.stamina-(sprint?26:8)*dt,0,100)}else player.stamina=clamp(player.stamina+14*dt,0,100);player.x=clamp(player.x,45,925);player.y=clamp(player.y,43,517);player.vx=ix*speed;player.vy=iy*speed;
    if(ball.owner==='player'){ball.x=player.x+Math.cos(player.facing)*19;ball.y=player.y+Math.sin(player.facing)*14;ball.vx=player.vx*.6;ball.vy=player.vy*.6;player.hasBall=true}else player.hasBall=false;
    if(ball.owner==='opponent'&&ball.ownerId>=0){const carrier=opponents[ball.ownerId%opponents.length];if(carrier){ball.x=carrier.x-17;ball.y=carrier.y; if(carrier.x<240&&Math.random()<dt*.17){ball.owner=null;ball.vx=-570;ball.vy=(280-carrier.y)*.65;ball.x=carrier.x-20;}}}
    // Teammates make supporting runs and recover to a sensible shape.
    teammates.forEach((t,i)=>{let tx=t.homeX+(player.x-340)*(.20+(i<2?.13:0));let ty=t.homeY+(player.y-280)*(i===2?.18:.08);if(ball.owner==='opponent'){tx=t.homeX+45;ty=t.homeY+(ball.y-280)*.14}if(ball.owner===null&&ball.vx>0){tx=t.homeX+65;ty=t.homeY+(ball.y-280)*.10}moveToward(t,clamp(tx,45,800),clamp(ty,45,515),95,dt);t.run+=dt});
    // Opponents pressure the carrier and guard the passing lanes.
    opponents.forEach((o,i)=>{let tx=o.homeX,ty=o.homeY;if(ball.owner==='player'){if(i===2||i===5){tx=player.x+80;ty=player.y+(i===5?0:20)}else{tx=o.homeX+(player.x-500)*.23;ty=o.homeY+(player.y-280)*.19}}else if(ball.owner==='opponent'){tx=Math.min(880,o.homeX+45);ty=o.homeY+(ball.y-280)*.12}else if(ball.owner===null){let d=dist(o,ball);if(d<190){tx=ball.x+(ball.vx>0?75:-35);ty=ball.y+(o.y<ball.y?-24:24)}}moveToward(o,tx,ty,80,dt)});
    moveToward(keeperAway,clamp(930+(ball.x-850)*.12,915,960),clamp(ball.y,230,330),110,dt);moveToward(keeperHome,clamp(70+(ball.x-150)*.09,40,85),clamp(ball.y,230,330),100,dt);
    if(ball.owner===null){ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.vx*=Math.pow(.985,dt*60);ball.vy*=Math.pow(.985,dt*60);ball.height=Math.max(0,ball.height-dt*1.35);if(ball.x>850&&Math.abs(ball.y-280)<58&&dist(ball,keeperAway)<34&&ball.vx>0){ball.vx=-Math.abs(ball.vx)*.58;ball.vy+=(ball.y-280)*1.5;ball.x=keeperAway.x-26;tone(105,.14,'square')}if(ball.x<150&&Math.abs(ball.y-280)<58&&dist(ball,keeperHome)<34&&ball.vx<0){ball.vx=Math.abs(ball.vx)*.58;ball.x=keeperHome.x+25;tone(105,.14,'square')}
      if(ball.x>990&&Math.abs(ball.y-280)<70)goal(true);else if(ball.x<10&&Math.abs(ball.y-280)<70)goal(false);else{if(ball.x>1000||ball.x<0){ball.vx*=-.6;ball.x=clamp(ball.x,8,992)}if(ball.y<25||ball.y>535){ball.vy*=-.75;ball.y=clamp(ball.y,26,534)}if(Math.hypot(ball.vx,ball.vy)<16){ball.vx=ball.vy=0;let close=player,bd=dist(player,ball);for(const t of teammates){let d=dist(t,ball);if(d<bd){close=t;bd=d}}for(const o of opponents){let d=dist(o,ball);if(d<bd){close=o;bd=d}}if(bd<30){if(close===player){ball.owner='player';ball.ownerId=0}else if(teammates.includes(close)){ball.owner='teammate';ball.ownerId=teammates.indexOf(close)}else{ball.owner='opponent';ball.ownerId=opponents.indexOf(close)}}}}
    }else if(ball.owner==='teammate'){const t=teammates[ball.ownerId];if(t){ball.x=t.x+18;ball.y=t.y;if(Math.random()<dt*.6&&t.x<790){let target=opponents[5];ball.owner=null;ball.vx=500;ball.vy=(target.y-t.y)*.45;tone(300,.06)}}}
    if(ball.owner==='opponent'){const oi=opponents[ball.ownerId]||opponents[2];if(dist(player,oi)<34&&Math.random()<dt*1.1){ball.owner='player';ball.ownerId=0;tackles++;document.getElementById('tacklesStat').textContent=String(tackles).padStart(2,'0');message='BALL WON';messageTimer=.6}}
    if(ball.owner==='player'&&Math.random()<dt*.045){const o=opponents.find(o=>dist(o,player)<30);if(o&&Math.random()<.32){ball.owner='opponent';ball.ownerId=opponents.indexOf(o);tone(115,.08,'square')}}
    possession=clamp(50+Math.round((homeScore-awayScore)*4+(ball.owner==='player'||ball.owner==='teammate'?8:ball.owner==='opponent'?-8:0)),28,72);document.getElementById('possessionStat').textContent=possession+'%';if(messageTimer>0)messageTimer-=dt;
  }
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function drawField(){
    ctx.clearRect(0,0,W,H);
    // Stands and shadow beyond the touchline
    ctx.fillStyle='#19271d';ctx.fillRect(0,0,W,H);
    for(let i=0;i<36;i++){ctx.fillStyle=i%3===0?'#344337':'#28382d';ctx.fillRect(i*29,4,22,18);ctx.fillRect(i*29,538,22,18)}
    ctx.fillStyle='#b8a77c';ctx.fillRect(0,25,W,11);ctx.fillRect(0,524,W,11);
    ctx.fillStyle='#307747';ctx.fillRect(22,37,956,486);
    // alternating manicured stripes
    for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#347d4a':'#39834e';ctx.fillRect(22+i*95.6,37,95.7,486)}
    // subtle lighting
    let grad=ctx.createLinearGradient(0,37,0,523);grad.addColorStop(0,'#ffffff08');grad.addColorStop(.5,'#00000000');grad.addColorStop(1,'#03100919');ctx.fillStyle=grad;ctx.fillRect(22,37,956,486);
    ctx.strokeStyle='#e7f2dcbd';ctx.lineWidth=2;ctx.strokeRect(36,51,928,458);ctx.beginPath();ctx.moveTo(500,51);ctx.lineTo(500,509);ctx.stroke();ctx.beginPath();ctx.arc(500,280,69,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#edf5e6';ctx.beginPath();ctx.arc(500,280,3,0,Math.PI*2);ctx.fill();
    // penalty boxes and six-yard boxes
    ctx.strokeRect(36,154,139,252);ctx.strokeRect(36,218,49,124);ctx.strokeRect(825,154,139,252);ctx.strokeRect(915,218,49,124);
    ctx.beginPath();ctx.arc(145,280,3,0,Math.PI*2);ctx.arc(855,280,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(145,280,69,-.87,.87);ctx.stroke();ctx.beginPath();ctx.arc(855,280,69,Math.PI-.87,Math.PI+.87);ctx.stroke();
    // goal mouths with net mesh
    ctx.fillStyle='#d5dfc9';ctx.fillRect(19,235,17,90);ctx.fillRect(964,235,17,90);ctx.strokeStyle='#e7f2dc55';ctx.lineWidth=1;for(let y=240;y<324;y+=10){ctx.beginPath();ctx.moveTo(19,y);ctx.lineTo(36,y);ctx.moveTo(964,y);ctx.lineTo(981,y);ctx.stroke()}
    // corner arcs
    ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(36,51,12,0,Math.PI/2);ctx.arc(964,51,12,Math.PI/2,Math.PI);ctx.arc(36,509,12,-Math.PI/2,0);ctx.arc(964,509,12,Math.PI,Math.PI*1.5);ctx.stroke();
  }
  function drawPlayer(p,team,num,isControlled=false,keeper=false){
    // cast shadow
    ctx.fillStyle='#07110b66';ctx.beginPath();ctx.ellipse(p.x+2,p.y+9,13,6,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(p.x,p.y);
    if(isControlled){ctx.strokeStyle='#d9ff9b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,10,16,6,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d9ff9b';ctx.beginPath();ctx.moveTo(-4,-14);ctx.lineTo(4,-14);ctx.lineTo(0,-20);ctx.closePath();ctx.fill()}
    ctx.fillStyle=keeper?'#f0bd42':team==='home'?'#d3f37d':'#ebf0e2';ctx.beginPath();ctx.ellipse(0,1,11,14,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=team==='home'?'#376743':team==='away'?'#c83239':'#b77f14';ctx.fillRect(-10,-5,20,10);
    ctx.fillStyle='#dfb08b';ctx.beginPath();ctx.arc(0,-13,6.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#253027';ctx.fillRect(-9,12,6,7);ctx.fillRect(3,12,6,7);
    ctx.fillStyle='#f6f5e9';ctx.font='700 7px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(num),0,1);
    ctx.restore();
  }
  function drawBall(){ctx.save();ctx.fillStyle='#07110a55';ctx.beginPath();ctx.ellipse(ball.x+3,ball.y+5,7,3,0,0,Math.PI*2);ctx.fill();ctx.translate(ball.x,ball.y-ball.height*14);ctx.fillStyle='#f2f1e7';ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#26352a';ctx.beginPath();ctx.arc(-1,-1,2.4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(3,2,1.3,0,Math.PI*2);ctx.fill();ctx.restore()}
  function draw(){drawField(); // subtle stadium floodlights
    for(const x of [115,885]){const g=ctx.createRadialGradient(x,48,5,x,48,165);g.addColorStop(0,'#fff6ca12');g.addColorStop(1,'#fff6ca00');ctx.fillStyle=g;ctx.fillRect(x-165,35,330,210)}
    teammates.forEach((p,i)=>drawPlayer(p,'home',p.num));opponents.forEach((p,i)=>drawPlayer(p,'away',p.num));drawPlayer(keeperHome,'home',1,false,true);drawPlayer(keeperAway,'away',1,false,true);drawPlayer(player,'home',10,true);drawBall();
    // stamina and shot feedback
    if(running){ctx.fillStyle='#07160bb8';roundedRect(43,54,102,17,4);ctx.fillStyle='#eaf3e4';ctx.font='800 8px sans-serif';ctx.textAlign='left';ctx.fillText('10  ·  STRIKER',50,66);ctx.fillStyle='#36523a';roundedRect(50,72,65,3,2);ctx.fillStyle='#b9ef58';roundedRect(50,72,65*player.stamina/100,3,2)}
    if(messageTimer>0&&message){ctx.save();ctx.font='900 22px Impact, sans-serif';ctx.textAlign='center';ctx.fillStyle='#102114bb';roundedRect(420,65,160,40,5);ctx.fillStyle='#eaf6db';ctx.fillText(message,500,92);ctx.restore()}
  }
  function loop(now){const dt=Math.min(.05,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(loop)}
  last=performance.now();requestAnimationFrame(loop);
})();