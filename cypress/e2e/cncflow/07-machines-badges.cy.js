const MACHINES = [
  { name: 'Станок А-1', controller: 'DDCS_V3_1', signal: 'OUT2, M10' },
  { name: 'Станок Б-2', controller: 'RICHAUTO_A11', signal: 'OUT1, M10/M11' },
];
const OPERATORS = { ivan: 'Оператор Иван', petro: 'Оператор Пётр' };

describe('CNC-Flow — станки, оператори, бейджі, термінал', () => {
  const badges = {};
  const terminal = `cy-${Date.now().toString(36)}`;

  beforeEach(() => cy.freshShop());

  const machineRow = (name) => cy.contains('main table tr', name);

  it('адмін додає два станки через форму', () => {
    cy.visit('/machines');
    cy.intercept('POST', '/api/machines').as('create');
    for (const m of MACHINES) {
      cy.contains('button', 'Добавить станок').click();
      cy.get('dialog[open]').within(() => {
        cy.get('#machine-name').type(m.name);
        cy.get('#machine-controller').select(m.controller);
        cy.get('#machine-signal').type(m.signal);
        cy.contains('button', 'Сохранить').click();
      });
      cy.wait('@create').then(({ request, response }) => {
        expect(request.body).to.include({ name: m.name, controllerType: m.controller, signalNote: m.signal });
        expect(response.statusCode).to.eq(201);
      });
      machineRow(m.name).should('contain', m.signal).and('contain', 'не привязан').and('contain', 'все');
    }
  });

  it('оператори: заводимо двох і випускаємо QR-бейджі', () => {
    cy.visit('/users');
    cy.get('main table').should('be.visible');
    for (const name of Object.values(OPERATORS)) {
      cy.get('main table').then(($t) => {
        if ($t.text().includes(name)) return;
        cy.contains('button', 'Добавить сотрудника').click();
        cy.get('dialog[open]').within(() => {
          cy.get('#user-name').type(name);
          cy.get('#user-role').select('OPERATOR');
          cy.contains('button', 'Сохранить').click();
        });
      });
      cy.contains('main tr', name).contains('button', /Выпустить|Перевыпустить/).should('be.visible');
    }

    cy.intercept('POST', '/api/users/*/badge').as('badge');
    for (const [key, name] of Object.entries(OPERATORS)) {
      cy.contains('main tr', name).contains('button', /Выпустить|Перевыпустить/).click();
      cy.wait('@badge').then(({ response }) => {
        expect(response.statusCode).to.eq(201);
        expect(response.body).to.include({ fullName: name, role: 'OPERATOR' });
        expect(response.body.token, 'код бейджа').to.have.length.of.at.least(16);
        badges[key] = response.body.token;
      });
      cy.get('dialog[open]').within(() => {
        cy.contains(`Бейдж: ${name}`).should('be.visible');
        cy.contains('Код показывается один раз').should('be.visible');
        cy.get('svg').should('exist');
        cy.contains('button', 'Печать').should('be.visible');
      });
      if (key === 'ivan') cy.screenshot('01-beidzh-operatora');
      cy.get('dialog[open] button[aria-label=close]').click();
      cy.get('dialog[open]').should('not.exist');
      cy.contains('main tr', name).should('contain', 'Перевыпустить').and('contain', 'Отозвать');
    }
  });

  it('допуск до станка: на «Станок А-1» — лише Іван', () => {
    cy.visit('/machines');
    cy.intercept('PUT', '/api/machines/*/operators').as('operators');
    machineRow(MACHINES[0].name).contains('button', 'все').click();
    cy.get('dialog[open]').within(() => {
      cy.contains('label', OPERATORS.ivan).click();
      cy.contains('button', 'Сохранить').click();
    });
    cy.wait('@operators').its('response.statusCode').should('be.oneOf', [200, 201]);
    machineRow(MACHINES[0].name).should('contain', '1 чел.');
    machineRow(MACHINES[1].name).should('contain', 'все');
  });

  it('термінал: привʼязка за PIN, потім вхід за бейджем — з перевіркою допуску й відкликання', () => {
    expect(badges.ivan, 'бейджі випущено в попередньому тесті').to.be.a('string');

    cy.visit(`/terminal?t=${terminal}`);
    cy.contains(/^\d{6}$/, { timeout: 15000 })
      .invoke('text')
      .then((pin) => {
        cy.log(`PIN з екрана терміналу: **${pin}**`);
        cy.visit('/machines');
        cy.intercept('POST', '/api/machines/*/pair').as('pair');
        machineRow(MACHINES[0].name).contains('button', 'Привязать').click();
        cy.get('dialog[open]').within(() => {
          cy.get('#pair-pin').type(pin);
          cy.contains('button', 'Привязать').click();
          cy.contains('Готово').should('be.visible');
        });
        cy.wait('@pair').its('response.statusCode').should('eq', 200);
      });

    cy.visit(`/terminal?t=${terminal}`);
    cy.contains(`Станок: ${MACHINES[0].name}`, { timeout: 20000 }).should('be.visible');

    const scan = (token) => {
      cy.get('#term-scan').clear().type(token, { log: false });
      cy.get('#term-scan').closest('form').submit();
    };

    cy.then(() => scan(badges.petro));
    cy.contains('Нет допуска к этому станку').should('be.visible');

    cy.visit('/users');
    cy.intercept('DELETE', '/api/users/*/badge').as('revoke');
    cy.contains('main tr', OPERATORS.petro).contains('button', 'Отозвать').click();
    cy.wait('@revoke').its('response.statusCode').should('eq', 200);
    cy.contains('main tr', OPERATORS.petro).should('contain', 'Выпустить').and('not.contain', 'Отозвать');

    cy.visit(`/terminal?t=${terminal}`);
    cy.contains(`Станок: ${MACHINES[0].name}`, { timeout: 20000 });
    cy.then(() => scan(badges.petro));
    cy.contains('Бейдж не найден или отозван').should('be.visible');

    cy.then(() => scan(badges.ivan));
    cy.contains(`Здравствуйте, ${OPERATORS.ivan}`).should('be.visible');
    cy.screenshot('02-terminal-operator-uviishov');
  });

  it('CRM бачить привʼязаний термінал; відвʼязка і видалення станка', () => {
    cy.visit('/machines');
    machineRow(MACHINES[0].name).should('contain', 'virtual-0.1').and('not.contain', 'не привязан');

    cy.intercept('DELETE', '/api/machines/*/device').as('unpair');
    machineRow(MACHINES[0].name).contains('button', 'Отвязать').click();
    cy.wait('@unpair').its('response.statusCode').should('eq', 200);
    machineRow(MACHINES[0].name).should('contain', 'не привязан');

    cy.intercept('DELETE', '/api/machines/*').as('remove');
    machineRow(MACHINES[1].name).contains('button', 'Удалить').click();
    cy.wait('@remove').its('response.statusCode').should('eq', 200);
    cy.contains('main table', MACHINES[1].name).should('not.exist');
    machineRow(MACHINES[0].name).should('exist');
  });
});
