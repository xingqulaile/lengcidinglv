import { state, step, getDirection } from './physics.js';
import { initScene, updateScene } from './scene.js';
import { AudioSystem } from './audio.js';

let chart;
const maxDataPoints = 120;
let timeData = [];
let fluxData = [];
let currentData = [];
let chartCounter = 0;
let lastTime = performance.now();
let hudTimeout = null;
let appStarted = false;

const trivias = [
  "你知道吗？楞次定律是能量守恒定律在电磁感应现象中的具体体现。",
  "『来拒去留』：当磁铁靠近线圈时受到排斥，远离时受到吸引。",
  "感应电流的磁场总是试图『抵消』原磁通量的变化。",
  "楞次定律由俄国物理学家海因里希·楞次于1834年提出。"
];

window.addEventListener('load', () => {
  const triviaEl = document.getElementById('trivia-text');
  if (triviaEl) {
    triviaEl.innerText = trivias[Math.floor(Math.random() * trivias.length)];
  }

  init();

  let progress = 0;
  const progressEl = document.getElementById('loading-progress');
  const startBtn = document.getElementById('btn-start');
  
  const interval = setInterval(() => {
    progress += Math.random() * 15 + 5;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      if (progressEl) progressEl.style.width = '100%';
      setTimeout(() => {
        if (startBtn) {
          startBtn.classList.remove('hidden');
          gsap.fromTo(startBtn, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 });
        }
      }, 300);
    } else {
      if (progressEl) progressEl.style.width = `${progress}%`;
    }
  }, 100);

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      AudioSystem.init();
      AudioSystem.playVoiceover();
      
      gsap.to('#loading-screen', { 
        opacity: 0, 
        duration: 0.8, 
        onComplete: () => {
          document.getElementById('loading-screen').style.display = 'none';
        }
      });

      gsap.fromTo('header', { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 1, delay: 0.2, ease: "power2.out" });
      gsap.fromTo('#control-panel', { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 1, delay: 0.4, ease: "power2.out" });
      gsap.fromTo('#chart-panel', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1, delay: 0.6, ease: "power2.out" });
      
      appStarted = true;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    });
  }

  const btnMute = document.getElementById('btn-mute');
  if (btnMute) {
    btnMute.addEventListener('click', () => {
      const isMuted = AudioSystem.toggleMute();
      const icon = document.getElementById('icon-volume');
      if (icon) {
        icon.setAttribute('data-lucide', isMuted ? 'volume-x' : 'volume-2');
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }
});

function init() {
  const container = document.getElementById('canvas-container');
  initScene(container, () => {
    state.autoMode = false;
    const autoBtn = document.getElementById('btn-auto');
    if (autoBtn) {
      autoBtn.classList.remove('bg-cyan-900/50');
      autoBtn.style.borderColor = '';
    }
  });

  initEcharts();
  initControls();
  
  updateScene(0, 0);
}

function initEcharts() {
  const chartDom = document.getElementById('echarts-container');
  if (!chartDom) return;
  
  chart = echarts.init(chartDom);
  chart.setOption({
    animation: false,
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(0,0,0,0.8)', textStyle: { color: '#fff', fontSize: 12 }, borderColor: 'rgba(6,182,212,0.3)' },
    grid: { left: 40, right: 40, top: 10, bottom: 20 },
    xAxis: { type: 'category', boundaryGap: false, data: timeData, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: [
      { type: 'value', position: 'left', splitLine: { lineStyle: { color: '#06b6d4', opacity: 0.1 } }, axisLabel: { color: '#06b6d4', fontSize: 9 } },
      { type: 'value', position: 'right', splitLine: { show: false }, axisLabel: { color: '#f97316', fontSize: 9 } }
    ],
    series: [
      { name: '磁通量 Φ', type: 'line', smooth: true, itemStyle: { color: '#06b6d4' }, lineStyle: { width: 2 }, symbol: 'none', data: fluxData },
      { name: '电流 I', type: 'line', yAxisIndex: 1, smooth: true, itemStyle: { color: '#f97316' }, lineStyle: { width: 2 }, symbol: 'none', data: currentData }
    ]
  });
  
  window.addEventListener('resize', () => {
    if (chart) chart.resize();
  });
}

function updateChart(timeStr) {
  chartCounter++;
  if (chartCounter % 3 !== 0) return; 

  timeData.push(timeStr);
  fluxData.push(state.flux.toFixed(4));
  currentData.push(state.current.toFixed(4));

  if (timeData.length > maxDataPoints) {
    timeData.shift();
    fluxData.shift();
    currentData.shift();
  }

  if (chart) {
    chart.setOption({
      xAxis: { data: timeData },
      series: [
        { data: fluxData },
        { data: currentData }
      ]
    });
  }
}

function initControls() {
  const bindSlider = (id, stateKey, valId, isFloat = false) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const v = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
      state[stateKey] = v;
      if (valEl) valEl.innerText = isFloat ? v.toFixed(2) : v;
    });
  };

  bindSlider('ctrl-turns', 'turns', 'val-turns', false);
  bindSlider('ctrl-strength', 'strength', 'val-strength', true);
  bindSlider('ctrl-damping', 'damping', 'val-damping', true);
  
  const flipBtn = document.getElementById('btn-flip');
  if (flipBtn) {
    flipBtn.addEventListener('click', () => {
      state.polarity *= -1;
    });
  }

  const autoBtn = document.getElementById('btn-auto');
  if (autoBtn) {
    autoBtn.addEventListener('click', (e) => {
      state.autoMode = !state.autoMode;
      if (state.autoMode) {
        e.currentTarget.classList.add('bg-cyan-900/50');
        e.currentTarget.style.borderColor = '#06b6d4';
      } else {
        e.currentTarget.classList.remove('bg-cyan-900/50');
        e.currentTarget.style.borderColor = '';
        state.targetMagnetX = state.magnetX;
      }
    });
  }

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.magnetX = -8;
      state.targetMagnetX = -8;
      state.magnetVx = 0;
      state.flux = 0;
      state.current = 0;
      state.autoMode = false;
      if (autoBtn) {
        autoBtn.classList.remove('bg-cyan-900/50');
        autoBtn.style.borderColor = '';
      }
      timeData.length = 0;
      fluxData.length = 0;
      currentData.length = 0;
      if (chart) {
        chart.setOption({
          xAxis: { data: timeData },
          series: [{ data: fluxData }, { data: currentData }]
        });
      }
    });
  }
}

