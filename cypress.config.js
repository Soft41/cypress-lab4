const { defineConfig } = require('cypress');
const fs = require('fs');
const path = require('path');

const ACCOUNTS_FILE = path.join(__dirname, 'test-accounts.md');

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

function accountsHeader(baseUrl) {
  return [
    `Цех: Цех CY-${RUN_ID} · вхід: ${baseUrl}/login · запуск: ${new Date().toLocaleString('uk-UA')}`,
    '| Роль | Email | Пароль | Створено в |',
    '|---|---|---|---|',
    '',
  ].join('\n');
}

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CNCFLOW_URL || 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1440,
    viewportHeight: 900,
    defaultCommandTimeout: 8000,
    video: true,
    trashAssetsBeforeRuns: false,
    screenshotOnRunFailure: true,
    retries: { runMode: 1, openMode: 0 },
    setupNodeEvents(on, config) {
      config.env.RUN_ID = RUN_ID;
      let withShops = false;
      on('before:run', ({ specs }) => {
        withShops = specs.some((s) => s.relative.replace(/\\/g, '/').includes('/cncflow/'));
        if (withShops) fs.writeFileSync(ACCOUNTS_FILE, accountsHeader(config.baseUrl));
        for (const dir of [config.videosFolder, config.screenshotsFolder]) fs.rmSync(dir, { recursive: true, force: true });
      });
      on('after:run', () => {
        if (withShops && fs.existsSync(ACCOUNTS_FILE)) console.log(`\n${fs.readFileSync(ACCOUNTS_FILE, 'utf8')}\nЗбережено: ${ACCOUNTS_FILE}\n`);
      });

      on('task', {
        async uploadNc({ baseUrl, cookie, fileName }) {
          const content = fs.readFileSync(path.join(__dirname, 'cypress', 'fixtures', 'gcode', fileName));
          const form = new FormData();
          form.append('file', new Blob([content], { type: 'text/plain' }), fileName);
          const res = await fetch(`${baseUrl}/api/files`, { method: 'POST', body: form, headers: { cookie: `cf_session=${cookie}` } });
          const body = await res.json();
          if (!res.ok) throw new Error(`Завантаження ${fileName}: ${res.status} ${JSON.stringify(body)}`);
          return body;
        },

        saveAccount({ spec, role, email, password }) {
          if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, accountsHeader(config.baseUrl));
          fs.appendFileSync(ACCOUNTS_FILE, `| ${role} | ${email} | ${password} | ${spec} |\n`);
          return null;
        },
      });
      return config;
    },
  },
});
