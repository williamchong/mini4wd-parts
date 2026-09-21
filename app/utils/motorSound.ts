/**
 * The car's motor, synthesised in the browser — not a sample file.
 *
 * The same rule the shapes follow (docs/PLAN.md §5.6), applied to sound.
 * A recording of a real can motor would be tens of KB and would still be
 * wrong three ways: it could not follow the spin-up, it could not coast
 * down with the wheels, and it could not change pitch when the reader swaps
 * a Torque-Tuned for a Hyper-Dash. Six oscillators and a band of noise cost
 * 934 bytes gzipped and follow all three for free, because every frequency
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
 * | the rush under it  | brushes and bearings            | bandpassed noise  |
 *
 * **The noise is the loudest layer, and that is the whole shape of it.** A
 * spectrum taken off a running car (owner, 2026-09-21) is a haystack, not a
 * chord: broadband energy humped across 1–3 kHz over a hard knee, with the
 * tones standing only about 10 dB above their own neighbourhood and a
 * shoulder near 200 Hz some 13 dB below the peak. Two earlier cuts had it
 * backwards — loud oscillators over a thin band of noise — and read as a
 * synthesiser playing a chord, which is what an organ sounds like and not
 * what a motor does. So the levels below are noise first and tones as spikes
 * on top of it, and every band from 150 Hz to 6 kHz now sits within a few dB
 * of that capture.
 *
 * Nothing here is allowed to be loud, and nothing here may start on its own:
 * `start()` must be called from the click that switched the car on, or Safari
 * will refuse the context and the pane will be silent for that reader only.
 */

/** A Tamiya can motor is 3-pole: the armature commutates three times a turn. */
const POLES = 3

/**
 * Master gain at full speed. A web page is not a race track — but the first
 * pass at 0.16 was so far under the rest of the page that the switch read as
 * broken on a laptop speaker.
 */
const PEAK = 0.32

/**
 * Where the captured spectrum falls off a cliff. Two Butterworth poles here
 * put 5 kHz 8 dB down and 8 kHz 20 dB down, which is what the capture reads;
 * one pole at any corner left the top two octaves hissing.
 */
const KNEE_HZ = 4000

/**
 * The mesh frequency the capture was taken at, near enough — a stock can
 * through a 6-tooth pinion. `KNEE_HZ` and `RUSH_HZ` are both quoted against
 * it, and both ride up and down with the motor in the car rather than sitting
 * at absolute hertz: pinned, a 4 kHz knee filtered away the very difference
 * between a Torque-Tuned and a Hyper-Dash that the catalog is here to give —
 * 44% more rpm moved the spectral centroid 4%. Riding, the whole haystack
 * shifts together and keeps the shape measured above. `load` is in it too, so
 * the spin-up brightens as it rises, the way a real one does.
 */
const REF_MESH_HZ = 1300

/**
 * The centre and width of the rush. A low Q on purpose: this is the haystack
 * the tones sit on, so it wants to be a hump across 1–3 kHz rather than a band.
 */
const RUSH_HZ = 1500
const RUSH_Q = 0.42
/** …and its level, which is why it is the layer doing the work. */
const RUSH_LEVEL = 1.9

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
    // Levels read straight off the capture, as decibels under its own peak:
    // about 13 under at the armature's turn, 4 at the commutation, level at
    // the mesh, and 6 under again by its third harmonic. They are spikes on
    // the hump, not voices in a chord.
    { order: 1, level: 0.035, type: 'sawtooth', detune: 0, wobble: false },
    { order: POLES, level: 0.075, type: 'sawtooth', detune: 0, wobble: false },
    { order: teeth, level: 0.10, type: 'triangle', detune: 0, wobble: true },
    // Nine cents apart, so the two whines beat a few times a second the way a
    // real pinion and crown do. In tune they were one synthesiser tone.
    { order: teeth, level: 0.075, type: 'triangle', detune: 9, wobble: true },
    { order: teeth * 2, level: 0.095, type: 'triangle', detune: 0, wobble: true },
    { order: teeth * 3, level: 0.05, type: 'triangle', detune: -7, wobble: true }
  ]

  let ctx: AudioContext | null = null
  /** Set once `ctx` is, and only read through it. */
  let master: GainNode
  let knee: BiquadFilterNode[] = []
  let noiseBand: BiquadFilterNode
  let noiseGain: GainNode
  let tones: { osc: OscillatorNode; order: number }[] = []
  let idle: ReturnType<typeof setTimeout> | undefined
  /** No Web Audio in this browser, or it refused a context. Stay silent for good. */
  let refused = false

  /** The graph, built on the first `start()` and kept for the pane's life. */
  function open(): AudioContext | null {
    if (ctx || refused) return ctx
    try {
      ctx = new AudioContext()
    }
    catch {
      refused = true
      return null
    }

    master = ctx.createGain()
    master.gain.value = 0

    // Two lowpasses rather than one, because the knee in the captured spectrum
    // falls at about 24 dB an octave and a single biquad manages 12. Below,
    // one highpass under the armature's own turn: it keeps the 200 Hz shoulder
    // the capture shows while dropping the rumble beneath it, which is boom on
    // a laptop and nothing at all on a phone, and which slides toward DC as
    // the car coasts down.
    knee = [ctx.createBiquadFilter(), ctx.createBiquadFilter()]
    for (const filter of knee) {
      filter.type = 'lowpass'
      filter.frequency.value = KNEE_HZ
      // Butterworth. The 1 a biquad defaults to puts a 2 dB bump right on the
      // corner, which is where the mesh harmonics sit.
      filter.Q.value = Math.SQRT1_2
    }
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 180
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

    // A second of white noise on loop, humped where the capture humps. This is
    // the difference between a motor and a chord, and it carries more of the
    // level than every oscillator above put together.
    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1
    noise.buffer = buffer
    noise.loop = true
    noiseBand = ctx.createBiquadFilter()
    noiseBand.type = 'bandpass'
    noiseBand.Q.value = RUSH_Q
    noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noise.connect(noiseBand).connect(noiseGain).connect(master)
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
        master.gain.setTargetAtTime(0, now, FOLLOW_S)
        // An idle context keeps a device's audio hardware awake, and the car
        // is switched off far longer than it is on.
        if (idle === undefined && context.state === 'running') {
          idle = setTimeout(() => { context.suspend().catch(() => {}) }, IDLE_MS)
        }
        return
      }

      clearTimeout(idle)
      idle = undefined
      if (context.state === 'suspended') context.resume().catch(() => {})

      const rev = (rpm / 60) * load
      for (const { osc, order } of tones) osc.frequency.setTargetAtTime(rev * order, now, FOLLOW_S)
      // 1 at the speed the capture was taken at, and what the shaped
      // frequencies are quoted in.
      const scale = (rev * teeth) / REF_MESH_HZ
      for (const filter of knee) filter.frequency.setTargetAtTime(clamp(KNEE_HZ * scale, 300, 12000), now, FOLLOW_S)
      noiseBand.frequency.setTargetAtTime(clamp(RUSH_HZ * scale, 200, 9000), now, FOLLOW_S)
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