function loop(time) {
  if (!appStarted) return;
  const rawDt = (time - lastTime) / 1000;
  lastTime = time;
  const dt = Math.min(rawDt, 0.1);

  step(dt);
  updateScene(dt, time / 1000);
  AudioSystem.update(state.current, state.dragging);

  updateUI();
  updateChart((time / 1000).toFixed(2));
  updateTeachingHUD();

  requestAnimationFrame(loop);
}

function updateUI() {
  const elFlux = document.getElementById('hud-flux');
  const elDflux = document.getElementById('hud-dflux');
  const elCur = document.getElementById('hud-current');
  
  if (elFlux) elFlux.innerText = state.flux.toFixed(4) + ' Wb';
  if (elDflux) elDflux.innerText = state.dFlux.toFixed(4);
  if (elCur) elCur.innerText = state.current.toFixed(4) + ' A';
  
  const dir = getDirection();
  const dirEl = document.getElementById('hud-dir');
  if (dirEl) {
    dirEl.innerText = dir.text;
    dirEl.style.color = dir.color;
  }

  const maxI = 2.0;
  const needle = document.getElementById('gauge-needle');
  if (needle) {
    let angle = (state.current / maxI) * 60; 
    angle = Math.max(-60, Math.min(60, angle));
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    const lbl = document.getElementById('gauge-label');
    if (lbl) lbl.innerText = `I = ${state.current.toFixed(2)} A`;
  }
}

function updateTeachingHUD() {
  const hudEl = document.getElementById('teaching-hud');
  if (!hudEl) return;
  
  if (Math.abs(state.dFlux) > 0.005 && Math.abs(state.current) > 0.005) {
    hudEl.style.opacity = '1';
    
    const magIncreasing = (state.flux * state.dFlux) > 0;
    
    const s1 = document.getElementById('teach-step1');
    if (s1) s1.innerText = `检测到线圈内磁通量 Φ 正在${magIncreasing ? '增大' : '减小'}`;

    const s2 = document.getElementById('teach-step2');
    if (s2) {
      const bindDirText = state.current > 0 ? '向右' : '向左';
      s2.innerText = `感生磁场 B_ind ${bindDirText}，以${magIncreasing ? '阻碍原磁场的增加' : '补偿原磁场的减小'}`;
    }

    const s3 = document.getElementById('teach-step3');
    if (s3) {
      s3.innerText = `产生 ${state.current > 0 ? '逆时针' : '顺时针'} 方向的感应电流`;
    }

    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      hudEl.style.opacity = '0';
    }, 2000);
  }
}
