# CRM Frontend

Vue 3 + TypeScript + Vite + Ant Design Vue + Pinia

## Project Setup

### Install Dependencies

```bash
npm install
```

### Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
crm-frontend/
├── src/
│   ├── api/              # API client and endpoints
│   │   ├── client.ts     # Axios instance with interceptors
│   │   ├── auth.ts       # Authentication API
│   │   └── reestr.ts     # Reestr API
│   ├── assets/           # Static assets
│   ├── components/       # Reusable components
│   │   ├── ReestrForm.vue
│   │   └── ExcelUpload.vue
│   ├── layouts/          # Layout components
│   │   └── MainLayout.vue
│   ├── router/           # Vue Router configuration
│   │   └── index.ts
│   ├── stores/           # Pinia stores
│   │   ├── auth.ts       # Authentication store
│   │   └── reestr.ts     # Reestr store
│   ├── types/            # TypeScript types
│   │   └── api.ts
│   ├── views/            # Page components
│   │   ├── LoginView.vue
│   │   └── ReestrView.vue
│   ├── App.vue
│   └── main.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Features

### Authentication
- Login with JWT token
- Token stored in localStorage
- Protected routes
- Auto-redirect on authentication failure

### Reestr Management
- **List View**: Paginated table with search
- **Create**: Add new entries with dynamic fields
- **Edit**: Update existing entries
- **Delete**: Remove entries with confirmation
- **Excel Upload**: Drag-and-drop file upload

### API Integration
- Axios client with request/response interceptors
- Automatic token injection
- Error handling with user-friendly messages
- Proxy configuration for development

## Demo Accounts

- **User**: `user / user123` (Read-only access)
- **Admin**: `admin / admin123` (Read/Write access)
- **Super Admin**: `superadmin / super123` (Full access)

## Configuration

### API Proxy

The Vite dev server proxies `/api` requests to `http://localhost:5255`. Update `vite.config.ts` if your backend runs on a different port.

### Environment Variables

Create `.env.local` for custom configuration:

```env
VITE_API_BASE_URL=http://localhost:5255
```

## Architecture

### State Management (Pinia)

- **authStore**: Manages authentication state and user session
- **reestrStore**: Manages reestr entries, pagination, and CRUD operations

### API Layer

- **client.ts**: Configured axios instance with interceptors
- **auth.ts**: Authentication endpoints
- **reestr.ts**: Reestr CRUD and upload endpoints

### Routing

- Public routes: `/login`
- Protected routes: `/`, `/reestr`
- Route guards check authentication before navigation

## Development Notes

### Auto-imports

The project uses `unplugin-auto-import` for Vue, Vue Router, and Pinia APIs. No need to manually import `ref`, `computed`, `useRouter`, etc.

### Component Auto-registration

Ant Design Vue components are auto-imported via `unplugin-vue-components`. Use them directly without imports.

### TypeScript

Full TypeScript support with type checking. Run `vue-tsc` to check types before build.

## Troubleshooting

### CORS Issues

If you encounter CORS errors, ensure the backend has CORS configured for `http://localhost:3000`.

### API Connection

Check that the backend is running on `http://localhost:5255` or update the proxy configuration in `vite.config.ts`.

### Authentication Errors

Clear localStorage and try logging in again:

```javascript
localStorage.clear()
```
