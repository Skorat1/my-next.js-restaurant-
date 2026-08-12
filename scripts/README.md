# Useful Scripts

## Create Admin Account

```bash
cd backend
node scripts/seed-admin.js
```

This creates an admin user with credentials from `.env`:
- `ADMIN_EMAIL` (default: `admin@restaurant.com`)
- `ADMIN_PASSWORD` (default: `Admin@123456`)
- `ADMIN_NAME` (default: `Admin`)

If the user already exists, it promotes them to the admin role.

## Seed Menu Items (with images)

```bash
cd backend
node scripts/seed-menu.js
```

This populates the menu collection with dishes that reference the images already
present in `backend/uploads/` (e.g. `gujratithali.png`, `panjabi thali.jpg`, etc.).
Existing items are skipped unless they are missing an image, in which case the
image filename is filled in.

> **Note:** Make sure the backend server is running so the `/uploads` static route
> can serve these images to the frontend menu page.
