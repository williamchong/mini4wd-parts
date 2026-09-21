/**
 * The car's motor, synthesised in the browser — not a sample file.
 *
 * The same rule the shapes follow (docs/PLAN.md §5.6), applied to sound.
 * A recording of a real can motor would be tens of KB and would still be
 * wrong three ways: it could not follow the spin-up, it could not coast
 * down with the wheels, and it could not change pitch when the reader swaps
 * a Torque-Tuned for a Hyper-Dash. Six oscillators and a shelf of noise cost
 * 983 bytes gzipped and follow all three for free, because every frequency
 * here is a multiple of one number — the motor's turns per second.
 *
 * What a 130-size can actually puts in the air, and what each layer is here:
 *
 * | what you hear      | where it comes from             | here              |
 * | ------------------ | ------------------------------- | ----------------- |
 * | the low buzz       | once per armature turn          | order 1           |
 * | the body of it     | 3-pole commutation, 3× a turn   | order `POLES`     |
 * | the piercing "eee" | pinion teeth passing the crown  | order `teeth`, ×2 |
 * | and the top of it  | that mesh's own harmonics       | orders ×2 and ×3  |
 * | the rush under it  | brushes, bearings, the track    | tilted noise      |
 *
 * **The shape of the rush is measured; how much of it there is, is not.** A
 * spectrum taken off a running car is a haystack, not a chord — and the
 * second capture (owner, 2026-09-21, replacing the first one taken the same
 * day) is a far brighter haystack than the first: its grass climbs about
 * 30 dB from 1.5 kHz to a peak at 8 kHz and falls away again above 9, the
 * shoulder below 1 kHz sits some 29 dB under that peak, and the four peaks
 * that stand clear of the grass do so by 9 to 23 dB. The first capture read
 * the other way round — humped at 1–3 kHz over a 4 kHz knee, with only 13 dB
 * between the 200 Hz shoulder and the peak — and what came out of it was a
 * buzz, where a car on a track is mostly hiss. So the rush is no longer a
 * band sitting around the mesh: it is flat noise with everything under
 * 3.3 kHz taken off it. Rendered and measured back, that shape sits 1.8 dB
 * RMS from the capture across 100 Hz–12 kHz, and its hump tops out at
 * 7989 Hz against the capture's 8000.
 *
 * Its level is the owner's ear and not the capture — see `RUSH_LEVEL`. Set
 * where the capture reads, the pane made a wind noise; what ships is 27 dB
 * under that, which leaves the rush about 5 dB *below* the six oscillators
 * rather than 22 dB above them. The measurement settles what the noise
 * sounds like, and a person settles how much of it belongs in a pane that
 * somebody is reading a parts list next to.
 *
 * Two things in that capture are the recording and not the car, so nothing
 * here models them: a cliff at 13 kHz, which is the lossy codec the system
 * audio came through, and the exact depth of 10–12 kHz, which that cliff
 * drags down with it.
 *
 * Moving that much energy up two octaves is a good way to make a pane louder
 * without meaning to, so the levels were first solved to the same
 * **A-weighted** RMS the previous tuning had, not the same peak. Taking the
 * rush down afterwards took most of that level with it, because the rush was
 * most of it — and `PEAK` only recovered part of the difference, rising
 * 5.7 dB against the rush's 27 dB fall. The pane ends up about 13 dB under
 * where it has ever been, which is the point: this is a motor that plays
 * without being asked for, so it has to be quiet enough to be welcome.
 *
 * Every number below was fitted against `getFrequencyResponse` on the real
 * nodes rather than against the textbook formulas, which matters more than it
 * sounds: **for `lowpass` and `highpass` the Web Audio `Q` is in decibels of
 * resonance, not a filter Q.** Fitting against a linear Q put the corner an
 * octave wrong and cost 5 dB across the band the whine sits in.
 *
 * Nothing here is allowed to be loud, and nothing here may start on its own:
 * `start()` must be called from the click that switched the car on, or Safari
 * will refuse the context and the pane will be silent for that reader only.
 */

/** A Tamiya can motor is 3-pole: the armature commutates three times a turn. */
const POLES = 3

