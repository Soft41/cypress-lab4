const PAGES = [
  { menu: 'Сводка', path: '/', title: /Доброе утро|Добрый день|Добрый вечер|Доброй ночи/ },
  { menu: 'Станки', path: '/machines', title: 'Станки' },
  { menu: 'Журнал', path: '/journal', title: 'Журнал запусков' },
  { menu: 'Заказы', path: '/orders', title: 'Заказы' },
  { menu: 'Склад', path: '/stock', title: 'Склад' },
  { menu: 'Техкарты', path: '/techcards', title: 'Техкарты' },
  { menu: 'Инструмент', path: '/tools', title: 'Инструмент' },
  { menu: 'Холдер', path: '/holder', title: 'Холдер' },
  { menu: 'Пользователи', path: '/users', title: 'Пользователи' },
  { menu: 'Пространства', path: '/workspaces', title: null },
  { menu: 'История', path: '/audit', title: 'История изменений' },
  { menu: 'Система', path: '/system', title: 'Система' },
];

describe('CNC-Flow — перехід по всіх сторінках', () => {
  beforeEach(() => {
    cy.freshShop();
    cy.visit('/');
  });

  it('кожен пункт меню відкриває свою сторінку', () => {
    for (const p of PAGES) {
      cy.nav(p.menu).click();
      cy.location('pathname').should('eq', p.path);
      cy.get('main h1').should('be.visible');
      if (p.title) cy.get('main h1').invoke('text').should('match', typeof p.title === 'string' ? new RegExp(`^${p.title}$`) : p.title);
      cy.contains('Не удалось загрузить данные').should('not.exist');
      cy.nav(p.menu).should('have.class', 'bg-white/10');
    }
  });

  it('технолог не бачить адмінських сторінок, а пряма адреса не ламає застосунок', () => {
    const email = `tech.${Date.now().toString(36)}@cncflow.local`;
    cy.api('POST', '/users', { fullName: 'Технолог Нав', role: 'TECHNOLOGIST', lang: 'ru', email, password: 'Tech-pass-123' });
    cy.clearAllCookies();
    cy.loginAs(email, 'Tech-pass-123');
    cy.visit('/');
    cy.get('aside nav').should('contain', 'Техкарты').and('not.contain', 'Пользователи').and('not.contain', 'Система');
    cy.visit('/system', { failOnStatusCode: false });
    cy.get('main').should('be.visible');
  });

  it('Ctrl+K — пошук по всьому: знаходить сторінку й переходить на неї', () => {
    cy.get('main h1').should('be.visible');
    cy.get('body').type('{ctrl}k');
    cy.get('dialog[open] input').should('be.visible').and('be.focused').type('склад{enter}');
    cy.location('pathname').should('eq', '/stock');
  });

  it('пошук розуміє неправильну розкладку: «crkfl» → «склад»', () => {
    cy.get('main h1').should('be.visible');
    cy.get('body').type('{ctrl}k');
    cy.get('dialog[open] input').type('crkfl{enter}');
    cy.location('pathname').should('eq', '/stock');
  });
});
