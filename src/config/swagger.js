import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Authstack API',
      version: '1.0.0',
      description: 'Backend API for the authstack project — Express + MongoDB on Vercel.',
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local Development Server' },
      { url: 'https://authstack-backend.vercel.app', description: 'Production Server' },
    ],
    tags: [
      { name: 'System', description: 'Health and readiness probes' },
      { name: 'Auth', description: 'Authentication endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // 👇 Use relative paths with forward slashes
  apis: [path.posix.join(process.cwd(), 'docs/api/**/*.yaml')],
};

export const swaggerSpec = swaggerJsdoc(options);

// ---------------------------------------------------------------------------
// CDN assets via jsdelivr — mirrors npm/swagger-ui-dist exactly, so these
// paths are guaranteed to exist. Never load assets from node_modules on
// Vercel: its serverless runtime does not serve bundled static files
// reliably.
// ---------------------------------------------------------------------------
const SWAGGER_DIST_VERSION = '5'; // major-only; resolves to latest 5.x
const CSS_URL = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_DIST_VERSION}/swagger-ui.css`;
const JS_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_DIST_VERSION}/swagger-ui-bundle.js`;
const JS_PRESET_URL = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_DIST_VERSION}/swagger-ui-standalone-preset.js`;

// ---------------------------------------------------------------------------
// GET /api-docs.json — raw spec for codegen, Postman, contract tests, etc.
// ---------------------------------------------------------------------------
export const swaggerJsonHandler = (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(swaggerSpec);
};

// ---------------------------------------------------------------------------
// GET /api-docs — interactive Swagger UI.
//
// HTML is constructed by hand (not swagger-ui-express's generateHTML) so that
// what the browser loads is inspectable via `curl` / view-source. The UI
// fetches the spec from /api-docs.json, which is served above.
// ---------------------------------------------------------------------------
export const swaggerUiHandler = (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authstack API Docs</title>
  <link rel="stylesheet" href="${CSS_URL}">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${JS_BUNDLE_URL}"></script>
  <script src="${JS_PRESET_URL}"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
        docExpansion: 'list',
        persistAuthorization: true,
        displayRequestDuration: true,
        validatorUrl: null,
      });
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};
