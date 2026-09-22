/**
 * The car's motor, synthesised in the browser — not a sample file.
 *
 * The same rule the shapes follow (docs/PLAN.md §5.6), applied to sound.
 * A recording of a real can motor would be tens of KB and would still be
 * wrong three ways: it could not follow the spin-up, it could not coast
 * down with the wheels, and it could not change pitch when the reader swaps
 * a Torque-Tuned for a Hyper-Dash. Six oscillators and a shelf of noise cost
 * 983 bytes gzipped and follow all three for free, because every frequency
 * here is a multiple of one number — the motor's turns per second. The
 * commutation pulse added three nodes to that graph and 73 bytes to the
 * module, minified and gzipped on its own: 1031 → 1104. Those totals are not
 * the 983 above and cannot be subtracted from it — a module gzipped alone
 * compresses differently from the same module inside a chunk, and differently
 * again under other minifier flags. The 73 is the part that reproduces.
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
 * | the rasp in it     | the torque dipping at each pole | `COMMUTATION_AM`  |
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
 * where the capture reads, the pane made a wind noise; what ships is far
 * under that, which leaves the rush *below* the six oscillators rather than
 * 22 dB above them. The measurement settles what the noise
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
 * 5.7 dB against the rush's 27 dB fall. The pane ended up about 13 dB under
 * where it had ever been, and has since gone 12 dB below that again, which is
 * the point: this is a motor that plays without being asked for, so it has to
 * be quiet enough to be welcome.
 *
 * **What that pass got wrong was the tilt, and the tilt came from the
 * recording.** Matched to the capture, the mesh's third harmonic ended up the
 * loudest thing in the file — 7.7 dB over the mesh itself — because a peak
 * here was set to clear the grass beside it, and the capture's grass at 8 kHz
 * stands 29 dB over its grass at 500 Hz. A near-pure 3.9 kHz triangle over
 * broadband hiss is a vacuum cleaner, which is what the owner heard
 * (2026-09-22). Two things are wrong with believing that tilt: the chain this
 * file already blames for the 13 kHz cliff sits on the peaks as well as on the
 * grass, and a gear mesh's harmonics decay in any case — a third harmonic
 * 11 dB over its own fundamental is a resonance or a microphone, not a pinion.
 * So the mesh series falls now instead of climbing, which walks the A-weighted
 * spectral centroid down from 3420 Hz to 1699 Hz: onto the mesh, where a car
 * whose loudest moving part is a 6-tooth pinion belongs.
 *
 * **And the commutation is a pulse now, not only a tone.** Three times a turn
 * the brushes hand over and the torque dips, so on a 3-pole can at 13000 rpm
 * there is a 650 Hz ripple across everything the gears are doing. That ripple
 * is most of the difference between a motor and a fan, and the model had none
 * of it: a vacuum's universal motor has far more segments turning far faster,
 * which puts its own ripple up out of the range where the ear reads roughness,
 * and a smooth whine over hiss is what is left. See `COMMUTATION_AM`.
 *
 * Only the timbre moved on that pass. `RUSH_LEVEL` came down and `PEAK` went
 * up by the same 6.6 dB the tones lost, so the A-weighted level and the
 * rush-to-tones balance were both left where the owner had set them by ear the
 * day before — the point being that the question asked of an ear should be one
 * question. The answer, once it could be heard on its own, was that the level
 * should come down too; `PEAK` did that afterwards, as its own step.
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
 * Master gain at full speed, and the only knob that moves the whole pane: the
 * tones and the rush both pass through it, so turning it leaves the balance
 * between them — the part `RUSH_LEVEL` is for — exactly where it was.
 *
 * A web page is not a race track. An early pass at 0.16 was so far under the
 * rest of the page that the switch read as broken on a laptop speaker, which
 * is what once put this at 0.32; then it rose twice without the pane getting
 * any louder, because for two passes this number was pure arithmetic. 0.62
 * gave back the 27 dB `RUSH_LEVEL` had just given up, and 1.33 the further
 * 6.6 dB the mesh series gave up when its tilt came out.
 *
 * 0.33 is not arithmetic. It is a level, asked for and chosen (owner,
 * 2026-09-22, once the retuned motor could be heard at a settled loudness),
 * and it is 12.1 dB under that compensated 1.33 — which puts the pane about
 * 25 dB under the loudest it has ever been. Landing beside the old 0.32 is a
 * coincidence and not a return: the mix in front of it is a different one.
 *
 * If the motor ever reads as broken rather than as quiet, this is the first
 * number to look at; 0.24 is the next step down if it is still not quiet
 * enough. Even with every partial of every layer in phase at the crest of the
 * pulse — which they never are — no sample can exceed 0.067 of full scale.
 */