/**
 * Master gain at full speed. A web page is not a race track — and an early
 * pass at 0.16 was so far under the rest of the page that the switch read as
 * broken on a laptop speaker, which is what once put this at 0.32.
 *
 * It has nearly doubled since, and the pane still came out quieter: this is
 * 5.7 dB up while `RUSH_LEVEL` went 27 dB down around it, netting about 13 dB
 * of A-weighted quiet — under even that 0.16. It had to rise at all because
 * the rush was most of the output, so taking the rush away took the level
 * with it. This is the level the owner listened at and chose (2026-09-22), on
 * the same pass that let the sound play without being asked for, and the two
 * go together. If the motor ever reads as broken rather than as quiet, this is
 * the first number to look at. The loudest sample reaches 0.14 of full scale.
 */
const PEAK = 0.62

/**
 * Where the captured spectrum turns over. The hump's own top lands a little
 * under it, at 7989 Hz against the capture's 8000, because the climb below
 * and the fall above meet there — there is no plateau in it to place.
 */
const KNEE_HZ = 9000

/**
 * The mesh frequency the capture was taken at, near enough — a stock can
 * through a 6-tooth pinion. `KNEE_HZ` and `RUSH_TILT_HZ` are quoted against
 * it, and both ride up and down with the motor in the car rather than sitting
 * at absolute hertz: pinned, the knee filtered away the very difference
 * between a Torque-Tuned and a Hyper-Dash that the catalog is here to give —
 * 44% more rpm moved the spectral centroid 4%. Riding, the whole haystack
 * shifts together and keeps the shape measured above. `load` is in it too, so
 * the spin-up brightens as it rises, the way a real one does.
 *
 * The second capture leaves it where the first one put it: its strongest
 * narrow whine reads at about 1.5 kHz, which is 1300 to the accuracy a log
 * frequency axis can be read off a screenshot, and moving the anchor would
 * silently rescale every shaped frequency above.
 */
const REF_MESH_HZ = 1300

/**
 * The rush is flat noise with its bottom taken off — one low shelf, this far
 * down below this corner, under the knee above — and not a band. A bandpass
 * cannot draw the captured shape at all: its skirts fall 6 dB an octave on
 * both sides, where the capture wants a 30 dB climb over 1.5–8 kHz standing
 * on a floor that is flat from 1 kHz down. Fitted against the same capture,
 * the shelf lands at 2.1 dB RMS and the bandpass that shipped before it at 43.
 *
 * A shelf's transition is wide — an octave below the corner this one is at
 * −24.7 dB, still 4 dB short of the bottom of its own cut — and that width
 * is doing the work, because the capture's climb takes two and a half
 * octaves.
 */
const RUSH_TILT_HZ = 3300
const RUSH_TILT_DB = -29
/**
 * …and its level, which is the one number here deliberately **not** set to
 * what the capture reads. Matched to it — 2.35, where the rush carried 22 dB
 * more of the output than all six oscillators together — the pane made a wind
 * noise rather than a motor one. This is 27 dB under that, which puts the
 * rush about 5 dB *below* the tones instead of 22 above, and it was chosen by
 * ear against the capture rather than derived (owner, 2026-09-22; an interim
 * 8.8 dB cut the day before was still too airy).
 *
 * Steady unmodulated broadband noise is the sound of moving air, and that is
 * what a lot of it over everything pitched will always be. The capture also
 * has a reason to overstate it that its peaks do not share: a microphone at a
 * track records the air around it, the room, and its own hiss as smooth grass
 * across the top of the band, while a peak at a gear mesh can only have come
 * from the car. So the peaks are believed and the grass is discounted, here
 * heavily.
 *
 * This is the knob to reach for if the pane ever sounds airy, or too dry —
 * every other number in this file is anchored to something measured, and
 * moving one of those means going back to the capture.
 */
const RUSH_LEVEL = 0.10

/**
 * How quickly a parameter follows `set`. A time constant rather than a ramp,
 * so a frame the pane drops — or a tab coming back from the background with
 * one huge step — slews instead of clicking.
 */
const FOLLOW_S = 0.03

/** Below this the car has all but stopped: fade out and let the context idle. */
const SILENT = 0.015

/** How long after falling silent the context is suspended, in ms. Longer than the fade. */
const IDLE_MS = 250

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

type Layer = {
  /** Multiples of the motor's turns per second. */
  order: number
  level: number
  type: OscillatorType
  /** Cents off its order, so a pair of them beat against each other. */
  detune: number
  /** Whether the slow wobble reaches it; only the gear whine wanders. */
  wobble: boolean
}

export type MotorSound = ReturnType<typeof createMotorSound>

/**
 * @param teeth on the pinion the motor drives: what sets the whine's pitch
 *   against the buzz. 6 on a PRO chassis, 8 on a single-shaft one.
 */
