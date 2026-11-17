const FUNCTIONS = {
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  exp: Math.exp,
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

export function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([a-zA-Z_][a-zA-Z0-9_]*)|(\*\*|[-+*/^(),]))/y;
  let pos = 0;
  const text = String(src).trim();
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m || m.index !== pos) throw new Error(`Незрозумілий символ «${text[pos]}» у формулі на позиції ${pos + 1}`);
    if (m[1] !== undefined) tokens.push({ type: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'name', value: m[2].toLowerCase() });
    else tokens.push({ type: 'op', value: m[3] === '**' ? '^' : m[3] });
    pos = re.lastIndex;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  }
  return tokens;
}

export function evaluate(formula, x) {
  const tokens = tokenize(formula);
  let i = 0;
  const peek = () => tokens[i];
  const take = (value) => {
    const t = tokens[i];
    if (!t || t.value !== value) throw new Error(`Очікувалось «${value}» у формулі «${formula}»`);
    i++;
  };

  const expr = () => {
    let v = term();
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) v = tokens[i++].value === '+' ? v + term() : v - term();
    return v;
  };
  const term = () => {
    let v = unary();
    while (peek()?.type === 'op' && (peek().value === '*' || peek().value === '/')) v = tokens[i++].value === '*' ? v * unary() : v / unary();
    return v;
  };
  const unary = () => {
    if (peek()?.type === 'op' && (peek().value === '-' || peek().value === '+')) return tokens[i++].value === '-' ? -unary() : unary();
    return power();
  };
  const power = () => {
    const base = atom();
    if (peek()?.type === 'op' && peek().value === '^') {
      i++;
      return base ** unary();
    }
    return base;
  };
  const atom = () => {
    const t = tokens[i++];
    if (!t) throw new Error(`Формула «${formula}» обірвалась`);
    if (t.type === 'num') return t.value;
    if (t.type === 'op' && t.value === '(') {
      const v = expr();
      take(')');
      return v;
    }
    if (t.type === 'name') {
      if (t.value === 'x') return Number(x);
      if (t.value in CONSTANTS) return CONSTANTS[t.value];
      if (t.value in FUNCTIONS) {
        take('(');
        const arg = expr();
        take(')');
        return FUNCTIONS[t.value](arg);
      }
      throw new Error(`Невідома функція або змінна «${t.value}» у формулі «${formula}»`);
    }
    throw new Error(`Неочікуване «${t.value}» у формулі «${formula}»`);
  };

  const result = expr();
  if (i < tokens.length) throw new Error(`Зайве «${tokens[i].value}» наприкінці формули «${formula}»`);
  return result;
}

export function formulaFromText(text) {
  const m = /What is\s+(.+?),\s*where\s+x\s*=/i.exec(String(text).replace(/\s+/g, ' '));
  if (!m) throw new Error(`На сторінці не знайдено формулу: «${text}»`);
  return m[1].trim();
}
