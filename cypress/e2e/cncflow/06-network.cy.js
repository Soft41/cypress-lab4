describe('CNC-Flow — підміна відповідей сервера (cy.intercept)', () => {
  beforeEach(() => cy.freshShop());

  it('порожній цех: зведення показує «Як влаштований CNC-Flow» і перший крок', () => {
    cy.intercept('GET', '/api/dashboard', { fixture: 'dashboard-empty.json' }).as('dashboard');
    cy.visit('/');
    cy.wait('@dashboard');
    cy.get('[data-testid=how-it-works]').should('be.visible').and('contain', 'готово 0 из 5');
    cy.get('[data-testid=how-step]').should('have.length', 5).first().should('have.attr', 'href', '/holder');
    cy.contains('Следующий шаг').closest('a').should('have.attr', 'href', '/holder');
  });

  it('сервер впав — повідомлення і «Повторить», після відновлення — дані', () => {
    let fail = true;
    cy.intercept('GET', '/api/dashboard', (req) => {
      if (fail) req.reply({ statusCode: 500, body: { message: 'boom' } });
      else req.continue();
    }).as('dashboard');
    cy.visit('/');
    cy.contains('Не удалось загрузить данные', { timeout: 15000 }).should('be.visible');
    cy.then(() => {
      fail = false;
    });
    cy.contains('button', 'Повторить').click();
    cy.contains('Не удалось загрузить данные').should('not.exist');
    cy.contains('Сегодня в цеху').should('be.visible');
  });

  it('прошивки терміналів: збій оновлення і стара прошивка показуються зрозуміло', () => {
    cy.intercept('GET', '/api/firmware', { fixture: 'firmware.json' }).as('fw');
    cy.visit('/system');
    cy.wait('@fw');
    cy.get('[data-testid=firmware-panel]').within(() => {
      cy.contains('[data-testid=firmware-row]', '0.2.1').should('contain', 'целевая');
      cy.contains('[data-testid=firmware-terminal]', 'Станок 1').should('contain', 'не вышло: HTTP_UPDATE_FAILED: MD5');
      cy.contains('[data-testid=firmware-terminal]', 'Станок 2').should('contain', 'старая прошивка');
      cy.contains('[data-testid=firmware-terminal]', 'Станок 4').should('contain', 'актуальная');
      cy.contains('button', 'Обновить сейчас').should('be.enabled');
    });
  });

  it('кнопка «Оновити зараз» шле команду і показує відповідь сервера', () => {
    cy.intercept('GET', '/api/firmware', { fixture: 'firmware.json' });
    cy.intercept('POST', '/api/firmware/push', { statusCode: 201, body: { sent: 1, waiting: 0 } }).as('push');
    cy.visit('/system');
    cy.contains('button', 'Обновить сейчас').click();
    cy.wait('@push');
    cy.contains('Команда отправлена: 1').should('be.visible');
  });
});