const PEAK = 0.33

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
 * noise rather than a motor one. 0.10 was 27 dB under that, putting the rush
 * *below* the tones rather than far above them, and it was chosen by ear
 * against the capture rather than derived (owner, 2026-09-22; an interim
 * 8.8 dB cut the day before was still too airy).
 *
 * 0.047 is not a further judgement about the rush: it is 6.6 dB down because
 * the tones went 6.6 dB down when the mesh series stopped climbing, and the
 * ratio between the two is the part the owner actually chose. Retuning the
 * tones again means moving this with them, or the ear gets asked two questions
 * at once and answers neither.
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
const RUSH_LEVEL = 0.047

/**
 * How deeply the commutation pulses the gear whine, as a fraction either side
 * of unity — so 0.35 swings the whine between 0.65 and 1.35 of its level,
 * three times every turn of the armature.
 *
 * The modulator is a sawtooth and not a sine because a 3-pole can's torque
 * ripple is a spike and a slump, not a swell, and because a sine puts one
 * sideband pair either side of each whine while a sawtooth puts a run of them
 * — which is the rasp. They all land on exact multiples of the armature's
 * turn, as they do on a real motor; the speed wander (`WOBBLE`) is what keeps
 * that from reading as a single synthesised timbre.
 *
 * Only the whine is pulsed. Modulating the armature buzz and the commutation
 * tone as well would be modulating 650 Hz at 650 Hz, which is not roughness,
 * just a different waveform.
 *
 * This is an ear number, like `RUSH_LEVEL` and `PEAK`, and it is the one to
 * reach for if the motor sounds too smooth (up) or starts to warble (down).
 */
const COMMUTATION_AM = 0.35

/**
 * The speed wander, as LFO rate in hertz against depth in cents.
 *
 * A motor never holds its speed exactly, and one this small holds it far
 * worse than anything that has earned the word machinery: a 130-size armature
 * weighs a few grams, so there is almost no inertia to carry it through a
 * rough patch of commutation or a tight spot in the gears. Steadiness is a
 * property of mass. Held to the 7 cents this used to be, the pane sounded
 * like plant equipment heard through a wall (owner, 2026-09-22) — everything
 * in it being an exact multiple of one unwavering number.
 *
 * Two of them rather than one, at a ratio that does not come back round, on
 * the same argument as the nine cents between the two mesh layers: one LFO is
 * a vibrato and reads as an effect, two that never line up read as a thing
 * not holding still.
 */
