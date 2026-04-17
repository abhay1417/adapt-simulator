/* ═══════════════════════════════════════════════════════════════
   ADAPT — Spatial Orientation Module
   ═══════════════════════════════════════════════════════════════ */

const SpatialModule = (() => {

  const DURATION = 90;
  let state = {};
  let countdownInterval = null;
  let feedbackTimeout   = null;

  const $id = id => document.getElementById(id);

  function reset() {
    state = { running:false,timeLeft:DURATION,score:0,correct:0,total:0,streak:0,maxStreak:0,waitingAnswer:false,currentQuestion:null };
  }

  const BANK_LABELS  = { '-60':'Sharp left bank (60°)','-30':'Moderate left bank (30°)','-15':'Slight left bank (15°)','0':'Wings level','15':'Slight right bank (15°)','30':'Moderate right bank (30°)','60':'Sharp right bank (60°)' };
  const PITCH_LABELS = { '-20':'Nose-down (descending)','-10':'Slight nose-down','0':'Level pitch','10':'Slight nose-up','20':'Nose-up (climbing)' };
  const rnd = arr => arr[Math.floor(Math.random()*arr.length)];

  function generateQuestion(){
    const bankVals=[-60,-30,-15,0,15,30,60], pitchVals=[-20,-10,0,10,20];
    const bank=rnd(bankVals), pitch=rnd(pitchVals);
    const correct=BANK_LABELS[bank]+' / '+PITCH_LABELS[pitch];
    const dis=new Set();
    while(dis.size<3){const b=rnd(bankVals),p=rnd(pitchVals),l=BANK_LABELS[b]+' / '+PITCH_LABELS[p];if(l!==correct)dis.add(l);}
    return {bank,pitch,correctLabel:correct,choices:[correct,...dis].sort(()=>Math.random()-0.5)};
  }

  function drawAircraft(bank,pitch){
    const cvs=$id('sp-canvas');if(!cvs)return;
    const ctx=cvs.getContext('2d'),W=cvs.width,H=cvs.height;
    const dark=document.documentElement.getAttribute('data-theme')!=='light';
    const bgCol=dark?'#0d1524':'#dde5f5';
    ctx.clearRect(0,0,W,H);ctx.fillStyle=bgCol;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.translate(W/2,H/2);ctx.rotate((bank*Math.PI)/180);
    const po=pitch*3,hStart=-po;
    ctx.beginPath();ctx.rect(-W,-H+hStart,W*2,H);ctx.fillStyle=dark?'rgba(0,100,180,0.2)':'rgba(100,180,255,0.2)';ctx.fill();
    ctx.beginPath();ctx.rect(-W,hStart,W*2,H);ctx.fillStyle=dark?'rgba(139,90,43,0.3)':'rgba(180,120,60,0.2)';ctx.fill();
    ctx.beginPath();ctx.moveTo(-W,hStart);ctx.lineTo(W,hStart);ctx.strokeStyle=dark?'#ffd600':'#cc8800';ctx.lineWidth=2;ctx.stroke();
    ctx.strokeStyle=dark?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.2)';ctx.lineWidth=1;
    [-20,-10,10,20].forEach(p=>{const y=hStart-p*3;ctx.beginPath();ctx.moveTo(-40,y);ctx.lineTo(40,y);ctx.stroke();});
    ctx.restore();
    ctx.save();ctx.translate(W/2,H/2);
    const arcR=110;
    ctx.strokeStyle=dark?'#00e5ff':'#0088ff';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(0,0,arcR,Math.PI,0,false);ctx.stroke();
    [-60,-45,-30,-15,0,15,30,45,60].forEach(angle=>{
      const a=((angle-90)*Math.PI)/180,inner=angle%30===0?arcR-10:arcR-6;
      ctx.beginPath();ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);ctx.lineTo(Math.cos(a)*arcR,Math.sin(a)*arcR);
      ctx.strokeStyle=dark?'rgba(0,229,255,0.5)':'rgba(0,100,200,0.4)';ctx.lineWidth=angle%30===0?2:1;ctx.stroke();
    });
    ctx.save();ctx.rotate((bank*Math.PI)/180);
    ctx.beginPath();ctx.moveTo(0,-arcR+14);ctx.lineTo(-6,-arcR+4);ctx.lineTo(6,-arcR+4);ctx.closePath();
    ctx.fillStyle='#ffd600';ctx.fill();ctx.restore();
    ctx.lineWidth=3;ctx.strokeStyle=dark?'#00aaff':'#0055cc';ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(0,-30);ctx.lineTo(0,30);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-70,5);ctx.lineTo(-10,0);ctx.moveTo(10,0);ctx.lineTo(70,5);ctx.stroke();
    ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(-70,5);ctx.lineTo(-60,-5);ctx.moveTo(70,5);ctx.lineTo(60,-5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-25,25);ctx.lineTo(0,18);ctx.lineTo(25,25);ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fillStyle=dark?'#00e5ff':'#0088ff';ctx.fill();
    ctx.restore();
  }

  function showQuestion(){
    if(!state.running) return;
    const q=generateQuestion();
    state.currentQuestion=q;state.waitingAnswer=true;state.total++;
    $id('sp-qnum').textContent=state.total;$id('sp-score').textContent=state.score;
    $id('sp-correct').textContent=state.correct;$id('sp-streak').textContent=state.streak;
    $id('sp-feedback').textContent='';$id('sp-feedback').style.color='';
    drawAircraft(q.bank,q.pitch);
    const optsEl=$id('sp-options');optsEl.innerHTML='';
    q.choices.forEach(choice=>{
      const btn=document.createElement('button');
      btn.className='sp-opt';btn.textContent=choice;
      btn.addEventListener('click',()=>answerSpatial(choice,btn,q));
      optsEl.appendChild(btn);
    });
  }

  function answerSpatial(chosen,btn,q){
    if(!state.waitingAnswer||!state.running) return;
    state.waitingAnswer=false;
    clearTimeout(feedbackTimeout);
    const ok=chosen===q.correctLabel;
    if(ok){
      const pts=Math.max(5,20-Math.floor((Date.now()-state._qStart)/1000));
      state.score+=pts;state.correct++;state.streak++;
      if(state.streak>state.maxStreak)state.maxStreak=state.streak;
      btn.classList.add('correct');
      $id('sp-feedback').textContent=`✓ Correct! +${pts}`;$id('sp-feedback').style.color='#00ff88';
      ADAPTAudio.playCorrect();
    } else {
      state.streak=0;
      btn.classList.add('wrong');
      $id('sp-options').querySelectorAll('.sp-opt').forEach(b=>{if(b.textContent===q.correctLabel)b.classList.add('correct');});
      $id('sp-feedback').textContent='✗ Incorrect';$id('sp-feedback').style.color='#ff3c3c';
      ADAPTAudio.playWrong();
    }
    $id('sp-qnum').textContent=state.total;$id('sp-score').textContent=state.score;
    $id('sp-correct').textContent=state.correct;$id('sp-streak').textContent=state.streak;
    feedbackTimeout=setTimeout(()=>{if(state.running)showQuestion();},1200);
  }

  function startCountdown(){
    countdownInterval=setInterval(()=>{
      if(!state.running){clearInterval(countdownInterval);return;}
      state.timeLeft--;
      const el=$id('sp-timer'),m=Math.floor(state.timeLeft/60),s=state.timeLeft%60;
      el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      el.className='module-timer';
      if(state.timeLeft<=10){el.classList.add('danger');ADAPTAudio.playCountdown();}
      else if(state.timeLeft<=20)el.classList.add('warning');
      if(state.timeLeft<=0){clearInterval(countdownInterval);endTest();}
    },1000);
  }

  function start(){
    reset();state.running=true;state._qStart=Date.now();
    $id('sp-intro').classList.add('hidden');$id('sp-arena').classList.remove('hidden');$id('sp-result').classList.add('hidden');
    document.getElementById('status-dot').className='status-dot active';
    document.getElementById('status-label').textContent='SPATIAL';
    showQuestion();startCountdown();
  }

  function endTest(){
    state.running=false;clearTimeout(feedbackTimeout);clearInterval(countdownInterval);
    document.getElementById('status-dot').className='status-dot';
    document.getElementById('status-label').textContent='READY';
    const accuracy=state.total>0?Math.round(state.correct/state.total*100):0;
    ADAPTStorage.addScore('spatial',{score:state.score,accuracy,correct:state.correct,total:state.total,maxStreak:state.maxStreak});
    const rEl=$id('sp-result'),color=accuracy>=75?'#00ff88':accuracy>=55?'#ffd600':'#ff3c3c';
    rEl.classList.remove('hidden');
    rEl.innerHTML=`
      <div class="result-score" style="color:${color}">${accuracy}%</div>
      <div class="result-label">Spatial Accuracy</div>
      <div class="result-breakdown">
        <div class="result-item"><div class="r-label">Score</div><div class="r-val">${state.score} pts</div></div>
        <div class="result-item"><div class="r-label">Correct</div><div class="r-val">${state.correct}/${state.total}</div></div>
        <div class="result-item"><div class="r-label">Max Streak</div><div class="r-val">${state.maxStreak}</div></div>
      </div>
      <button class="btn-primary" id="sp-retry-btn">Try Again</button>`;
    $id('sp-retry-btn').addEventListener('click',()=>{
      rEl.classList.add('hidden');$id('sp-intro').classList.remove('hidden');$id('sp-arena').classList.add('hidden');
      $id('sp-timer').textContent='01:30';$id('sp-timer').className='module-timer';
    });
    $id('sp-arena').classList.add('hidden');
    if(window.DashboardModule) window.DashboardModule.refresh();
  }

  function init(){ $id('sp-start-btn').addEventListener('click',start); }
  return { init };
})();
