# Clara — finanzas personales con React, Node.js y SQLite

Este paquete contiene una aplicación completa y tradicional, dividida en dos proyectos:

- `frontend/`: React escrito en JavaScript y JSX, construido con Vite.
- `backend/`: API en Node.js y Express.
- `backend/src/db/schema.sql`: esquema de la base de datos SQL.
- `backend/data/clara.sqlite`: archivo SQLite creado automáticamente al ejecutar el sistema.

No usa TypeScript, TSX, Cloudflare D1 ni servicios privados de OpenAI. Puedes ejecutarlo en tu computadora o subirlo a un hosting que permita aplicaciones Node.js y almacenamiento persistente.

## Funciones incluidas

- Panel con patrimonio y flujo mensual.
- Registro de ingresos y gastos.
- Categorías y presupuestos mensuales.
- Varias cuentas: banco, ahorro y efectivo.
- Transferencias internas entre cuentas.
- Metas de ahorro y aportes.
- Historial con búsqueda y filtros.
- Interfaz adaptable para computadora y celular.
- API JSON independiente.
- Base SQLite con índices, restricciones y operaciones atómicas.
- Datos de ejemplo creados automáticamente la primera vez.

## Requisitos

- Node.js 22.13 o superior. Se recomienda Node.js 24.
- npm.

La base usa el módulo nativo `node:sqlite`; por eso no necesita instalar controladores SQLite externos.

## Instalación rápida

Abre una terminal en esta carpeta y ejecuta:

```bash
npm install
npm run dev
```

`npm install` instala automáticamente las dependencias del frontend y del backend.

Durante el desarrollo:

- Frontend: `http://localhost:5173`
- Backend/API: `http://localhost:4000`
- Estado de la API: `http://localhost:4000/api/health`

## Ejecutarlo como producción

```bash
npm install
npm start
```

El sistema compila el frontend, lo sirve desde el backend y queda disponible en:

```text
http://localhost:4000
```

## Probar que todo funciona

```bash
npm test
```

Las pruebas crean una base temporal, consultan la API, guardan un ingreso y comprueban que el saldo cambie. Después también se compila el frontend.

## Base de datos

El archivo se crea en:

```text
backend/data/clara.sqlite
```

Tablas incluidas:

- `accounts`: cuentas y saldos.
- `categories`: categorías y límites mensuales.
- `transactions`: ingresos, gastos y transferencias.
- `goals`: metas y progreso de ahorro.
- `app_meta`: versión y control de datos iniciales.

Puedes abrir el archivo con DB Browser for SQLite, DBeaver u otra herramienta compatible.

## Variables de entorno

Puedes configurar:

```text
PORT=4000
DB_PATH=./data/clara.sqlite
CORS_ORIGIN=http://localhost:5173
```

El archivo `backend/.env.example` sirve como referencia. Node.js no carga el archivo `.env` automáticamente en este proyecto; configura estas variables desde tu hosting o sistema operativo.

## Subirlo a un hosting Node.js

Servicios como Railway, Render, Fly.io, DigitalOcean o un VPS pueden ejecutar este proyecto. Configura:

- Instalación: `npm install`
- Inicio: `npm start`
- Puerto: el hosting asigna `PORT` automáticamente.
- Disco persistente: monta una carpeta permanente para SQLite y apunta `DB_PATH` hacia ella.

Ejemplo de ruta persistente:

```text
DB_PATH=/data/clara.sqlite
```

Sin un disco persistente, algunos proveedores borran la base al reiniciar o volver a desplegar.

## Ejecutarlo con Docker

```bash
docker compose up --build
```

Después abre `http://localhost:4000`. El volumen `clara_data` conserva la base aunque el contenedor se vuelva a crear.

## API principal

- `GET /api/health`: estado del backend.
- `GET /api/finance`: cuentas, categorías, movimientos, metas y resumen.
- `POST /api/finance`: registra las operaciones enviadas desde el frontend.

Los montos se almacenan como centavos enteros para evitar errores de redondeo.

## Importante

Las transferencias solamente mueven saldo entre cuentas registradas dentro de Clara. No realizan transferencias bancarias reales ni solicitan credenciales de banco.
