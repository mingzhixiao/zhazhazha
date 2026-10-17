        /**
         * ============================================================================
         * 1. Web Audio API Q版合成音效系统
         * ============================================================================
         */
        class SoundSystem {
            constructor() {
                this.ctx = null;
                this.enabled = true;
            }

            init() {
                if (!this.ctx) {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    if (AudioCtx) this.ctx = new AudioCtx();
                }
                if (this.ctx && this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
            }

            toggle() {
                this.enabled = !this.enabled;
                return this.enabled;
            }

            vibrate(pattern) {
                try {
                    if (this.enabled && navigator.vibrate) {
                        navigator.vibrate(pattern);
                    }
                } catch (err) {}
            }

            playNotes(notes, opts = {}) {
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                const type = opts.type || 'triangle';
                const vol = opts.vol !== undefined ? opts.vol : 0.22;
                const gap = opts.gap || 0.05;
                const dur = opts.dur || 0.16;
                const slide = opts.slide || null;

                notes.forEach((freq, idx) => {
                    const now = this.ctx.currentTime + idx * gap;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, now);
                    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, now + dur);
                    gain.gain.setValueAtTime(vol, now);
                    gain.gain.exponentialRampToValueAtTime(0.008, now + dur);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(now);
                    osc.stop(now + dur);
                });
            }

            playPlaceBomb() {
                this.vibrate(18);
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(240, now);
                osc.frequency.exponentialRampToValueAtTime(580, now + 0.12);

                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.14);
            }

            playRemoteBeep() {
                this.vibrate([20, 20, 40]);
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                [880, 1320].forEach((freq, i) => {
                    const now = this.ctx.currentTime + i * 0.06;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(freq, now);
                    gain.gain.setValueAtTime(0.16, now);
                    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.08);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(now);
                    osc.stop(now + 0.08);
                });
            }

            playExplosion() {
                this.vibrate([35, 25, 45]);
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                const now = this.ctx.currentTime;
                const bufferSize = this.ctx.sampleRate * 0.38;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.12));
                }

                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(850, now);
                filter.frequency.exponentialRampToValueAtTime(90, now + 0.36);

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.45, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);
                noise.start(now);

                const osc = this.ctx.createOscillator();
                const oscGain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(35, now + 0.3);
                oscGain.gain.setValueAtTime(0.35, now);
                oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.32);

                osc.connect(oscGain);
                oscGain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.32);
            }

            playMegaBomb() {
                this.vibrate([70, 40, 90, 40, 140]);
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                const now = this.ctx.currentTime;

                const bufferSize = this.ctx.sampleRate * 0.85;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.26));
                }
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1800, now);
                filter.frequency.exponentialRampToValueAtTime(60, now + 0.8);

                const nGain = this.ctx.createGain();
                nGain.gain.setValueAtTime(0.7, now);
                nGain.gain.exponentialRampToValueAtTime(0.01, now + 0.85);
                noise.connect(filter);
                filter.connect(nGain);
                nGain.connect(this.ctx.destination);
                noise.start(now);

                const osc = this.ctx.createOscillator();
                const oGain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(240, now);
                osc.frequency.exponentialRampToValueAtTime(28, now + 0.7);
                oGain.gain.setValueAtTime(0.5, now);
                oGain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);
                osc.connect(oGain);
                oGain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.75);

                this.playNotes([261.63, 329.63, 392.0, 523.25], { type: 'triangle', vol: 0.2, gap: 0.09, dur: 0.45 });
            }

            playComboChain(chain) {
                this.vibrate(Math.min(60, 12 + chain * 6));
                const scales = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];
                const idx = Math.min(scales.length - 1, Math.max(0, chain - 1));
                this.playNotes([scales[idx], scales[Math.min(scales.length - 1, idx + 1)]], {
                    type: 'square',
                    vol: 0.17,
                    gap: 0.07,
                    dur: 0.13
                });
            }

            playNotify() {
                this.vibrate([30, 25, 55]);
                this.playNotes([783.99, 987.77, 1174.66, 1567.98], { type: 'sine', vol: 0.23, gap: 0.075, dur: 0.3 });
            }

            playCoin() {
                this.vibrate(15);
                this.playNotes([1318.51, 1760.0], { type: 'sine', vol: 0.18, gap: 0.055, dur: 0.12 });
            }

            playItemCurseSpawn() {
                this.vibrate([45, 25, 65]);
                this.playNotes([310, 233, 174, 440], { type: 'sawtooth', vol: 0.2, gap: 0.055, dur: 0.16 });
            }

            playPowerup() {
                this.vibrate(25);
                this.playNotes([523.25, 659.25, 783.99, 1046.5], { type: 'triangle', vol: 0.2, gap: 0.055, dur: 0.15 });
            }

            playComboCheer(tier = 1) {
                this.vibrate([25, 20, 35]);
                const rootFreqs = [392.0, 440.0, 523.25, 659.25, 783.99];
                const base = rootFreqs[Math.min(tier, 4)];
                this.playNotes([1, 1.25, 1.5, 2].map(r => base * r), {
                    type: 'triangle',
                    vol: 0.22,
                    gap: 0.045,
                    dur: 0.24
                });
            }

            playMagicBird() {
                this.vibrate([40, 30, 60, 30, 80]);
                const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093.0];
                this.playNotes(notes, { type: 'sine', vol: 0.24, gap: 0.05, dur: 0.28 });
            }

            playEnemyDefeat() {
                this.vibrate(20);
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);

                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.2);
            }

            playPortalUnlock() {
                this.vibrate([40, 30, 80]);
                this.playNotes([587.33, 739.99, 880.0, 1174.66, 1479.98], { type: 'sine', vol: 0.25, gap: 0.07, dur: 0.35 });
            }

            playPortalLocked() {
                this.vibrate(15);
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.setValueAtTime(175, now + 0.08);

                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.18);
            }

            playHurt() {
                this.vibrate([60, 40, 80]);
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;

                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(280, now);
                osc.frequency.linearRampToValueAtTime(110, now + 0.28);

                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.3);
            }

            playPurchase() {
                this.vibrate([20, 15, 40]);
                this.playNotes([659.25, 880.0, 1174.66, 1567.98], { type: 'triangle', vol: 0.24, gap: 0.06, dur: 0.22 });
            }

            playWin() {
                this.vibrate([50, 40, 50, 40, 120]);
                const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
                const times = [0, 0.1, 0.2, 0.3, 0.45, 0.58];
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;
                melody.forEach((freq, i) => {
                    const now = this.ctx.currentTime + times[i];
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now);
                    gain.gain.setValueAtTime(0.25, now);
                    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.22);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(now);
                    osc.stop(now + 0.22);
                });
            }

            playGameOver() {
                this.vibrate([100, 50, 150]);
                this.playNotes([392.00, 349.23, 329.63, 261.63], { type: 'sawtooth', vol: 0.18, gap: 0.16, dur: 0.25 });
            }
        }

