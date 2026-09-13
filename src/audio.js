const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createAudio() {
  let context = null; let master = null; let volume = .24; let muted = false; let running = false; let motifTimer = null; let motifStep = 0;
  const sources = new Set();
  const audioCtor = () => globalThis.AudioContext || globalThis.webkitAudioContext || globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
  const clearMotif = () => { if (motifTimer !== null) { clearTimeout(motifTimer); motifTimer = null; } };
  const gainUpdate = () => { if (master && context) master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, .02); };
  const ensure = () => { if (context) return true; const Ctor = audioCtor(); if (!Ctor) return false; try { context = new Ctor(); master = context.createGain(); master.gain.value = muted ? 0 : volume; master.connect(context.destination); return true; } catch (_) { context = null; master = null; return false; } };
  const track = (source, nodes = []) => { sources.add(source); source.addEventListener?.('ended', () => { sources.delete(source); source.disconnect?.(); nodes.forEach((node) => node.disconnect?.()); }); return source; };
  const tone = (frequency, duration, type = 'sine', amount = .05, delay = 0) => { if (!context || !master || muted || volume <= 0) return; const start = context.currentTime + delay; const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(Math.max(.0002, amount), start + .01); gain.gain.exponentialRampToValueAtTime(.0001, start + duration); oscillator.connect(gain).connect(master); oscillator.start(start); oscillator.stop(start + duration + .04); track(oscillator, [gain]); };
  const water = (amount = .02) => { if (!context || !master || muted || volume <= 0) return; const length = Math.max(1, Math.floor(context.sampleRate * .12)); const buffer = context.createBuffer(1, length, context.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < length; i++) data[i] = Math.sin(i * .71) * (1 - i / length); const source = context.createBufferSource(); const filter = context.createBiquadFilter(); const gain = context.createGain(); filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 3; gain.gain.value = amount; source.buffer = buffer; source.connect(filter).connect(gain).connect(master); source.start(); source.stop(context.currentTime + .14); track(source, [filter, gain]); };
  const motif = () => { if (!running || !context || context.state !== 'running') return; const beat = motifStep++ % 6; const lead = [392, 0, 523.25, 0, 659.25, 0][beat]; const bass = [98, 98, 110, 110, 82.4, 82.4][beat]; tone(bass, .28, 'sine', .012); if (lead) tone(lead, .2, 'triangle', .018); if (beat === 0) tone(196, .1, 'sine', .018); motifTimer = setTimeout(motif, 360); };
  const play = (eventOrType) => { const type = typeof eventOrType === 'string' ? eventOrType : eventOrType?.type; if (!type || !ensure() || context.state !== 'running') return false; if (type === 'place') { tone(330, .08, 'triangle', .045); tone(495, .14, 'sine', .028, .05); } else if (type === 'remove' || type === 'undo') tone(210, .09, 'triangle', .03); else if (type === 'flow') water(.018); else if (type === 'tint') { tone(440, .1, 'triangle', .045); tone(660, .18, 'sine', .035, .07); } else if (type === 'split') { tone(280, .1, 'square', .035); tone(420, .16, 'triangle', .03, .08); } else if (type === 'receive') { tone(523.25, .16, 'triangle', .06); tone(783.99, .3, 'sine', .055, .1); } else if (type === 'leak') { water(.04); tone(120, .2, 'sine', .04); } else if (type === 'win') { tone(523.25, .18, 'triangle', .06); tone(659.25, .2, 'triangle', .06, .1); tone(783.99, .42, 'sine', .07, .23); } else if (type === 'fail') { tone(220, .22, 'sine', .05); tone(146.83, .4, 'triangle', .04, .15); } else if (type === 'hint') tone(740, .16, 'sine', .035); else tone(240, .08, 'sine', .02); return true; };
  return {
    unlock() { return ensure(); },
    start() { if (!ensure()) return false; running = true; gainUpdate(); const promise = context.resume?.(); if (promise?.then) promise.then(() => { if (running && motifTimer === null) motif(); }).catch(() => {}); else if (motifTimer === null) motif(); return true; },
    stop() { running = false; clearMotif(); sources.forEach((source) => { try { source.stop(); } catch (_) {} source.disconnect?.(); }); sources.clear(); },
    pause() { running = false; clearMotif(); if (context?.state === 'running') context.suspend?.().catch?.(() => {}); },
    resume() { if (!context) return false; running = true; const promise = context.resume?.(); if (promise?.then) promise.then(() => { if (running && motifTimer === null) motif(); }).catch(() => {}); else if (motifTimer === null) motif(); return true; },
    setVolume(value) { volume = clamp(Number(value) || 0, 0, 1); gainUpdate(); },
    setMuted(value) { muted = !!value; gainUpdate(); },
    play,
    update() {},
    dispose() { running = false; clearMotif(); sources.forEach((source) => { try { source.stop(); } catch (_) {} source.disconnect?.(); }); sources.clear(); master?.disconnect(); context?.close?.().catch?.(() => {}); context = null; master = null; }
  };
}

export default createAudio;
