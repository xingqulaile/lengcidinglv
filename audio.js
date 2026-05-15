export const AudioSystem = {
  ctx: null,
  drone: null,
  droneGain: null,
  hum: null,
  humGain: null,
  isMuted: false,
  initialized: false,

  init() {
    if (this.initialized) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    try {
      this.ctx = new AudioContext();
      
      this.drone = this.ctx.createOscillator();
      this.drone.type = 'sine';
      this.drone.frequency.value = 55;
      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.1;
      this.drone.connect(this.droneGain);
      this.droneGain.connect(this.ctx.destination);
      this.drone.start();

      this.hum = this.ctx.createOscillator();
      this.hum.type = 'triangle';
      this.hum.frequency.value = 100;
      this.humGain = this.ctx.createGain();
      this.humGain.gain.value = 0;
      this.hum.connect(this.humGain);
      this.humGain.connect(this.ctx.destination);
      this.hum.start();

      this.initialized = true;
    } catch (e) {
      console.warn("Web Audio API 初始化失败:", e);
    }
  },

  playVoiceover() {
    if (this.isMuted) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance("欢迎进入楞次定律交互实验室。楞次定律指出：感应电流具有这样的方向，即感应电流的磁场，总要阻碍引起感应电流的磁通量的变化。你可以手动拖动磁铁，观察来拒去留的物理现象。");
      msg.lang = 'zh-CN';
      msg.rate = 1.0;
      window.speechSynthesis.speak(msg);
    }
  },

  update(current, isDragging) {
    if (!this.initialized || this.isMuted) return;
    
    const absC = Math.abs(current);
    const targetGain = Math.min(0.5, absC * 0.15);
    const targetFreq = 100 + absC * 150;
    
    this.humGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    this.hum.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
    
    this.drone.frequency.setTargetAtTime(isDragging ? 65 : 55, this.ctx.currentTime, 0.2);
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      if (this.droneGain) this.droneGain.gain.value = 0;
      if (this.humGain) this.humGain.gain.value = 0;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } else {
      if (this.droneGain) this.droneGain.gain.value = 0.1;
    }
    return this.isMuted;
  }
};
