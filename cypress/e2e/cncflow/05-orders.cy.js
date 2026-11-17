const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const runs = (need, perRun) => Math.ceil(need / perRun);
const runsText = (n) => new RegExp(`×\\s*${n}\\s+запуск`);

describe('CNC-Flow — замовлення: одна деталь і партія з трьох', () => {
  let shop;
  const q = {};
  const orders = {};

  before(() => {
    cy.freshShop();
    cy.setupShop().then((s) => (shop = s));
    cy.orderCode().then((c) => (orders.one = { code: c }));
    cy.orderCode().then((c) => (orders.batch = { code: c }));
    for (const key of ['a', 'b', 'c', 'd']) cy.randomQty().then((n) => (q[key] = n));
    cy.then(() => cy.log(`Шайби: ${q.a} + ${q.b}, сюрикени: ${q.c}, корпуси: ${q.d}; замовлення ${orders.one.code}, ${orders.batch.code}`));
  });

  beforeEach(() => cy.freshShop());

  const card = (code) => cy.contains('[data-testid=order-card]', code);
  const line = (code, part) => card(code).contains('[data-testid=order-line]', part);

  const createOrder = (code, due, lines) => {
    cy.visit('/orders');
    cy.intercept('POST', '/api/orders').as('createOrder');
    cy.contains('button', 'Новый заказ').click();
    cy.get('dialog[open]').within(() => {
      cy.get('#order-customer').type(code);
      cy.get('#order-due').type(due);
      lines.forEach(([key, qty], i) => {
        if (i > 0) cy.contains('button', 'Деталь').click();
        cy.get(`#order-line-${i}-part`).select(shop.parts[key].name);
        cy.get(`#order-line-${i}-qty`).type(String(qty));
      });
      cy.contains('button', 'Сохранить').click();
    });
    return cy.wait('@createOrder').then(({ request, response }) => {
      expect(response.statusCode).to.eq(201);
      expect(request.body.customer).to.match(/^[A-Z0-9-]+$/);
      expect(request.body.lines).to.have.length(lines.length);
      return response.body;
    });
  };

  it('замовлення 1 — одна деталь: бракує всього, ceil(N/6) запусків шайби', () => {
    createOrder(orders.one.code, day(5), [['shaiba', q.a]]).then((o) => (orders.one.number = o.number));
    line(orders.one.code, shop.parts.shaiba.name).should('contain', `0 / ${q.a}`).and('contain', `не хватает ${q.a}`);
    card(orders.one.code)
      .find('[data-testid=order-runs]')
      .should('contain', 'SHB-50')
      .invoke('text')
      .should('match', runsText(runs(q.a, 6)));
  });

  it('замовлення 2 — партія з трьох деталей: запуски кожної техкарти окремо', () => {
    createOrder(orders.batch.code, day(14), [
      ['shaiba', q.b],
      ['shuriken', q.c],
      ['korpus', q.d],
    ]).then((o) => (orders.batch.number = o.number));

    line(orders.batch.code, shop.parts.shaiba.name).should('contain', `не хватает ${q.b}`);
    line(orders.batch.code, shop.parts.shuriken.name).should('contain', `не хватает ${q.c}`);
    line(orders.batch.code, shop.parts.korpus.name).should('contain', `не хватает ${q.d}`);
    card(orders.batch.code)
      .find('[data-testid=order-runs]')
      .within(() => {
        cy.contains('div', 'SHB-50').invoke('text').should('match', runsText(runs(q.b, 6)));
        cy.contains('div', 'SRK-40').invoke('text').should('match', runsText(runs(q.c, 4)));
        cy.contains('div', 'KRP-8060').invoke('text').should('match', runsText(q.d));
      });
    cy.screenshot('01-dva-zamovlennia');

    cy.api('GET', '/orders?status=OPEN').then((list) => {
      const o = list.find((x) => x.customer === orders.batch.code);
      const byCode = Object.fromEntries(o.runs.map((r) => [r.code, r.runs]));
      expect(byCode).to.deep.eq({ 'SHB-50': runs(q.b, 6), 'SRK-40': runs(q.c, 4), 'KRP-8060': q.d });
    });
  });

  it('частина зроблена: склад ділиться за терміном — спершу замовлення 1', () => {
    const half = Math.floor(q.b / 2);
    cy.api('POST', '/stock/adjust', { partId: shop.parts.shaiba.id, counted: q.a + half, note: 'Cypress: випуск SHB-50' });
    cy.api('POST', '/stock/adjust', { partId: shop.parts.shuriken.id, counted: q.c, note: 'Cypress: випуск SRK-40' });

    cy.visit('/orders');
    line(orders.one.code, shop.parts.shaiba.name).should('contain', `на складе ${q.a}`).and('contain', 'всё есть');
    card(orders.one.code).find('[data-testid=order-runs]').should('not.exist');

    line(orders.batch.code, shop.parts.shaiba.name).should('contain', `на складе ${half}`).and('contain', `не хватает ${q.b - half}`);
    line(orders.batch.code, shop.parts.shuriken.name).should('contain', 'всё есть');
    line(orders.batch.code, shop.parts.korpus.name).should('contain', `не хватает ${q.d}`);
    card(orders.batch.code)
      .find('[data-testid=order-runs]')
      .within(() => {
        cy.contains('div', 'SHB-50').invoke('text').should('match', runsText(runs(q.b - half, 6)));
        cy.contains('SRK-40').should('not.exist');
        cy.contains('div', 'KRP-8060').invoke('text').should('match', runsText(q.d));
      });

    cy.visit('/stock');
    cy.contains('[data-testid=stock-row]', shop.parts.shaiba.name).find('[data-testid=stock-qty]').should('have.text', String(q.a + half));
  });

  it('відвантаження замовлення 1 повністю — воно «Выполненные», склад зменшився', () => {
    cy.visit('/orders');
    cy.intercept('POST', '/api/orders/*/ship').as('ship');
    card(orders.one.code).contains('button', 'Отгрузить').click();
    cy.get('dialog[open]').within(() => {
      cy.get('#ship-0').should('have.value', String(q.a));
      cy.contains('button', 'Отгрузить').click();
    });
    cy.wait('@ship').then(({ request, response }) => {
      expect(request.body.lines).to.deep.eq([{ partId: shop.parts.shaiba.id, qty: q.a }]);
      expect(response.body.status).to.eq('DONE');
    });
    card(orders.one.code).should('not.exist');
    cy.contains('button', 'Выполненные').click();
    card(orders.one.code).should('contain', 'Выполнен').and('contain', `${q.a} / ${q.a}`);
    cy.screenshot('02-vykonane-zamovlennia');
  });

  it('партія: відвантажуємо що є, решта лишається в роботі; більше залишку — не дасть', () => {
    const half = Math.floor(q.b / 2);
    cy.visit('/orders');
    cy.intercept('POST', '/api/orders/*/ship').as('ship');
    card(orders.batch.code).contains('button', 'Отгрузить').click();
    cy.get('dialog[open]').within(() => {
      cy.get('#ship-0').should('have.value', String(half));
      cy.get('#ship-1').should('have.value', String(q.c));
      cy.get('#ship-2').should('have.value', '');
      cy.contains('button', 'Отгрузить').click();
    });
    cy.wait('@ship').its('response.body.status').should('eq', 'OPEN');
    line(orders.batch.code, shop.parts.shaiba.name).should('contain', `${half} / ${q.b}`);
    line(orders.batch.code, shop.parts.shuriken.name).should('contain', `${q.c} / ${q.c}`);
    line(orders.batch.code, shop.parts.korpus.name).should('contain', `0 / ${q.d}`);
    cy.screenshot('03-chastkove-vidvantazhennia');

    cy.api('GET', '/orders?status=OPEN').then((list) => {
      const o = list.find((x) => x.customer === orders.batch.code);
      cy.request({
        method: 'POST',
        url: `/api/orders/${o.id}/ship`,
        body: { lines: [{ partId: shop.parts.shaiba.id, qty: 1 }] },
        failOnStatusCode: false,
      }).then((r) => {
        expect(r.status).to.eq(400);
        expect(r.body.message).to.contain('на складе только 0');
      });
    });
  });
});
