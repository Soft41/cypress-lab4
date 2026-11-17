const RUN = (Cypress.config('isInteractive') ? null : Cypress.env('RUN_ID')) ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (len) => Array.from({ length: len }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join('');

export function shopCredentials() {
  return {
    company: `Цех CY-${RUN}`,
    fullName: 'Адмін Cypress',
    email: `cy.${RUN}@cncflow.local`.toLowerCase(),
    password: `Cy-${RUN}-pass`,
    lang: 'ru',
  };
}

Cypress.Commands.add('freshShop', () => {
  const creds = shopCredentials();
  cy.session(
    ['shop', creds.email],
    () => {
      cy.request({ method: 'POST', url: '/api/auth/login', body: { email: creds.email, password: creds.password }, failOnStatusCode: false }).then((res) => {
        if (res.status === 200) return;
        cy.request('POST', '/api/auth/signup', creds).its('status').should('eq', 201);
        cy.rememberAccount('Адмін', creds);
      });
    },
    { validate: () => cy.request('/api/auth/me').its('body.user.email').should('eq', creds.email) },
  );
  return cy.wrap(creds, { log: false });
});

Cypress.Commands.add('rememberAccount', (role, { company, email, password }) => {
  cy.task('saveAccount', { spec: Cypress.spec.name, role, company, email, password }, { log: false });
  cy.log(`Вхід: **${email}** / ${password}`);
});

Cypress.Commands.add('loginAs', (email, password) => {
  cy.request('POST', '/api/auth/login', { email, password }).its('status').should('eq', 200);
});

Cypress.Commands.add('loginByForm', (email, password) => {
  cy.visit('/login');
  cy.get('input[type=email]').type(email);
  cy.get('input[type=password]').type(password, { log: false });
  cy.contains('button', 'Войти').click();
});

Cypress.Commands.add('nav', (name) => cy.get('aside nav').contains('a', name));

Cypress.Commands.add('api', (method, url, body) => cy.request({ method, url: `/api${url}`, body }).its('body'));

Cypress.Commands.add('orderCode', () => cy.wrap(`ZK-${randomCode(6)}`));

Cypress.Commands.add('randomQty', () => cy.wrap(Cypress._.random(50, 100)));

Cypress.Commands.add('uploadNc', (fileName) =>
  cy.getCookie('cf_session').then((cookie) => {
    expect(cookie, 'сесія CRM').to.exist;
    return cy.task('uploadNc', { baseUrl: Cypress.config('baseUrl'), cookie: cookie.value, fileName });
  }),
);

Cypress.Commands.add('createTechcard', (card, partIds, fileIds) => {
  const params = { controllerType: 'DDCS_V3_1', sheetsPerRun: 1, partsPerSheet: 1, material: card.material };
  const seen = new Set();
  const steps = card.steps.map(({ file, kind, ...s }) => {
    const ncFileId = file && !seen.has(file) ? fileIds[file] : null;
    if (file) seen.add(file);
    return { ...s, kind: kind ?? 'MACHINE', ncFileId };
  });
  const outputs = Object.entries(card.outputs).map(([key, perSheet]) => ({ partId: partIds[key], perSheet }));
  return cy.api('POST', '/techcards', { code: card.code, title: card.title, ...params }).then((tc) => {
    cy.api('PUT', `/techcards/${tc.id}/draft`, { ...params, steps, outputs });
    cy.api('POST', `/techcards/${tc.id}/draft/publish`);
    return cy.wrap({ id: tc.id, code: card.code, perRun: card.outputs }, { log: false });
  });
});

Cypress.Commands.add('publishedVersion', (techcardId) =>
  cy.api('GET', `/techcards/${techcardId}`).then((tc) => tc.versions.find((v) => v.version === tc.publishedVersion)),
);

Cypress.Commands.add('setupShop', (codes) =>
  cy.fixture('shop').then((shop) => {
    const cards = shop.techcards.filter((c) => !codes || codes.includes(c.code));
    const result = { parts: {}, techcards: {} };
    const fileIds = {};
    cy.api('GET', '/parts').then((existingParts) => {
      const partKeys = [...new Set(cards.flatMap((c) => Object.keys(c.outputs)))];
      for (const key of partKeys) {
        const found = existingParts.find((p) => p.name === shop.parts[key].name);
        if (found) result.parts[key] = found;
        else cy.api('POST', '/parts', shop.parts[key]).then((p) => (result.parts[key] = p));
      }
    });
    cy.api('GET', '/techcards').then((existingCards) => {
      const missing = cards.filter((c) => !existingCards.some((x) => x.code === c.code));
      for (const card of cards.filter((c) => !missing.includes(c))) {
        result.techcards[card.code] = { id: existingCards.find((x) => x.code === card.code).id, code: card.code, perRun: card.outputs };
      }
      const fileNames = [...new Set(missing.flatMap((c) => c.steps.map((s) => s.file).filter(Boolean)))];
      for (const name of fileNames) cy.uploadNc(name).then((f) => (fileIds[name] = f.id));
      cy.then(() => {
        const partIds = Object.fromEntries(Object.entries(result.parts).map(([k, p]) => [k, p.id]));
        for (const card of missing) cy.createTechcard(card, partIds, fileIds).then((tc) => (result.techcards[card.code] = tc));
      });
    });
    return cy.wrap(result, { log: false });
  }),
);
