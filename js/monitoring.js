/* ═══════════════════════════════════════════════════════════════
   ADAPT — Instrument Monitoring Module
   ═══════════════════════════════════════════════════════════════ */

const MonitoringModule = (() => {

  const DURATION = 120;
  let state = {};
  let countdownInterval = null;
  let anomalyScheduler  = null;
  let rafIds = {};

  const $id = id => document.getElementById(id);

  const INSTRUMENTS = {
    altitude: { min:0,max:15000,normalMin:2000,normalMax:8000,unit:'ft',current:5000,target:5000,velocity:0,canvas:'canvas-altitude',valueEl:'val-altitude',flashEl:'flash-altitude',gaugeEl:'gauge-altitude',color:'#00aaff',format:v=>Math.round(v).toLocaleString()+' ft' },
    airspeed: { min:0,max:400,normalMin:120,normalMax:280,unit:'kts',current:200,target:200,velocity:0,canvas:'canvas-airspeed',valueEl:'val-airspeed',flashEl:'flash-airspeed',gaugeEl:'gauge-airspeed',color:'#ff8800',format:v=>Math.round(v)+' kts' },
    heading:  { min:0,max:360,normalMin:null,normalMax:null,unit:'°',current:90,target:90,velocity:0,canvas:'canvas-heading',valueEl:'val-heading',flashEl:'flash-heading',gaugeEl:'gauge-heading',color:'#aa44ff',format:v=>Math.round(v).toString().padStart(3,'0')+'°' },
    vspeed:   { min:-2000,max:2000,normalMin:-500,normalMax:500,unit:'fpm',current:0,target:0,velocity:0,canvas:'canvas-vspeed',valueEl:'val-vspeed',flashEl:'flash-vspeed',gaugeEl:'gauge-vspeed',color:'#00ff88',format:v=>(v>=0?'+':'')+Math.round(v)+' fpm' },
  };
  const WARNING_LIGHTS = ['STALL','OIL PRES','FUEL LOW','FIRE ENG','PITOT HEAT','DOOR OPEN'];

  function reset() {
    state = { running:false,timeLeft:DURATION,anomaliesTotal:0,anomaliesCaught:0,anomaliesMissed:0,activeAnomalies:{},activeWarnings:{},catchTimes:[] };
    Object.values(INSTRUMENTS).forEach(inst => { inst.current=(inst.normalMin!==null)?(inst.normalMin+inst.normalMax)/2:90;inst.target=inst.current;inst.velocity=0; });
  }

  function drawGauge(name) {
    const inst=INSTRUMENTS[name], cvs=$id(inst.canvas);
    if(!cvs) return;
    const ctx=cvs.getContext('2d'), W=cvs.width,H=cvs.height,cx=W/2,cy=H/2,R=W/2-12;
    const dark=document.documentElement.getAttribute('data-theme')!=='light';
    ctx.clearRect(0,0,W,H);
    ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);
    ctx.fillStyle=dark?'#0d1524':'#dde5f5';ctx.fill();
    ctx.strokeStyle=dark?'#1e3050':'#aabbd8';ctx.lineWidth=2;ctx.stroke();
    const sa=Math.PI*0.75,ea=Math.PI*2.25,ta=ea-sa,range=inst.max-inst.min;
    if(inst.normalMin!==null){
      const ns=sa+((inst.normalMin-inst.min)/range)*ta,ne=sa+((inst.normalMax-inst.min)/range)*ta;
      ctx.beginPath();ctx.arc(cx,cy,R-6,ns,ne);ctx.strokeStyle='rgba(0,255,136,0.3)';ctx.lineWidth=8;ctx.stroke();
    }
    ctx.lineWidth=1;
    for(let i=0;i<=10;i++){
      const angle=sa+(i/10)*ta,inner=i%5===0?R-16:R-10;
      ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*inner,cy+Math.sin(angle)*inner);ctx.lineTo(cx+Math.cos(angle)*(R-4),cy+Math.sin(angle)*(R-4));
      ctx.strokeStyle=dark?'#e8f0ff':'#0a1530';ctx.lineWidth=i%5===0?2:1;ctx.stroke();
    }
    const norm=(inst.current-inst.min)/range,na=sa+norm*ta;
    const isAnom=name!=='heading'&&inst.normalMin!==null&&(inst.current<inst.normalMin||inst.current>inst.normalMax);
    ctx.save();ctx.translate(cx,cy);ctx.rotate(na);
    ctx.beginPath();ctx.moveTo(-4,8);ctx.lineTo(0,-(R-18));ctx.lineTo(4,8);ctx.closePath();
    ctx.fillStyle=isAnom?'#ff3c3c':inst.color;ctx.fill();ctx.restore();
    ctx.beginPath();ctx.arc(cx,cy,6,0,Math.PI*2);ctx.fillStyle=inst.color;ctx.fill();
    if(name==='heading'){
      const letters={0:'N',90:'E',180:'S',270:'W'};
      ctx.font='bold 11px Orbitron,sans-serif';ctx.fillStyle=dark?'#e8f0ff':'#0a1530';
      ctx.textAlign='center';ctx.textBaseline='middle';
      Object.entries(letters).forEach(([deg,letter])=>{
        const a=sa+(deg/360)*ta,lr=R-22;
        ctx.fillText(letter,cx+Math.cos(a)*lr,cy+Math.sin(a)*lr);
      });
    }
    const valEl=$id(inst.valueEl);if(valEl)valEl.textContent=inst.format(inst.current);
  }

  function drawAllGauges(){Object.keys(INSTRUMENTS).forEach(drawGauge);}

  function updateInstruments(){
    if(!state.running) return;
    Object.entries(INSTRUMENTS).forEach(([name,inst])=>{
      const diff=inst.target-inst.current;
      inst.velocity=inst.velocity*0.85+diff*0.02;
      inst.current+=inst.velocity;
      inst.current=Math.max(inst.min,Math.min(inst.max,inst.current));
      drawGauge(name);
    });
    rafIds.instruments=requestAnimationFrame(updateInstruments);
  }

  function scheduleAnomaly(){
    if(!state.running) return;
    anomalyScheduler=setTimeout(()=>{if(state.running)triggerAnomaly();},4000+Math.random()*6000);
  }

  function triggerAnomaly(){
    if(Math.random()<0.6){
      const candidates=Object.keys(INSTRUMENTS).filter(n=>INSTRUMENTS[n].normalMin!==null&&!state.activeAnomalies[n]);
      if(!candidates.length){scheduleAnomaly();return;}
      const name=candidates[Math.floor(Math.random()*candidates.length)],inst=INSTRUMENTS[name];
      const above=Math.random()<0.5;
      if(above)inst.target=inst.normalMax+(inst.max-inst.normalMax)*(0.3+Math.random()*0.5);
      else inst.target=inst.normalMin-(inst.normalMin-inst.min)*(0.3+Math.random()*0.5);
      state.anomaliesTotal++;state.activeAnomalies[name]={startTime:Date.now(),caught:false};
      $id(INSTRUMENTS[name].flashEl).classList.remove('hidden');
      $id(INSTRUMENTS[name].gaugeEl).classList.add('anomaly');
      ADAPTAudio.playWarning();
      setTimeout(()=>{if(state.activeAnomalies[name]&&!state.activeAnomalies[name].caught&&state.running){state.anomaliesMissed++;clearAnomaly(name);updateStats();}},3000);
    } else {
      const free=WARNING_LIGHTS.filter(w=>!state.activeWarnings[w]);
      if(!free.length){scheduleAnomaly();return;}
      const warnId=free[Math.floor(Math.random()*free.length)];
      state.anomaliesTotal++;state.activeWarnings[warnId]={startTime:Date.now(),caught:false};
      const lightEl=document.querySelector(`.warn-light[data-warn="${warnId}"]`);
      if(lightEl)lightEl.classList.add('active');
      ADAPTAudio.playAlert();
      setTimeout(()=>{if(state.activeWarnings[warnId]&&!state.activeWarnings[warnId].caught&&state.running){state.anomaliesMissed++;clearWarning(warnId);updateStats();}},4000);
    }
    updateStats(); scheduleAnomaly();
  }

  function clearAnomaly(name){
    delete state.activeAnomalies[name];
    const inst=INSTRUMENTS[name];
    inst.target=(inst.normalMin+inst.normalMax)/2;
    $id(inst.flashEl).classList.add('hidden');
    $id(inst.gaugeEl).classList.remove('anomaly','clicked-ok');
  }

  function clearWarning(warnId){
    delete state.activeWarnings[warnId];
    const el=document.querySelector(`.warn-light[data-warn="${warnId}"]`);
    if(el){el.classList.remove('active','acknowledged');}
  }

  function handleGaugeClick(name){
    if(!state.running||!state.activeAnomalies[name]) return;
    const ct=Date.now()-state.activeAnomalies[name].startTime;
    state.catchTimes.push(ct); state.anomaliesCaught++;
    state.activeAnomalies[name].caught=true;
    clearAnomaly(name);
    $id(INSTRUMENTS[name].gaugeEl).classList.add('clicked-ok');
    setTimeout(()=>$id(INSTRUMENTS[name].gaugeEl).classList.remove('clicked-ok'),800);
    ADAPTAudio.playSuccess(); updateStats();
  }

  function handleWarningClick(warnId){
    if(!state.running||!state.activeWarnings[warnId]) return;
    const ct=Date.now()-state.activeWarnings[warnId].startTime;
    state.catchTimes.push(ct); state.anomaliesCaught++;
    state.activeWarnings[warnId].caught=true;
    const el=document.querySelector(`.warn-light[data-warn="${warnId}"]`);
    if(el){el.classList.remove('active');el.classList.add('acknowledged');}
    setTimeout(()=>clearWarning(warnId),1000);
    ADAPTAudio.playSuccess(); updateStats();
  }

  function updateStats(){
    $id('im-total').textContent=state.anomaliesTotal;
    $id('im-caught').textContent=state.anomaliesCaught;
    $id('im-missed').textContent=state.anomaliesMissed;
    $id('im-accuracy').textContent=state.anomaliesTotal>0?Math.round(state.anomaliesCaught/state.anomaliesTotal*100)+'%':'—';
  }

  function buildWarningPanel(){
    const grid=$id('warning-lights');if(!grid) return;
    grid.innerHTML='';
    WARNING_LIGHTS.forEach(w=>{
      const div=document.createElement('div');
      div.className='warn-light'; div.dataset.warn=w; div.textContent=w;
      div.addEventListener('click',()=>handleWarningClick(w));
      grid.appendChild(div);
    });
  }

  function startCountdown(){
    countdownInterval=setInterval(()=>{
      if(!state.running){clearInterval(countdownInterval);return;}
      state.timeLeft--;
      const el=$id('im-timer'),m=Math.floor(state.timeLeft/60),s=state.timeLeft%60;
      el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      el.className='module-timer';
      if(state.timeLeft<=10){el.classList.add('danger');ADAPTAudio.playCountdown();}
      else if(state.timeLeft<=30)el.classList.add('warning');
      if(state.timeLeft<=0){clearInterval(countdownInterval);endTest();}
    },1000);
  }

  function start(){
    reset(); state.running=true;
    $id('im-intro').classList.add('hidden');
    $id('im-arena').classList.remove('hidden');
    $id('im-result').classList.add('hidden');
    document.getElementById('status-dot').className='status-dot active';
    document.getElementById('status-label').textContent='MONITORING';
    buildWarningPanel(); drawAllGauges();
    Object.keys(INSTRUMENTS).forEach(name=>{
      const el=$id(INSTRUMENTS[name].gaugeEl);
      if(el&&!el.dataset.listenerAdded){
        el.dataset.listenerAdded='true';
        el.addEventListener('click',()=>handleGaugeClick(name));
      }
    });
    updateInstruments(); scheduleAnomaly(); startCountdown();
  }

  function endTest(){
    state.running=false;
    cancelAnimationFrame(rafIds.instruments);
    clearTimeout(anomalyScheduler); clearInterval(countdownInterval);
    document.getElementById('status-dot').className='status-dot';
    document.getElementById('status-label').textContent='READY';
    const accuracy=state.anomaliesTotal>0?Math.round(state.anomaliesCaught/state.anomaliesTotal*100):0;
    const avgCT=state.catchTimes.length>0?Math.round(state.catchTimes.reduce((a,b)=>a+b,0)/state.catchTimes.length):null;
    ADAPTStorage.addScore('monitoring',{accuracy,avgCatchTime:avgCT,caught:state.anomaliesCaught,missed:state.anomaliesMissed,total:state.anomaliesTotal});
    const rEl=$id('im-result'),color=accuracy>=75?'#00ff88':accuracy>=55?'#ffd600':'#ff3c3c';
    rEl.classList.remove('hidden');
    rEl.innerHTML=`
      <div class="result-score" style="color:${color}">${accuracy}%</div>
      <div class="result-label">Monitoring Accuracy</div>
      <div class="result-breakdown">
        <div class="result-item"><div class="r-label">Caught</div><div class="r-val">${state.anomaliesCaught}/${state.anomaliesTotal}</div></div>
        <div class="result-item"><div class="r-label">Missed</div><div class="r-val">${state.anomaliesMissed}</div></div>
        ${avgCT?`<div class="result-item"><div class="r-label">Avg React</div><div class="r-val">${avgCT}ms</div></div>`:''}
      </div>
      <button class="btn-primary" id="im-retry-btn">Try Again</button>`;
    $id('im-retry-btn').addEventListener('click',()=>{
      rEl.classList.add('hidden');$id('im-intro').classList.remove('hidden');$id('im-arena').classList.add('hidden');
      $id('im-timer').textContent='02:00';$id('im-timer').className='module-timer';
    });
    $id('im-arena').classList.add('hidden');
    if(window.DashboardModule) window.DashboardModule.refresh();
  }

  function init(){ $id('im-start-btn').addEventListener('click',start); }
  return { init };
})();
