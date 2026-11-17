import { evaluate, formulaFromText, tokenize } from '../support/math';

describe('Розбирач формул для math.html', () => {
  it('формула із сайту збігається з «ручним» обчисленням', () => {
    for (const x of [1, 10, 333, 1000]) expect(evaluate('ln(abs(12*sin(x)))', x)).to.eq(Math.log(Math.abs(12 * Math.sin(x))));
  });

  it('пріоритети, дужки, унарний мінус, степінь справа наліво', () => {
    expect(evaluate('2 + 3 * 4', 0)).to.eq(14);
    expect(evaluate('(2 + 3) * 4', 0)).to.eq(20);
    expect(evaluate('-x^2', 3)).to.eq(-9);
    expect(evaluate('2^3^2', 0)).to.eq(512);
    expect(evaluate('2**10', 0)).to.eq(1024);
    expect(evaluate('2^-1', 0)).to.eq(0.5);
    expect(evaluate('(-x)^2', 3)).to.eq(9);
    expect(evaluate('10 / 4 - 1', 0)).to.eq(1.5);
    expect(evaluate('.5 * x', 4)).to.eq(2);
  });

  it('функції й константи, регістр не важливий', () => {
    expect(evaluate('sqrt(x)', 16)).to.eq(4);
    expect(evaluate('exp(ln(x))', 7)).to.be.closeTo(7, 1e-12);
    expect(evaluate('SIN(pi/2)', 0)).to.eq(1);
    expect(evaluate('log10(x)', 1000)).to.be.closeTo(3, 1e-12);
    expect(evaluate('abs(cos(pi)) + e', 0)).to.be.closeTo(1 + Math.E, 1e-12);
  });

  it('незнайома функція, сміття, незакрита дужка — зрозуміла помилка, а не тихо невірна відповідь', () => {
    expect(() => evaluate('foo(x)', 1)).to.throw('Невідома функція або змінна «foo»');
    expect(() => evaluate('ln(x', 1)).to.throw('Очікувалось «)»');
    expect(() => evaluate('2 $ 3', 1)).to.throw('Незрозумілий символ «$»');
    expect(() => evaluate('2 3', 1)).to.throw('Зайве «3»');
    expect(() => evaluate('alert(1)', 1)).to.throw('Невідома');
  });

  it('формула з тексту сторінки — те, що між «What is» і «, where x =»', () => {
    expect(formulaFromText('  What is ln(abs(12*sin(x))), where x =   10 ?')).to.eq('ln(abs(12*sin(x)))');
    expect(formulaFromText('What is  sqrt(x) + 1 ,  where  x = 5')).to.eq('sqrt(x) + 1');
    expect(() => formulaFromText('Hello')).to.throw('не знайдено формулу');
  });

  it('токени: числа, імена, оператори', () => {
    expect(tokenize('12*sin(x)').map((t) => t.value)).to.deep.eq([12, '*', 'sin', '(', 'x', ')']);
  });
});
