// The landing page's hero: our own isometric "goal map". A road winds left to right through a small town: a
// kiosk with "Set a goal", a valley with a red ▼ board and "See the dip in context", a fork with a bench and
// "Check-in before you stop", and a hill with a house and the dark green "Your goal" flag. A small car drives
// the road and loops; it stays parked at the start when the visitor prefers reduced motion.
// Drawn on an isometric grid: world (u, v, z) -> screen (u - v, (u + v) / 2 - z). No logo, nothing traced.

type Pt = [u: number, v: number, z: number];

const OX = 236;
const OY = 92;
const S = 210; // one ground tile
const FLOOR = -52; // the underside of the ground
const DIP = -32; // the valley floor

const at = ([u, v, z]: Pt): [number, number] => [OX + u - v, OY + (u + v) / 2 - z];
const r1 = (n: number) => Math.round(n * 10) / 10;
const pts = (...ps: Pt[]) => ps.map((p) => at(p).map(r1).join(',')).join(' ');

const STEPS = ['Set a goal', 'See the dip in context', 'Check-in before you stop', 'Your goal'];

/** A box seen from above: its top, its front-left face (v = v1) and its front-right face (u = u1). */
function Box({ u: [u0, u1], v: [v0, v1], z: [z0, z1], top, left, right }: { u: [number, number]; v: [number, number]; z: [number, number]; top: string; left: string; right: string }) {
  return (
    <>
      <polygon points={pts([u0, v1, z1], [u1, v1, z1], [u1, v1, z0], [u0, v1, z0])} className={left} />
      <polygon points={pts([u1, v0, z1], [u1, v1, z1], [u1, v1, z0], [u1, v0, z0])} className={right} />
      <polygon points={pts([u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1])} className={top} />
    </>
  );
}

const flat = (u0: number, u1: number, v0: number, v1: number, z: number): Pt[] => [
  [u0, v0, z],
  [u1, v0, z],
  [u1, v1, z],
  [u0, v1, z],
];

// The road, as flat pieces and ramps. Drawn twice, outline then fill, so the joins show no inner lines.
const ROAD: Pt[][] = [
  flat(30, 176, 83, 127, 0),
  [[176, 83, 0], [244, 83, DIP], [244, 127, DIP], [176, 127, 0]], // down into the valley
  flat(244, 412, 83, 127, DIP),
  flat(368, 412, 30, 127, DIP),
  [[368, 30, DIP], [412, 30, DIP], [412, -38, 0], [368, -38, 0]], // up out of the valley
  flat(368, 412, -210, -38, 0), // the side road at the fork, to the edge
  flat(368, 547, -92, -48, 0),
];

// The car's route: the road's centre line, turning twice each way.
const ROUTE: { p: Pt; along: 'u' | 'v' }[] = [
  { p: [36, 105, 0], along: 'u' },
  { p: [176, 105, 0], along: 'u' },
  { p: [244, 105, DIP], along: 'u' },
  { p: [390, 105, DIP], along: 'v' },
  { p: [390, 30, DIP], along: 'v' },
  { p: [390, -38, 0], along: 'v' },
  { p: [390, -70, 0], along: 'u' },
  { p: [525, -70, 0], along: 'v' },
  { p: [525, -92, 0], along: 'v' },
  { p: [525, -130, 34], along: 'v' },
  { p: [525, -146, 34], along: 'v' },
];

