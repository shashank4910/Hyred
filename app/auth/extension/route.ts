/**
 * GET /auth/extension
 *
 * Server-side auth page for the extension auto-connect flow.
 *
 * How it works:
 *   1. User clicks "Connect to Hyred" in the extension popup
 *   2. Popup opens this page in a new tab
 *   3. Server reads Supabase session cookies → checks if user is logged in
 *   4. If authenticated: generates an extension JWT, renders an HTML page
 *      that writes the JWT to localStorage under `hyred_extension_token`
 *   5. Extension background.js injects a MAIN-world script into this tab
 *      to read the token, saves it to chrome.storage, and closes the tab
 *   6. Popup updates to "Connected" state
 *
 * If not authenticated: shows a "Please log in" message with a link.
 */
import { createServerSupabase } from '@/lib/supabase/server';
import { signExtensionToken } from '@/lib/extension/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never cache — session check must be fresh

export async function GET() {
  let html: string;

  try {
    // Check Supabase session from cookies
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      // Not logged in — show login prompt
      html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect Extension · Hyred</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font: -apple-system, system-ui, Segoe UI, Roboto, sans-serif;
      background: #0b0d10; color: #e6ebf2;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
    }
    .card {
      background: #14181d; border: 1px solid #252b33;
      border-radius: 12px; padding: 32px; max-width: 420px; text-align: center;
    }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #8a94a3; line-height: 1.5; margin-bottom: 20px; }
    .btn {
      display: inline-block; padding: 10px 24px;
      background: #7cffb2; color: #0b0d10; text-decoration: none;
      border-radius: 8px; font-weight: 700;
    }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Not signed in</h1>
    <p>You need to be logged into Hyred to connect the extension.</p>
    <a class="btn" href="/login?next=/auth/extension">Sign in to Hyred</a>
  </div>
</body>
</html>`;
    } else {
      // Authenticated — get profile and sign JWT
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile) {
        html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect Extension · Hyred</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font: -apple-system, system-ui, Segoe UI, Roboto, sans-serif;
      background: #0b0d10; color: #e6ebf2;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
    }
    .card { background: #14181d; border: 1px solid #252b33; border-radius: 12px; padding: 32px; max-width: 420px; text-align: center; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #8a94a3; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Profile not found</h1>
    <p>No Hyred profile found for your account. Please set up your profile first.</p>
  </div>
</body>
</html>`;
      } else {
        // Sign a 90-day extension JWT
        const token = await signExtensionToken(profile.id);

        html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>✅ Connected to Hyred</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font: -apple-system, system-ui, Segoe UI, Roboto, sans-serif;
      background: #0b0d10; color: #e6ebf2;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
    }
    .card {
      background: #14181d; border: 1px solid #252b33;
      border-radius: 12px; padding: 32px; max-width: 420px; text-align: center;
    }
    .check { font-size: 48px; margin-bottom: 12px; }
    h1 { font-size: 20px; margin-bottom: 8px; color: #7cffb2; }
    p { color: #8a94a3; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✅</div>
    <h1>Connected!</h1>
    <p>Your extension is now linked to your Hyred account.<br />You can close this tab and go back to the extension popup.</p>
  </div>
  <script>
    (function() {
      try {
        localStorage.setItem('hyred_extension_token', ${JSON.stringify(token)});
      } catch(e) {
        console.warn('[Hyred] Failed to write token to localStorage:', e);
      }
    })();
  </script>
</body>
</html>`;
      }
    }
  } catch (e) {
    // Fallback error page
    html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Error · Hyred</title></head>
<body style="font-family:sans-serif;background:#0b0d10;color:#e6ebf2;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="text-align:center;max-width:420px;padding:32px;">
    <h1 style="font-size:20px;margin-bottom:12px;">Something went wrong</h1>
    <p style="color:#8a94a3;">${(e as Error).message}</p>
  </div>
</body>
</html>`;
  }

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
