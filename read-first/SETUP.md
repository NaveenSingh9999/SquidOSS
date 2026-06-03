# SquidOSS Setup Wizard

The first time you open SquidOSS, you are greeted by a **7-step Setup Wizard**
at `http://localhost:5173/setup`. This wizard replaces the manual configuration
process with a guided UI.

## How It Works

1. **Index page** (`/`) checks the backend health endpoint and a
   `squidoss_setup_complete` flag in `localStorage`.
2. If no admin account exists and setup is incomplete, you are redirected
   to `/setup`.
3. If setup is complete, you are redirected to `/auth` to log in.
4. Once authenticated, you reach `/dashboard`.

## Step-by-Step

### Step 1: Welcome
A splash screen introducing SquidOSS with version information and a
"Get Started" button.

### Step 2: Admin Account
Create the first administrator account:
- **Email** — admin email address
- **Password** — strong password (min 8 characters)
- This account receives admin privileges automatically

The backend endpoint `POST /auth/register` is called to create the user.

### Step 3: Additional Users (Optional)
Invite additional users to your SquidOSS instance:
- Enter email addresses (comma-separated)
- Each invited user receives a registration link
- Can be skipped if you only need the admin account

### Step 4: Storage Provider Selection
Choose where your files will be stored:
- **Local (MinIO)** — files stored in a local MinIO instance or filesystem
- **Amazon S3** — any S3-compatible bucket
- **Cloudflare R2** — S3-compatible with global CDN and free egress

### Step 5: Provider Configuration
Enter the credentials for the chosen provider:
- **MinIO**: Endpoint URL, Access Key, Secret Key, Bucket name
- **S3**: Region, Access Key ID, Secret Access Key, Bucket name
- **R2**: Account ID, Access Key ID, Secret Access Key, Bucket name

Credentials are stored encrypted via `POST /api/v1/storage/providers`.

### Step 6: Name Your Instance
Give your SquidOSS installation a friendly name (e.g., "Team Squid",
"Home NAS", "Acme Corp Storage").

### Step 7: Ready!
An animated completion screen with confetti effect. The setup wizard
flags the installation as complete and redirects to the auth page.

## Skipping the Wizard

If you prefer manual setup:

1. Register an admin via the API:
   ```bash
   curl -X POST http://localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"securepass123"}'
   ```

2. Login and use the dashboard:
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"securepass123"}'
   ```

3. Configure storage providers via the API or dashboard UI.

## Re-running the Wizard

If you need to re-run the setup, clear local storage and restart:

```bash
# Clear the setup flag (open browser console)
localStorage.removeItem('squidoss_setup_complete')

# Or delete the flag from backend (requires direct DB access)
psql -d squidoss -c "DELETE FROM app_settings WHERE key = 'setup_complete';"
```
