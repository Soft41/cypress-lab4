import { shopCredentials } from '../../support/commands';

describe('CNC-Flow — реєстрація цеху та співробітників', () => {
  const shop = shopCredentials();
  const tech = { name: 'Технолог Олена', email: shop.email.replace('@', '.tech@'), password: 'Tech-pass-123' };

  it('«Создать цех» зі сторінки входу: новий цех, адмін, одразу всередині', () => {
    cy.visit('/login');
    cy.contains('a', 'Создать цех').click();
    cy.location('pathname').should('eq', '/signup');

    cy.intercept('POST', '/api/auth/signup').as('signup');
    cy.get('#signup-company').type(shop.company);
    cy.get('#signup-name').type(shop.fullName);
    cy.get('#signup-email').type(shop.email);
    cy.get('#signup-password').type(shop.password, { log: false });
    cy.contains('button', 'Создать цех').click();

    cy.wait('@signup').then(({ request, response }) => {
      expect(request.body).to.include({ company: shop.company, fullName: shop.fullName, email: shop.email, lang: 'ru' });
      expect(response.statusCode).to.eq(201);
    });
    cy.rememberAccount('Адмін (форма «Создать цех»)', shop);
    cy.getCookie('cf_session').should('have.property', 'httpOnly', true);

    cy.location('pathname').should('eq', '/');
    cy.get('main h1').should('contain', shop.fullName);
    cy.get('[data-testid=how-it-works]').should('contain', 'готово 0 из 5');
    cy.get('aside nav').should('contain', 'Пользователи').and('contain', 'Система');
    cy.request('/api/machines').its('body').should('have.length', 0);
    cy.request('/api/techcards').its('body').should('have.length', 0);
    cy.screenshot('01-novyi-tsekh');
  });

  it('вихід і вхід через форму тим самим паролем; невірний пароль — помилка', () => {
    cy.loginByForm(shop.email, 'wrong-password');
    cy.location('pathname').should('eq', '/login');
    cy.get('form').should('contain.text', 'Неверный');

    cy.loginByForm(shop.email, shop.password);
    cy.location('pathname').should('eq', '/');
    cy.get('main h1').should('contain', shop.fullName);
  });

  it('той самий email ще раз — «уже занят», нового цеху не з’являється', () => {
    cy.visit('/signup');
    cy.get('#signup-company').type('Цех-дубль');
    cy.get('#signup-name').type('Хтось');
    cy.get('#signup-email').type(shop.email);
    cy.get('#signup-password').type('another-pass', { log: false });
    cy.contains('button', 'Создать цех').click();
    cy.get('[role=alert]').should('contain', 'Этот email уже занят');
    cy.location('pathname').should('eq', '/signup');
  });

  it('адмін цеху реєструє технолога через форму «Пользователи»', () => {
    cy.loginAs(shop.email, shop.password);
    cy.visit('/users');
    cy.intercept('POST', '/api/users').as('createUser');

    cy.contains('button', 'Добавить сотрудника').click();
    cy.get('dialog[open]').within(() => {
      cy.get('#user-name').type(tech.name);
      cy.get('#user-role').select('TECHNOLOGIST');
      cy.get('#user-email').type(tech.email);
      cy.get('#user-password').type(tech.password, { log: false });
      cy.contains('button', 'Сохранить').click();
    });

    cy.wait('@createUser').then(({ request, response }) => {
      expect(request.body).to.include({ fullName: tech.name, role: 'TECHNOLOGIST', email: tech.email });
      expect(response.statusCode).to.eq(201);
      expect(response.body).not.to.have.property('passwordHash');
    });
    cy.rememberAccount('Технолог', { company: shop.company, email: tech.email, password: tech.password });
    cy.contains('tr, li, div', tech.name).should('be.visible');
  });

  it('технолог входить через форму і бачить лише свої розділи', () => {
    cy.loginByForm(tech.email, tech.password);
    cy.location('pathname').should('eq', '/');
    cy.get('main h1').should('contain', tech.name);
    cy.get('aside nav').should('contain', 'Техкарты').and('not.contain', 'Пользователи').and('not.contain', 'Система');
  });
});
