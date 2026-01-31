# Seamless Tiles

App tipo Unsplash para patrones seamless (React Router v7 monolito). Incluye auth por email con código de 6 dígitos, roles, upload a Cloudflare R2, previews con watermark, descargas protegidas, y tracking básico.

## Requisitos

- Node 20+
- MongoDB
- Cloudflare R2 (S3 compatible)
- Resend
- (Opcional) Redis

## Setup

```bash
pnpm install
pnpm dev
```

La app valida las variables de entorno al arrancar. Si falta alguna, fallará con un error claro.

## Variables de entorno (con ejemplos)

```bash
# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=seamless_tiles

# Cloudflare R2 (S3 compatible)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET=seamless-tiles
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev

# Resend
RESEND_API_KEY=re_1234567890abcdef
RESEND_FROM_EMAIL="Seamless Tiles <hello@yourdomain.com>"

# App
APP_BASE_URL=http://localhost:5173
JWT_SECRET=change_this_to_a_32_char_minimum_secret

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Watermark
WATERMARK_TEXT="TileVault • Login to download"
WATERMARK_OPACITY=0.18
WATERMARK_SCALE=0.08

# Download policy: user | creator | admin | any_authenticated
DOWNLOAD_REQUIRE_ROLE=any_authenticated

# OpenAI Image Generation
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_OUTPUT_FORMAT=webp
OPENAI_IMAGE_BACKGROUND=opaque
OPENAI_MAX_IMAGES_PER_REQUEST=1
```

Notas:
- `R2_PUBLIC_BASE_URL` es opcional. Si está vacío, se usan URLs firmadas.
- `REDIS_URL` es opcional. Si falta, el rate limit usa memoria.
- `JWT_SECRET` debe tener mínimo 32 caracteres.

## Modelos (MongoDB)

- `users`: email, name, role, status, timestamps.
- `email_verifications`: email, codeHash (salt:hash), expiresAt TTL, attempts.
- `tiles`: metadata + r2 keys + stats.
- `events`: tracking con índices por tile/user/type.

## Endpoints

Auth:
- `POST /api/auth/register` `{ email, name }`
- `POST /api/auth/send-code` `{ email }`
- `POST /api/auth/verify` `{ email, code }`
- `POST /api/auth/login` `{ email }`
- `POST /api/auth/logout`

Users/Roles:
- `GET /api/me`
- `PATCH /api/admin/users/:id`

Tiles:
- `GET /api/tiles` `?q=&tags=&sort=&page=&limit=`
- `POST /api/tiles`
- `POST /api/r2/sign-upload`
- `POST /api/tiles/:id/finalize`
- `GET /api/tiles/:id`
- `GET /api/tiles/:id/preview`
- `GET /api/tiles/:id/download`

Tracking:
- `POST /api/events/view`
- `POST /api/events/search`

## Flujo de upload

1) `POST /api/tiles` crea el documento base.
2) `POST /api/r2/sign-upload` obtiene URL firmada de subida.
3) Cliente sube el archivo con `PUT` a R2.
4) `POST /api/tiles/:id/finalize` genera preview + thumb con watermark y actualiza metadatos.

## UI

- `/` Home con masonry y búsqueda.
- `/tiles/:id` Detalle con preview y acciones.
- `/login`, `/register`, `/verify` Auth.
- `/upload` (creator/admin).
- `/admin` (admin).
- `/creator/:id` y `/u/:username` perfiles.
- `/generator` (auth) para generar tiles con OpenAI.

## AI Generator

El generador usa templates parametrizados definidos en `app/data/prompt-templates.json`.

Endpoints:
- `GET /api/templates` devuelve templates disponibles.
- `POST /api/ai/generate` genera una imagen con OpenAI, sube a R2 y crea el tile.

El resultado se guarda como tile normal y aparece en la galería.

## Testing

No se incluyen tests automáticos por defecto. Se recomienda mockear servicios externos (Resend, R2, Redis) en unit tests.
