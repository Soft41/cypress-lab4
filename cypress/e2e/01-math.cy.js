import { evaluate, formulaFromText } from '../support/math';

const URL = 'http://suninjuly.github.io/math.html';

describe('Завдання 1 — math.html', () => {
  beforeEach(() => {
    for (const host of ['stackpath.bootstrapcdn.com', 'cdnjs.cloudflare.com']) {
      cy.intercept({ hostname: host }, { statusCode: 200, body: '' });
    }
    cy.intercept({ hostname: 'worldclockapi.com' }, { body: { currentDateTime: new Date().toISOString() } });
    cy.visit(URL, { timeout: 20000 });
  });

  const answerFromPage = () =>
    cy
      .get('form label')
      .first()
      .invoke('text')
      .then((label) => {
        const formula = formulaFromText(label);
        cy.get('#input_value')
          .invoke('text')
          .then((xText) => {
            const x = Number(xText.trim());
            expect(x, 'x — число').to.be.a('number').and.not.be.NaN;
            const answer = evaluate(formula, x);
            expect(answer, `${formula} при x = ${x}`).to.be.finite;
            cy.log(`Формула зі сторінки: **${formula}**, x = ${x} → відповідь ${answer}`);
            cy.get('#answer').type(String(answer));
          });
      });

  it('читає формулу і x зі сторінки, рахує, заповнює форму і відправляє', () => {
    const alert = cy.stub().as('alert');
    cy.on('window:alert', alert);

    answerFromPage();
    cy.get('#robotCheckbox').check().should('be.checked');
    cy.get('#robotsRule').check().should('be.checked');
    cy.get('#peopleRule').should('not.be.checked');
    cy.screenshot('01-forma-zapovnena');
    cy.get('button.btn').contains('Submit').click();

    cy.get('@alert').should('have.been.calledOnce');
    cy.get('@alert').its('firstCall.args.0').should('match', /Congrats/i);
  });

  it('без галочки «I\'m the robot» форма не відправляється (required)', () => {
    answerFromPage();
    cy.get('#robotsRule').check();
    cy.get('#robotCheckbox').then(($c) => expect($c[0].checkValidity(), 'checkbox валідний без позначки').to.eq(false));
  });
});