const WOBBLE: readonly (readonly [hz: number, cents: number])[] = [[6.5, 11], [11.3, 7]]

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
  /**
   * Whether this layer is part of the gear whine, which is what the
   * commutation pulses. The armature buzz and the commutation tone are not:
   * they are the thing doing the pulsing. The speed wander is not keyed to
   * this — see `WOBBLE`, which reaches everything.
   */
  whine: boolean
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
    // `RUSH_LEVEL` has since come down with none of these moving, so each one
    // now stands far clearer of the grass than the capture shows — the grass
    // is barely there. The figures above are what they were solved against.
    //
    // The first four still hold the ratios that came out of that. The mesh's
    // second and third harmonics do not, and this is the 2026-09-22 retune:
    // solved that way the series *climbed*, the third harmonic ending up the
    // loudest thing in the file at 0.068, because the grass it was set to
    // clear climbs 29 dB across the same span. A pinion's harmonics decay, and
    // that climb is at least partly the recording chain (see the header), so
    // the series decays here too — 0.039 across the pair, then 0.012, then
    // 0.0075. What the capture still decides is everything below the mesh.
    //
    // The first and fourth sit under the 9 dB the capture's faintest peak
    // stands at, because the capture shows no peak at those two frequencies
    // at all: they are held down in the grass on purpose.
    //
    // The capture's own peaks fall at roughly 500 Hz, 1.5 kHz, 4.2 kHz and
    // 8 kHz, and the top two are not harmonics of one series — which is the
    // argument for leaving the top of the spectrum to the rush rather than
    // adding oscillators to chase peaks that no gear in the car explains.
    { order: 1, level: 0.0047, type: 'sawtooth', detune: 0, whine: false },
    { order: POLES, level: 0.024, type: 'sawtooth', detune: 0, whine: false },
    { order: teeth, level: 0.021, type: 'triangle', detune: 0, whine: true },
    // Nine cents apart, so the two whines beat a few times a second the way a
    // real pinion and crown do. In tune they were one synthesiser tone.
    { order: teeth, level: 0.018, type: 'triangle', detune: 9, whine: true },
    { order: teeth * 2, level: 0.012, type: 'triangle', detune: 0, whine: true },
    { order: teeth * 3, level: 0.0075, type: 'triangle', detune: -7, whine: true }
  ]

  let ctx: AudioContext | null = null
  /** Set once `ctx` is, and only read through it. */
  let master: GainNode
  let knee: BiquadFilterNode[] = []
  let noiseTilt: BiquadFilterNode
  let noiseGain: GainNode
  /** The commutation ripple, at `POLES` times the armature's turn. */
  let pulse: OscillatorNode
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

    // The speed wander (`WOBBLE`), summed onto one bus and fanned out from
    // there. It reaches every layer and the commutation pulse, not just the
    // whine, and that is the whole point: a speed fluctuation is one number
    // moving, so every order moves with it by the same *fraction* — which is
    // what a cent is. Bending one voice was a synthesiser effect; bending all
    // of them together, by the same cents, is a light rotor hunting.
    const wander = ctx.createGain()
    wander.gain.value = 1
    for (const [hz, cents] of WOBBLE) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = hz
      const depth = ctx.createGain()
      depth.gain.value = cents
      lfo.connect(depth).connect(wander)
      lfo.start()
    }

    // …and one fast one, on the gears' amplitude rather than their pitch. The
    // whine runs through a gain the commutation opens and closes three times a
    // turn, which is one stage for all four whine layers rather than a
    // modulator each: the depth has to be a fraction of each layer's own level
    // to stay a modulation, and a shared unity-gain bus gets that for free
    // where connecting into each `gain.gain` would add an absolute offset.
    pulse = ctx.createOscillator()
    pulse.type = 'sawtooth'
    pulse.frequency.value = 0
    const pulseDepth = ctx.createGain()
    pulseDepth.gain.value = COMMUTATION_AM
    const whineBus = ctx.createGain()
    whineBus.gain.value = 1
    pulse.connect(pulseDepth).connect(whineBus.gain)
    whineBus.connect(master)
    wander.connect(pulse.detune)
    pulse.start()

    for (const layer of LAYERS) {
      const osc = ctx.createOscillator()
      osc.type = layer.type
      osc.frequency.value = 0
      osc.detune.value = layer.detune
      wander.connect(osc.detune)
      const gain = ctx.createGain()
      gain.gain.value = layer.level
      osc.connect(gain).connect(layer.whine ? whineBus : master)
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
      // The ripple rides with the motor like everything else here, so it is a
      // rasp at speed and a flutter on the way up.
      pulse.frequency.setTargetAtTime(rev * POLES, now, FOLLOW_S)
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
