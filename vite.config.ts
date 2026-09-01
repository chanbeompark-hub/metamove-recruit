import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function fixtureHarness(): Plugin {
  return {
    name: 'metamove-fixture-harness',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__fixtures/public', async (request, response, next) => {
        if (request.method !== 'GET' || request.url !== '/') {
          next();
          return;
        }

        const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>메타무브짐 공개 페이지 테스트 픽스처</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/test/harness/publicFixtureMain.tsx"></script>
  </body>
</html>`;
        const transformedHtml = await server.transformIndexHtml(
          '/__fixtures/public',
          html,
        );

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(transformedHtml);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fixtureHarness()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
  },
});
