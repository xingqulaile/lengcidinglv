export const state = {
  magnetX: -8,
  targetMagnetX: -8,
  magnetVx: 0,
  lastMagnetX: -8,
  polarity: 1,
  strength: 1.0,
  turns: 200,
  resistance: 5.0,
  damping: 0.5,
  flux: 0,
  prevFlux: 0,
  dFlux: 0,
  emf: 0,
  current: 0,
  coilX: 0,
  coilRadius: 1.4,
  autoMode: false,
  autoTime: 0,
  dragging: false
};

export function computeFlux() {
  const dx = state.magnetX - state.coilX;
  const r = state.coilRadius;
  const k = 2.5 * state.strength * state.polarity;
  const denom = Math.pow(dx * dx + r * r, 1.5);
  return k * (r * r) / denom * Math.sign(1) * (dx >= 0 ? 1 : -1) * -1 + (k * dx) / denom;
}

export function fluxDipole() {
  const dx = state.magnetX - state.coilX;
  const a = state.coilRadius;
  const m = state.strength * state.polarity * 3.0;
  return m * (a * a) / Math.pow(dx * dx + a * a, 1.5);
}

export function step(dt) {
  if (state.autoMode) {
    state.autoTime += dt;
    state.targetMagnetX = Math.sin(state.autoTime * 1.5) * 6;
  }

  const moveRate = state.damping * 20; 
  state.magnetX += (state.targetMagnetX - state.magnetX) * Math.min(1, dt * moveRate);

  state.magnetVx = (state.magnetX - state.lastMagnetX) / Math.max(dt, 0.001);
  state.lastMagnetX = state.magnetX;

  state.flux = fluxDipole();
  state.dFlux = (state.flux - state.prevFlux) / Math.max(dt, 0.001);
  state.emf = -state.turns * state.dFlux * 0.01;
  state.current = state.emf / state.resistance;
  state.prevFlux = state.flux;
}

export function getDirection() {
  if (Math.abs(state.current) < 0.005) return { text: '— 无感应磁场 —', color: '#94a3b8', sign: 0 };
  if (state.current > 0) return { text: '↺ 逆时针 (B_ind 向右)', color: '#fb923c', sign: 1 };
  return { text: '↻ 顺时针 (B_ind 向左)', color: '#22d3ee', sign: -1 };
}
