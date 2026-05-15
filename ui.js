import { state, getDirection } from './physics.js';

const fluxEl = document.getElementById('hud-flux');
const dfluxEl = document.getElementById('hud-dflux');
const currentEl = document.getElementById('hud-current');
const dirEl = document.getElementById('hud-dir');
const needle = document.getElementById('gauge-needle');
const gaugeLabel = document.getElementById('gauge-label');
const statusBanner = document.getElementById('status-banner');
const statusText = document.getElementById('status-text');

const chart = document.getElementById('chart');
const ctx = chart.getContext('2d');
const history = { flux: [], current: [] };
const HISTORY_LEN = 200;

export function bindControls(onReset) {
  const turns = document.getElementById('ctrl-turns');
  const strength = document.getElementById('ctrl-strength');
  const resistance = document.getElementById('ctrl-resistance');

  turns.addEventListener('input', e => {
    state.turns = parseInt(e.target.value);
    document.getElementById('val-turns').textContent = state.turns;
  });
  strength.addEventListener('input', e => {
    state.strength = parseFloat(e.target.value);
    document.getElementById('val-strength').textContent = state.strength.toFixed(1);
  });
  resistance.addEventListener('input', e => {
    state.resistance = parseFloat(e.target.value);
    document.getElementById('val-resistance').textContent = state.resistance.toFixed(1);
  });

  document.getElementById('btn-flip').addEventListener('click', () => {
    state.polarity *= -1;
    showStatus(`磁极已翻转 · 朝向线圈: ${state.polarity === 1 ? 'N' : 'S'} 极`);
  });

  const autoBtn = document.getElementById('btn-auto');
  autoBtn.addEventListener('click', () => {
    state.autoMode = !state.autoMode;
    state.autoTime = 0;
    autoBtn.classList.toggle('active', state.autoMode);
    showStatus(state.autoMode ? '⚡ 自动简谐运动启动' : '手动模式');
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    state.magnetX = -8;
    state.lastMagnetX = -8;
    state.flux = 0; state.prevFlux = 0; state.current = 0;
    state.autoMode = false;
    autoBtn.classList.remove('active');
    history.flux.length = 0;
    history.current.length = 0;
    showStatus('实验已重置');
    onReset && onReset();
  });
}

let statusTimer;
function showStatus(text) {
  statusText.textContent = text;
  statusBanner.style.opacity = '1';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusBanner.style.opacity = '0', 2000);
}

export function updateHUD() {
  fluxEl.textContent = state.flux.toFixed(4) + ' Wb';
  dfluxEl.textContent = state.dFlux.toFixed(4);
  currentEl.textContent = state.current.toFixed(4) + ' A';

  const dir = getDirection();
  dirEl.textContent = dir.text;
  dirEl.style.color = dir.color;

  const angle = Math.max(-75, Math.min(75, state.current * 30));
  needle.style.transform = `rotate(${angle}deg)`;
  gaugeLabel.textContent = `I = ${state.current.toFixed(3)} A`;

  history.flux.push(state.flux);
  history.current.push(state.current);
  if (history.flux.length > HISTORY_LEN) history.flux.shift();
  if (history.current.length > HISTORY_LEN) history.current.shift();
  drawChart();
}

function drawChart() {
  const w = chart.width, h = chart.height;
  ctx.fillStyle = 'rgba(0,5,15,0.4)';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(6,182,212,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = (h / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
  ctx.strokeStyle = 'rgba(6,182,212,0.3)';
  ctx.stroke();

  const drawLine = (data, color, scale) => {
    if (data.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / HISTORY_LEN) * w;
      const y = h/2 - data[i] * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  drawLine(history.flux, '#06b6d4', 80);
  drawLine(history.current, '#f97316', 30);

  ctx.fillStyle = '#06b6d4'; ctx.font = '10px monospace';
  ctx.fillText('Φ', 8, 14);
  ctx.fillStyle = '#f97316';
  ctx.fillText('I', 8, 28);
}