export function createMotorSound(teeth: number) {
  const LAYERS: readonly Layer[] = [
    // Levels solved from the capture, each one set so its spike stood as far
    // over the grass beside it as the capture's does — 6 dB at the armature's
    // turn, 20 at the commutation, 20 across the pair at the mesh, 8 at its
    // second harmonic and 14 at its third. They are spikes on the hump, not
    // voices in a chord, and the numbers look small because the shelf has
    // already taken 29 dB off the hump under them.
    //
    // `RUSH_LEVEL` has since come down 27 dB with none of these moving, so
    // each one now stands far clearer of the grass than the capture shows —
    // the grass is barely there. The figures above are what they were solved
    // against; what these levels actually hold is the ratios between them,
    // and those are still the capture's.
    //
    // The first and fourth sit under the 9 dB the capture's faintest peak
    // stands at, because the capture shows no peak at those two frequencies
    // at all: they are held down in the grass on purpose.
    //
    // The capture's own peaks fall at roughly 500 Hz, 1.5 kHz, 4.2 kHz and
    // 8 kHz, and the top two are not harmonics of one series — which is the
    // argument for leaving the top of the spectrum to the rush rather than
    // adding oscillators to chase peaks that no gear in the car explains.
    { order: 1, level: 0.0047, type: 'sawtooth', detune: 0, wobble: false },
    { order: POLES, level: 0.024, type: 'sawtooth', detune: 0, wobble: false },
    { order: teeth, level: 0.021, type: 'triangle', detune: 0, wobble: true },
    // Nine cents apart, so the two whines beat a few times a second the way a
    // real pinion and crown do. In tune they were one synthesiser tone.
    { order: teeth, level: 0.018, type: 'triangle', detune: 9, wobble: true },
    { order: teeth * 2, level: 0.016, type: 'triangle', detune: 0, wobble: true },
    { order: teeth * 3, level: 0.068, type: 'triangle', detune: -7, wobble: true }
  ]

  let ctx: AudioContext | null = null
  /** Set once `ctx` is, and only read through it. */
  let master: GainNode
  let knee: BiquadFilterNode[] = []
  let noiseTilt: BiquadFilterNode
  let noiseGain: GainNode
  /**
   * How far up the two shaped corners are allowed to ride, which cannot be a
   * constant: a corner above Nyquist is not an error, it is silently pinned
   * there — and a lowpass pinned at Nyquist passes everything, while this
   * shelf pinned there cuts the whole band by `RUSH_TILT_DB`. A headset in
   * call mode opens the context at 16 kHz, where a fixed 16000 would do both
   * at once and leave a thin, quiet motor. Read off the rate we actually got.
   */
  let ceiling = 0
  let tones: { osc: OscillatorNode; order: number }[] = []
  let idle: ReturnType<typeof setTimeout> | undefined
  /**
   * Whether the fade to silence has already been asked for. `set()` runs every
   * frame while the car is on, and a reader who silences a running car leaves
   * it running — so without this the same target would be re-issued sixty
   * times a second, for as long as they leave it spinning, at a `currentTime`
   * frozen by the suspend a quarter-second in.
   */
  let silenced = false
  /** No Web Audio in this browser, or it refused a context. Stay silent for good. */
  let refused = false

  /** The graph, built on the first `start()` and kept for the pane's life. */
  function open(): AudioContext | null {
    if (ctx || refused) return ctx
    try {
      // `playback`, not the default `interactive`: the fastest thing here
      // moves over `FOLLOW_S` and the spin-up takes 0.4 s, so the platform is
      // welcome to take a larger buffer and wake the audio thread far less
      // often. The tens of milliseconds it costs cannot be heard against that
      // ramp, and the saving is now everyone's — the sound plays by default.
      ctx = new AudioContext({ latencyHint: 'playback' })
    }
    catch {
      refused = true
      return null
    }

    master = ctx.createGain()
    master.gain.value = 0
    ceiling = ctx.sampleRate * 0.45

    // Two lowpasses rather than one, because the knee in the captured spectrum
    // falls at about 24 dB an octave and a single biquad manages 12. Below,
    // one highpass at the foot of the shoulder rather than under it: 100 Hz
    // comes through 1.5 dB down and 60 Hz 11 dB down, which is about how the
    // capture itself falls away below the shoulder. What goes with it is the
    // rumble beneath that — boom on a laptop, nothing at all on a phone, and
    // sliding toward DC anyway as the car coasts down.
    knee = [ctx.createBiquadFilter(), ctx.createBiquadFilter()]
    for (const filter of knee) {
      filter.type = 'lowpass'
      filter.frequency.value = KNEE_HZ
      // Decibels of resonance, not a filter Q — see the note at the top —
      // so this is 0.7 dB of lift right on the corner, which is where the
      // mesh harmonics sit, and the 1 a biquad defaults to is barely more.
      // Neither is audible; what shapes the top is the pair, not the Q.
      filter.Q.value = Math.SQRT1_2
    }
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 120
    master.connect(knee[0]!).connect(knee[1]!).connect(highpass).connect(ctx.destination)

    // One slow wobble, shared: a real motor never holds a pitch exactly, and
    // without this the whine is audibly a test tone.
    const wobble = ctx.createOscillator()
    wobble.frequency.value = 6.5
    const wobbleDepth = ctx.createGain()
    wobbleDepth.gain.value = 7
    wobble.connect(wobbleDepth)
    wobble.start()

    for (const layer of LAYERS) {
      const osc = ctx.createOscillator()
      osc.type = layer.type
      osc.frequency.value = 0
      osc.detune.value = layer.detune
      if (layer.wobble) wobbleDepth.connect(osc.detune)
      const gain = ctx.createGain()
      gain.gain.value = layer.level
      osc.connect(gain).connect(master)
      osc.start()
      tones.push({ osc, order: layer.order })
    }

    // A second of white noise on loop, tilted the way the capture tilts. It
    // sits under the oscillators rather than over them now (see `RUSH_LEVEL`),
    // but it is still what keeps the six of them from reading as a chord.
    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1
    noise.buffer = buffer
    noise.loop = true
    noiseTilt = ctx.createBiquadFilter()
    noiseTilt.type = 'lowshelf'
    noiseTilt.gain.value = RUSH_TILT_DB
    noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noise.connect(noiseTilt).connect(noiseGain).connect(master)
    noise.start()

    return ctx
  }

  return {
    /**
     * Build the graph and let it run. **Call this from the click handler
     * itself**, not from a watcher that reacts to it: Safari grants a context
     * only inside the gesture, and a microtask later is already too late.
     */
    start() {
      clearTimeout(idle)
      idle = undefined
      open()?.resume().catch(() => {})
    },

    /**
     * One frame of the motor.
     *
     * @param load 0 to 1, how much of its speed the car is up to — the pane's
     *   own spin envelope, not its drawn speed, which is deliberately slow so
     *   the pinion does not strobe.
     * @param rpm the free speed of the motor actually fitted.
     */
    set(load: number, rpm: number) {
      const context = ctx
      if (!context) return
      const now = context.currentTime

      if (load < SILENT) {
        // Asked for once, not once a frame: the gain is already on its way to
        // zero, and asking again changes nothing anyone can hear.
        if (!silenced) {
          master.gain.setTargetAtTime(0, now, FOLLOW_S)
          silenced = true
        }
        // An idle context keeps a device's audio hardware awake, and the car
        // is switched off far longer than it is on.
        if (idle === undefined && context.state === 'running') {
          idle = setTimeout(() => { context.suspend().catch(() => {}) }, IDLE_MS)
        }
        return
      }

      silenced = false
      clearTimeout(idle)
      idle = undefined
      if (context.state === 'suspended') context.resume().catch(() => {})

      const rev = (rpm / 60) * load
      for (const { osc, order } of tones) osc.frequency.setTargetAtTime(rev * order, now, FOLLOW_S)
      // 1 at the speed the capture was taken at, and what the shaped
      // frequencies are quoted in.
      const scale = (rev * teeth) / REF_MESH_HZ
      const kneeHz = clamp(KNEE_HZ * scale, 800, Math.min(16000, ceiling))
      for (const filter of knee) filter.frequency.setTargetAtTime(kneeHz, now, FOLLOW_S)
      noiseTilt.frequency.setTargetAtTime(clamp(RUSH_TILT_HZ * scale, 400, Math.min(9000, ceiling)), now, FOLLOW_S)
      // Squared against the master below it: the rush is what comes up as the
      // car reaches speed, rather than being there through the whole spin-up.
      noiseGain.gain.setTargetAtTime(RUSH_LEVEL * load, now, FOLLOW_S)
      master.gain.setTargetAtTime(PEAK * load, now, FOLLOW_S)
    },

    /** Done with the pane. Everything above goes with the context. */
    stop() {
      clearTimeout(idle)
      idle = undefined
      ctx?.close().catch(() => {})
      ctx = null
      tones = []
      knee = []
    }
  }
}
