/* ═══════════════════════════════════════════════════════════════
   ADAPT — Memory Sequence Module
   ═══════════════════════════════════════════════════════════════ */

const MemoryModule = (() => {

  const DURATION = 120, MAX_LIVES = 3;
  const SYMBOLS = ['1','2','3','4','5','6','7','8','9','A','B','C','D','E'];
  let state = {};
  let countdownInterval = null;
  let showTimeout       = null;

  const $id = id => document.getElementById(id);

  function reset() {
    state = { running:false,timeLeft:DURATION,level:1,seqLength:3,score:0,lives:MAX_LIVES,sequence:[],userInput:[],phase:'idle',maxLength:3 };
  }

  function updateStats(){
    $id('mem-level').textContent=state.level;
    $id('mem-length').textContent=state.seqLength;
    $id('mem-score').textContent=state.score;
    $id('mem-lives').textContent='❤'.repeat(state.lives)+'🖤'.repeat(MAX_LIVES-state.lives);
  }

  function generateSequence(){
    const seq=[];
    for(let i=0;i<state.seqLength;i++) seq.push(SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)]);
    return seq;
  }

  function renderSequenceDisplay(items,visible){
    const el=$id('mem-seq-display');if(!el)return;
    el.innerHTML='';
    items.forEach((sym,i)=>{
      const div=document.createElement('div');
      div.className='mem-item'+(visible?'':' hidden-item');
      div.textContent=visible?sym:'?';
      div.style.animationDelay=`${i*0.1}s`;
      el.appendChild(div);
    });
  }

  function flashSequence(seq,onDone){
    const el=$id('mem-seq-display');if(!el)return;
    el.innerHTML='';
    seq.forEach(sym=>{
      const div=document.createElement('div');div.className='mem-item hidden-item';div.textContent=sym;
      el.appendChild(div);
    });
    $id('mem-phase-label').textContent='Memorize the sequence…';
    $id('mem-input-grid').style.display='none';
    $id('mem-entered').textContent='';
    $id('mem-clear-btn').style.display='none';
    $id('mem-submit-btn').style.display='none';
    let i=0;const items=el.querySelectorAll('.mem-item');
    function showNext(){
      if(!state.running) return;
      if(i>0)items[i-1].classList.remove('highlight');
      if(i<items.length){
        items[i].classList.remove('hidden-item');items[i].classList.add('highlight');
        ADAPTAudio.playTick();i++;
        showTimeout=setTimeout(showNext,Math.max(300,700-state.level*30));
      } else {
        showTimeout=setTimeout(()=>{
          if(!state.running) return;
          items.forEach(it=>{it.classList.remove('highlight');it.classList.add('hidden-item');it.textContent='?';});
          showTimeout=setTimeout(onDone,400);
        },600);
      }
    }
    showTimeout=setTimeout(showNext,300);
  }

  function buildInputGrid(){
    const grid=$id('mem-input-grid');if(!grid)return;
    grid.innerHTML='';
    const all=[...new Set([...state.sequence,...SYMBOLS.slice(0,9)])];
    all.sort(()=>Math.random()-0.5).slice(0,12).forEach(sym=>{
      const btn=document.createElement('button');btn.className='mem-key';btn.textContent=sym;
      btn.addEventListener('click',()=>handleInput(sym));grid.appendChild(btn);
    });
  }

  function handleInput(sym){
    if(state.phase!=='recall'||!state.running) return;
    state.userInput.push(sym);$id('mem-entered').textContent=state.userInput.join(' ');ADAPTAudio.playTick();
    if(state.userInput.length>=state.sequence.length) submitAnswer();
  }

  function submitAnswer(){
    if(state.phase!=='recall') return;
    state.phase='feedback';
    $id('mem-input-grid').style.display='none';$id('mem-clear-btn').style.display='none';$id('mem-submit-btn').style.display='none';
    const ok=state.userInput.join('')===state.sequence.join('');
    if(ok){
      const pts=state.seqLength*10+(state.level-1)*5;state.score+=pts;state.level++;
      state.seqLength=Math.min(9,state.seqLength+1);
      if(state.seqLength>state.maxLength)state.maxLength=state.seqLength;
      $id('mem-feedback').textContent=`✓ Correct! +${pts} pts`;$id('mem-feedback').style.color='#00ff88';
      ADAPTAudio.playSuccess();renderSequenceDisplay(state.sequence,true);
    } else {
      state.lives--;
      $id('mem-feedback').textContent='✗ Incorrect! Was: '+state.sequence.join(' ');$id('mem-feedback').style.color='#ff3c3c';
      ADAPTAudio.playError();renderSequenceDisplay(state.sequence,true);
      if(state.lives<=0){updateStats();setTimeout(()=>endTest(),2000);return;}
    }
    updateStats();
    showTimeout=setTimeout(()=>{if(state.running){$id('mem-feedback').textContent='';startRound();}},2000);
  }

  function startRound(){
    if(!state.running) return;
    state.sequence=generateSequence();state.userInput=[];state.phase='show';updateStats();
    flashSequence(state.sequence,()=>{
      if(!state.running) return;
      state.phase='recall';
      $id('mem-phase-label').textContent='Recall the sequence!';
      $id('mem-input-grid').style.display='flex';
      $id('mem-clear-btn').style.display='inline-block';
      $id('mem-submit-btn').style.display='inline-block';
      $id('mem-entered').textContent='';
      buildInputGrid();renderSequenceDisplay(state.sequence,false);
    });
  }

  function startCountdown(){
    countdownInterval=setInterval(()=>{
      if(!state.running){clearInterval(countdownInterval);return;}
      state.timeLeft--;
      const el=$id('mem-timer'),m=Math.floor(state.timeLeft/60),s=state.timeLeft%60;
      el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      el.className='module-timer';
      if(state.timeLeft<=10){el.classList.add('danger');ADAPTAudio.playCountdown();}
      else if(state.timeLeft<=30)el.classList.add('warning');
      if(state.timeLeft<=0){clearInterval(countdownInterval);endTest();}
    },1000);
  }

  function start(){
    reset();state.running=true;
    $id('mem-intro').classList.add('hidden');$id('mem-arena').classList.remove('hidden');$id('mem-result').classList.add('hidden');
    document.getElementById('status-dot').className='status-dot active';
    document.getElementById('status-label').textContent='MEMORY';
    $id('mem-clear-btn').addEventListener('click',()=>{state.userInput=[];$id('mem-entered').textContent='';});
    $id('mem-submit-btn').addEventListener('click',()=>{if(state.userInput.length>0)submitAnswer();});
    startRound();startCountdown();
  }

  function endTest(){
    state.running=false;clearTimeout(showTimeout);clearInterval(countdownInterval);
    document.getElementById('status-dot').className='status-dot';
    document.getElementById('status-label').textContent='READY';
    ADAPTStorage.addScore('memory',{level:state.level,score:state.score,maxLength:state.maxLength});
    const rEl=$id('mem-result'),lvl=state.level;
    const color=lvl>=7?'#00ff88':lvl>=4?'#ffd600':'#ff3c3c';
    rEl.classList.remove('hidden');
    rEl.innerHTML=`
      <div class="result-score" style="color:${color}">Lvl ${lvl}</div>
      <div class="result-label">Memory Level Reached</div>
      <div class="result-breakdown">
        <div class="result-item"><div class="r-label">Score</div><div class="r-val">${state.score} pts</div></div>
        <div class="result-item"><div class="r-label">Max Length</div><div class="r-val">${state.maxLength}</div></div>
        <div class="result-item"><div class="r-label">Lives Left</div><div class="r-val">${state.lives}/${MAX_LIVES}</div></div>
      </div>
      <button class="btn-primary" id="mem-retry-btn">Try Again</button>`;
    $id('mem-retry-btn').addEventListener('click',()=>{
      rEl.classList.add('hidden');$id('mem-intro').classList.remove('hidden');$id('mem-arena').classList.add('hidden');
      $id('mem-timer').textContent='02:00';$id('mem-timer').className='module-timer';
    });
    $id('mem-arena').classList.add('hidden');
    if(window.DashboardModule) window.DashboardModule.refresh();
  }

  function init(){ $id('mem-start-btn').addEventListener('click',start); }
  return { init };
})();
