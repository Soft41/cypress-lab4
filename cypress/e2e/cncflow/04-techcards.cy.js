describe('CNC-Flow — техкарти: шайба, сюрикен, корпус', () => {
  let shop;
  before(() => cy.fixture('shop').then((s) => (shop = s)));
  beforeEach(() => cy.freshShop());

  it('шайба з четвертю: УП → «розбити на 3 кроки» → що виходить з листа → опублікувати', () => {
    const retry = Cypress.currentRetry ? `-R${Cypress.currentRetry}` : '';
    const base = shop.techcards.find((c) => c.code === 'SHB-50');
    const card = { ...base, code: base.code + retry };
    const part = { ...shop.parts.shaiba, name: shop.parts.shaiba.name + retry };

    cy.visit('/techcards');
    cy.contains('button', 'Новая техкарта').click();
    cy.get('dialog[open]').within(() => {
      cy.get('#tc-code').type(card.code);
      cy.get('#tc-title').type(card.title);
      cy.get('#tc-material').type(card.material);
      cy.contains('button', 'Создать и перейти к шагам').click();
    });
    cy.location('pathname').should('match', /\/techcards\/[0-9a-f-]+\/edit$/);

    cy.intercept('POST', '/api/files').as('upload');
    cy.contains('button', 'Добавить шаг').click();
    cy.get('[data-testid=step-card]').first().find('input[type=file]').selectFile('cypress/fixtures/gcode/shaiba-chetvert.tap', { force: true });
    cy.wait('@upload').its('response.body').then((file) => {
      expect(file.fileName).to.eq('shaiba-chetvert.tap');
      expect(file.analysis.byTool.map((s) => s.tool)).to.deep.eq([1, 2, 1]);
      expect(file.analysis.mCodes.M10, 'сигнали кінця ділянки').to.eq(3);
      expect(file.analysis.warnings).to.be.empty;
      expect(file.hasPreview, 'превʼю траєкторії').to.eq(true);
    });

    cy.get('[data-testid=tool-segments]').should('contain', 'Смены инструмента: 3 участка');
    cy.contains('button', 'Разбить на 3 шага').click();
    cy.get('[data-testid=step-card]').should('have.length', 3);

    card.steps
      .filter((s) => s.file)
      .forEach((s, i) => {
        cy.get('[data-testid=step-card]').eq(i).find('input[id$=-title]').clear().type(s.title);
      });

    cy.contains('button', 'Ручной шаг').click();
    cy.get('[data-testid=step-card]').should('have.length', 4).last().find('input[id$=-title]').type(card.steps[3].title);

    cy.get('[data-testid=outputs-editor]').within(() => {
      cy.get('input[aria-label="Новая деталь…"]').type(part.name);
      cy.contains('button', 'Завести').click();
      cy.get('#out-0-part').find('option:selected').should('have.text', part.name);
      cy.get('#out-0-per').type('6');
    });
    cy.get('[data-testid=outputs-total]').should('contain', `${part.name} 6`);

    cy.intercept('POST', '/api/techcards/*/draft/publish').as('publish');
    cy.contains('button', 'Опубликовать').click();
    cy.wait('@publish').its('response.statusCode').should('eq', 200);
    cy.location('pathname').should('match', /\/techcards\/[0-9a-f-]+$/);
    cy.get('main').should('contain', card.code);
    cy.get('[data-testid=tc-outputs]').should('contain', part.name);
    card.steps.forEach((s) => cy.get('main').should('contain', s.title));
    cy.screenshot('01-tekhkarta-shaiby');
  });

  it('сюрикен і двосторонній корпус — через API; обидві в списку опублікованих', () => {
    cy.setupShop(['SRK-40', 'KRP-8060']).then(({ techcards }) => {
      cy.visit('/techcards');
      for (const code of ['SRK-40', 'KRP-8060']) cy.get('main').should('contain', code);

      cy.publishedVersion(techcards['KRP-8060'].id).then((v) => {
        expect(v.steps.map((s) => s.kind)).to.deep.eq(['MACHINE', 'MACHINE', 'MANUAL', 'MACHINE', 'MACHINE']);
        expect(v.steps.map((s) => s.sheetLabel ?? '')).to.deep.eq(['A', 'A', '', 'B', 'B']);
        expect(v.steps.map((s) => s.ncFile?.fileName ?? null)).to.deep.eq(['korpus-storona-A.tap', null, null, 'korpus-storona-B.tap', null]);
      });
      cy.publishedVersion(techcards['SRK-40'].id).its('steps').should('have.length', 3);
    });
  });

  it('сторінка корпусу: обидві сторони і ручний крок видно технологу й оператору', () => {
    cy.api('GET', '/techcards').then((list) => {
      cy.visit(`/techcards/${list.find((c) => c.code === 'KRP-8060').id}`);
    });
    cy.get('main').should('contain', 'KRP-8060').and('contain', 'Перевернуть заготовку карманом вниз').and('contain', 'Сторона B: фаска 1×45°');
    cy.get('[data-testid=tc-outputs]').should('contain', 'Корпус 80×60');
  });
});