/** CSS keyframes for the car: constant speed along the route, the right sprite for each direction, a fade at each end. */
function carCss(): string {
  const DURATION = 18;
  const TRAVEL = 0.86;
  const lengths = ROUTE.slice(1).map(({ p }, i) => Math.hypot(...p.map((n, k) => n - ROUTE[i].p[k])));
  const total = lengths.reduce((a, b) => a + b, 0);
  let done = 0;
  const stops = ROUTE.map(({ p, along }, i) => {
    if (i > 0) done += lengths[i - 1];
    const [x, y] = at(p);
    return { pct: (done / total) * TRAVEL * 100, x: r1(x - OX), y: r1(y - OY), along };
  });
  const f = (n: number) => n.toFixed(2);
  const move = stops.map((s) => `${f(s.pct)}%{transform:translate(${s.x}px,${s.y}px)}`).join('') + `100%{transform:translate(${stops.at(-1)!.x}px,${stops.at(-1)!.y}px)}`;
  // At each turn: the old sprite up to the turn, the new one from a hair after it.
  const shown = (along: 'u' | 'v', dir: 'u' | 'v') => (along === dir ? 1 : 0);
  const sprite = (dir: 'u' | 'v') =>
    stops
      .map((s, i) =>
        i === 0 ? `0%{opacity:${shown(s.along, dir)}}` : `${f(s.pct)}%{opacity:${shown(stops[i - 1].along, dir)}}${f(s.pct + 0.01)}%{opacity:${shown(s.along, dir)}}`,
      )
      .join('') + `100%{opacity:${shown(stops.at(-1)!.along, dir)}}`;
  return [
    `@keyframes goalmap-move{${move}}`,
    `@keyframes goalmap-u{${sprite('u')}}`,
    `@keyframes goalmap-v{${sprite('v')}}`,
    `@keyframes goalmap-fade{0%{opacity:0}3%{opacity:1}${TRAVEL * 100 + 4}%{opacity:1}${TRAVEL * 100 + 10}%,100%{opacity:0}}`,
    `.goalmap-car{animation:goalmap-move ${DURATION}s linear infinite,goalmap-fade ${DURATION}s linear infinite}`,
    `.goalmap-car-u{animation:goalmap-u ${DURATION}s linear infinite}`,
    `.goalmap-car-v{animation:goalmap-v ${DURATION}s linear infinite}`,
    '@media (prefers-reduced-motion:reduce){.goalmap-car,.goalmap-car-u,.goalmap-car-v{animation:none}}',
  ].join('\n');
}

function Tree({ u, v, z = 0, pine = false }: { u: number; v: number; z?: number; pine?: boolean }) {
  const [x, y] = at([u, v, z]);
  return (
    <g>
      <ellipse cx={x} cy={y} rx="13" ry="6.5" className="fill-logo-navy stroke-none" opacity="0.1" />
      {pine ? (
        <>
          <path d={`M${x} ${y}v-10`} />
          <polygon points={`${x},${y - 56} ${x + 14},${y - 10} ${x - 14},${y - 10}`} className="fill-logo-green" />
        </>
      ) : (
        <>
          <path d={`M${x} ${y}v-14`} />
          <circle cx={x} cy={y - 28} r="15" className="fill-primary" />
        </>
      )}
    </g>
  );
}

/** A signpost: a post and a board with one or two lines of text (21 units: 14px or more from tablet up). */
function Sign({ u, v, z = 0, lines, post = 58, dx = 0 }: { u: number; v: number; z?: number; lines: string[]; post?: number; dx?: number }) {
  const [x, y] = at([u, v, z]);
  const w = Math.max(...lines.map((l) => l.length)) * 11.6 + 28;
  const h = lines.length * 26 + 14;
  const top = y - post - h;
  return (
    <g className="max-md:hidden">
      <path d={`M${x} ${y}V${top + h}`} strokeWidth="2" />
      <rect x={x + dx - w / 2} y={top} width={w} height={h} rx="8" className="fill-surface" strokeWidth="1.5" />
      {lines.map((line, i) => (
        <text key={line} x={x + dx} y={top + 30 + i * 26} textAnchor="middle" className="fill-logo-navy stroke-none text-[21px] font-semibold">
          {line}
        </text>
      ))}
    </g>
  );
}

function Window({ u, v, z, face }: { u: number; v: number; z: number; face: 'left' | 'right' }) {
  const d = 10;
  return face === 'left' ? (
    <polygon points={pts([u, v, z], [u + d, v, z], [u + d, v, z + d], [u, v, z + d])} className="fill-logo-navy" />
  ) : (
    <polygon points={pts([u, v, z], [u, v + d, z], [u, v + d, z + d], [u, v, z + d])} className="fill-logo-navy" />
  );
}

function Car({ along }: { along: 'u' | 'v' }) {
  type Span = { u: [number, number]; v: [number, number] };
  const body: Span = along === 'u' ? { u: [-15, 15], v: [-8, 8] } : { u: [-8, 8], v: [-15, 15] };
  const cabin: Span = along === 'u' ? { u: [-9, 5], v: [-7, 7] } : { u: [-7, 7], v: [-5, 9] };
  const wheels: Pt[] = along === 'u' ? [[-9, 8, 3], [9, 8, 3]] : [[8, -9, 3], [8, 9, 3]];
  const [sx, sy] = at([0, 0, 0]);
  return (
    <g className={along === 'u' ? 'goalmap-car-u' : 'goalmap-car-v'} opacity={along === 'u' ? 1 : 0}>
      <ellipse cx={sx} cy={sy + 2} rx="18" ry="8" className="fill-logo-navy stroke-none" opacity="0.12" />
      <Box {...body} z={[3, 11]} top="fill-logo-navy" left="fill-blue" right="fill-logo-navy" />
      <Box {...cabin} z={[11, 18]} top="fill-surface" left="fill-road" right="fill-road" />
      {wheels.map((w) => {
        const [x, y] = at(w);
        return <circle key={w.join()} cx={x} cy={y} r="3.2" className="fill-logo-navy" />;
      })}
    </g>
  );
}

