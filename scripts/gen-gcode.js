const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'cypress', 'fixtures', 'gcode');
const f = (v) => String(Math.round(v * 1000) / 1000);

const header = (title, blank) => ['%', `(CNC-Flow test: ${title})`, `(${blank})`, 'G21 G90 G17 G54', 'G0 Z15'];
const tool = (t, name, rpm) => ['G0 Z15', 'M5', `T${t} M6 (${name})`, `S${rpm} M3`, 'G0 Z5'];
const signal = () => ['G0 Z15', 'M10 (signal: segment done)'];
const footer = () => ['G0 Z15', 'M5', 'G0 X0 Y0', 'M30', '%'];

function circle(cx, cy, r, zs, feed, plunge = 200) {
  const out = [`G0 X${f(cx + r)} Y${f(cy)}`];
  for (const z of zs) out.push(`G1 Z${f(z)} F${plunge}`, `G3 X${f(cx + r)} Y${f(cy)} I${f(-r)} J0 F${feed}`);
  out.push('G0 Z3');
  return out;
}

function peck(x, y, depth, step, feed) {
  const out = [`G0 X${f(x)} Y${f(y)}`, 'G0 Z2'];
  for (let z = -step; ; z -= step) {
    const zz = Math.max(z, -depth);
    out.push(`G1 Z${f(zz)} F${feed}`, 'G0 Z2');
    if (zz <= -depth) break;
  }
  return out;
}

const range = (from, to, step) => {
  const out = [];
  for (let z = from; z >= to - 1e-9; z += step) out.push(Math.round(z * 1000) / 1000);
  return out;
};

function shaiba() {
  const centers = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) centers.push([35 + c * 60, 35 + r * 60]);
  const out = header('Shaiba z chetvertyu - 6 sht/arkush', 'Arkush 190x130x4, nul - livyi nyzhnii kut, Z0 - verkh');
  out.push(...tool(1, 'Freza D3', 18000));
  for (const [x, y] of centers) out.push(...circle(x, y, 8.5, range(-1, -4.5, -1).concat([-4.5]).filter((v, i, a) => a.indexOf(v) === i), 900));
  out.push(...signal());
  out.push(...tool(2, 'Freza D6', 16000));
  for (const [x, y] of centers) out.push(...circle(x, y, 24, [-0.75, -1.5], 1400));
  out.push(...signal());
  out.push(...tool(1, 'Freza D3', 18000));
  for (const [x, y] of centers) out.push(...circle(x, y, 26.5, [-1, -2, -3, -4.2], 900));
  out.push(...signal(), ...footer());
  return out;
}

function starPoints(cx, cy, rOut, rIn) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function shuriken() {
  const centers = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) centers.push([52 + c * 95, 52 + r * 95]);
  const out = header('Shuriken - 4 sht/arkush', 'Arkush 200x200x3, nul - livyi nyzhnii kut, Z0 - verkh');
  out.push(...tool(4, 'Sverdlo D8', 3000));
  for (const [x, y] of centers) out.push(...peck(x, y, 3.6, 1.2, 150));
  out.push(...signal());
  out.push(...tool(3, 'Freza D2', 20000));
  for (const [x, y] of centers) {
    const pts = starPoints(x, y, 41, 13);
    out.push(`G0 X${f(pts[0][0])} Y${f(pts[0][1])}`);
    for (const z of [-1, -2, -3.2]) {
      out.push(`G1 Z${f(z)} F150`);
      for (const [px, py] of [...pts.slice(1), pts[0]]) out.push(`G1 X${f(px)} Y${f(py)} F700`);
    }
    out.push('G0 Z3');
  }
  out.push(...signal(), ...footer());
  return out;
}

function rect(cx, cy, w, h, z, feed) {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  return [`G1 Z${f(z)} F200`, `G1 X${f(x0 + w)} Y${f(y0)} F${feed}`, `Y${f(y0 + h)}`, `X${f(x0)}`, `Y${f(y0)}`];
}

function korpusA() {
  const out = header('Korpus - storona A', 'Zagotovka 80x60x25, nul - tsentr verkhu, bazuvannia po livii i nyzhnii hrani');
  out.push(...tool(2, 'Freza D6', 16000));
  for (const z of range(-2, -12, -2)) {
    out.push('G0 X0 Y0', `G1 Z${f(z)} F200`);
    for (let k = 1; ; k++) {
      const w = Math.min(54, 14 + (k - 1) * 8);
      const h = Math.min(34, (k - 1) * 8 || 4);
      out.push(`G1 X${f(-w / 2)} Y${f(-h / 2)} F1200`, ...rect(0, 0, w, h, z, 1200).slice(1));
      if (w >= 54 && h >= 34) break;
    }
    out.push('G0 Z3');
  }
  out.push(...signal());
  out.push(...tool(7, 'Sverdlo D3.3', 5000));
  for (const [x, y] of [
    [-35, -25],
    [35, -25],
    [35, 25],
    [-35, 25],
  ])
    out.push(...peck(x, y, 26, 3, 120));
  out.push(...signal(), ...footer());
  return out;
}

function korpusB() {
  const out = header('Korpus - storona B (pislia perevorotu)', 'Kryshkoiu vnyz, nul - tsentr verkhu, ta sama baza');
  out.push(...tool(5, 'Tortseva D40', 6000));
  for (const z of [-0.5, -1]) {
    out.push('G0 X-62 Y-30', `G1 Z${f(z)} F300`);
    for (let i = 0, y = -30; y <= 30; i++, y += 30) out.push(`G1 Y${f(y)} F1500`, `G1 X${i % 2 === 0 ? 62 : -62}`);
    out.push('G0 Z3');
  }
  out.push(...signal());
  out.push(...tool(6, 'Faskova 90', 12000));
  out.push('G0 X-41 Y-31', ...rect(0, 0, 82, 62, -2, 900), 'G0 Z3');
  out.push(...signal(), ...footer());
  return out;
}

const files = {
  'shaiba-chetvert.tap': shaiba(),
  'shuriken.tap': shuriken(),
  'korpus-storona-A.tap': korpusA(),
  'korpus-storona-B.tap': korpusB(),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, lines] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), lines.join('\r\n') + '\r\n');
  console.log(`${name}: ${lines.length} рядків`);
}