export function HeroGoalMap() {
  const [startX, startY] = at(ROUTE[0].p);
  const flag = at([495, -190, 34]);
  const flagTop = flag[1] - 116;
  const dipBoard = at([230, 60, DIP]);
  return (
    <figure className="mx-auto max-w-[1100px]">
      <svg
        viewBox="20 46 1062 420"
        role="img"
        aria-label="Map of a SIP journey: set a goal, see the dip in context, check-in before you stop, reach your goal"
        className="h-auto w-full stroke-logo-navy [&_*]:[vector-effect:non-scaling-stroke]"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <style dangerouslySetInnerHTML={{ __html: carCss() }} />

        {/* The ground: four tiles, the second one sunk into a valley. Back to front. */}
        <Box u={[0, S]} v={[0, S]} z={[FLOOR, 0]} top="fill-primary-soft" left="fill-primary" right="fill-logo-green" />
        <Box u={[S, 2 * S]} v={[-S, 0]} z={[FLOOR, 0]} top="fill-primary-soft" left="fill-primary" right="fill-logo-green" />
        <Box u={[S, 2 * S]} v={[0, S]} z={[FLOOR, DIP]} top="fill-primary-soft" left="fill-primary" right="fill-logo-green" />
        <Box u={[2 * S, 3 * S]} v={[-S, 0]} z={[FLOOR, 0]} top="fill-primary-soft" left="fill-primary" right="fill-logo-green" />

        {/* The road: outline, then fill, then the ramps' visible sides and cuts. */}
        <g strokeWidth="2.5">
          {ROAD.map((piece, i) => (
            <polygon key={i} points={pts(...piece)} className="fill-road" />
          ))}
        </g>
        <g className="stroke-none">
          {ROAD.map((piece, i) => (
            <polygon key={i} points={pts(...piece)} className="fill-road" />
          ))}
        </g>
        <polygon points={pts([176, 83, 0], [210, 83, 0], [210, 83, -16])} className="fill-line" />
        <polygon points={pts([210, 127, -16], [244, 127, DIP], [210, 127, DIP])} className="fill-line" />
        <polygon points={pts([412, 30, DIP], [412, 0, -18], [412, 0, DIP])} className="fill-line" />
        <polygon points={pts([368, 0, 0], [368, -38, 0], [368, 0, -18])} className="fill-line" />

        {/* Back of the map. */}
        <Tree u={12} v={58} pine />
        <Tree u={140} v={14} />
        <Tree u={232} v={-192} pine />
        <Tree u={456} v={-196} pine />

        {/* 1. The start: a kiosk, a car and "Set a goal". */}
        <Box u={[30, 80]} v={[22, 60]} z={[0, 34]} top="fill-page" left="fill-surface" right="fill-line" />
        <polygon points={pts([38, 60, 8], [70, 60, 8], [70, 60, 24], [38, 60, 24])} className="fill-logo-navy" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <polygon
            key={i}
            points={pts([26 + i * 10, 60, 36], [36 + i * 10, 60, 36], [36 + i * 10, 76, 27], [26 + i * 10, 76, 27])}
            className={i % 2 ? 'fill-surface' : 'fill-primary'}
          />
        ))}
        <Sign u={118} v={58} lines={['Set a goal']} dx={66} />

        {/* 3. The fork: a bench and "Check-in before you stop"; the side road runs off the edge. */}
        <g className="fill-surface">
          <polygon points={pts([290, -146, 9], [320, -146, 9], [320, -146, 19], [290, -146, 19])} />
          <polygon points={pts([290, -146, 9], [320, -146, 9], [320, -136, 9], [290, -136, 9])} />
          <path d={`M${at([292, -137, 9]).join(' ')}V${at([292, -137, 0])[1]}M${at([318, -137, 9]).join(' ')}V${at([318, -137, 0])[1]}`} />
        </g>
        <Sign u={340} v={-112} lines={['Check-in', 'before you stop']} post={66} />

        {/* 2. The valley: the red ▼ board and "See the dip in context". */}
        <path d={`M${dipBoard[0] - 14} ${dipBoard[1]}v-34M${dipBoard[0] + 14} ${dipBoard[1]}v-34`} strokeWidth="2" />
        <rect x={dipBoard[0] - 34} y={dipBoard[1] - 90} width="68" height="58" rx="8" className="fill-surface" strokeWidth="1.5" />
        <polygon points={`${dipBoard[0] - 18},${dipBoard[1] - 76} ${dipBoard[0] + 18},${dipBoard[1] - 76} ${dipBoard[0]},${dipBoard[1] - 46}`} className="fill-loss stroke-loss" />
        <Sign u={335} v={40} z={DIP} lines={['See the dip', 'in context']} post={60} dx={12} />

        {/* 4. The hill: a road up to the house, and the flag. A small office down the hill. */}
        <Box u={[470, 625]} v={[-205, -130]} z={[0, 34]} top="fill-primary-soft" left="fill-primary" right="fill-logo-green" />
        <g strokeWidth="2.5">
          <polygon points={pts([503, -92, 0], [547, -92, 0], [547, -130, 34], [503, -130, 34])} className="fill-road" />
          <polygon points={pts(...flat(503, 547, -160, -130, 34))} className="fill-road" />
        </g>
        <g className="stroke-none">
          <polygon points={pts([503, -92, 0], [547, -92, 0], [547, -130, 34], [503, -130, 34])} className="fill-road" />
          <polygon points={pts(...flat(503, 547, -160, -130, 34))} className="fill-road" />
        </g>
        <polygon points={pts([547, -92, 0], [547, -130, 34], [547, -130, 0])} className="fill-line" />
        <path d={`M${flag[0]} ${flag[1]}V${flagTop}`} strokeWidth="2.5" />
        <path d={`M${flag[0]} ${flagTop}h136l-14 20l14 20h-136z`} className="fill-logo-green" />
        <text x={flag[0] + 62} y={flagTop + 27} textAnchor="middle" className="fill-surface stroke-none text-[21px] font-bold max-md:hidden">
          Your goal
        </text>
        <polygon points={pts([560, -150, 34], [610, -150, 34], [610, -150, 62], [560, -150, 62])} className="fill-surface" />
        <polygon points={pts([610, -190, 34], [610, -150, 34], [610, -150, 62], [610, -170, 82], [610, -190, 62])} className="fill-line" />
        <polygon points={pts([556, -170, 82], [614, -170, 82], [614, -147, 59], [556, -147, 59])} className="fill-logo-green" />
        <polygon points={pts([570, -150, 34], [582, -150, 34], [582, -150, 52], [570, -150, 52])} className="fill-logo-navy" />
        <Window u={590} v={-150} z={42} face="left" />
        <Window u={610} v={-176} z={42} face="right" />
        <Box u={[590, 628]} v={[-36, -4]} z={[0, 40]} top="fill-page" left="fill-surface" right="fill-line" />
        {[10, 28].map((z) => (
          <g key={z}>
            <Window u={596} v={-4} z={z} face="left" />
            <Window u={612} v={-4} z={z} face="left" />
            <Window u={628} v={-30} z={z} face="right" />
            <Window u={628} v={-16} z={z} face="right" />
          </g>
        ))}

        {/* Front of the map: a small house at the start, and trees. */}
        <Box u={[18, 62]} v={[156, 196]} z={[0, 26]} top="fill-page" left="fill-surface" right="fill-line" />
        <polygon points={pts([14, 176, 44], [66, 176, 44], [66, 199, 22], [14, 199, 22])} className="fill-logo-green" />
        <polygon points={pts([62, 156, 26], [62, 196, 26], [62, 176, 44])} className="fill-line" />
        <polygon points={pts([30, 196, 0], [40, 196, 0], [40, 196, 16], [30, 196, 16])} className="fill-logo-navy" />
        <Tree u={104} v={184} pine />
        <Tree u={186} v={168} />
        <Tree u={252} v={190} pine />
        <Tree u={330} v={186} />
        <Tree u={404} v={176} pine />

        <g className="goalmap-car" transform={`translate(${r1(startX - OX)} ${r1(startY - OY)})`}>
          <Car along="u" />
          <Car along="v" />
        </g>
      </svg>
      <ol className="mt-4 grid gap-2 text-sm text-strong md:hidden">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </figure>
  );
}
