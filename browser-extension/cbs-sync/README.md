# Category Draft Coach CBS Sync Extension

This Chrome extension watches the CBS live draft room and sends detected picks to Category Draft Coach so off-board players are removed automatically.

## Load in Chrome (Developer Mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder: `browser-extension/cbs-sync`.

## Use During Draft

1. Open the CBS draft room in one tab.
2. Open Category Draft Coach in another tab (`http://localhost:3000` or your Vercel URL).
3. In the app header, look for **CBS sync live**.
4. If needed, click the extension icon and press **Refresh**.

## Notes

- Host permissions include `http://localhost:3000/*` and `https://*.vercel.app/*`.
- If your deployed app uses a custom domain, add that domain to `manifest.json` in `host_permissions` and the app content script matches.
- This sync is heuristic-based (DOM observation), so keep manual controls available as a fallback.
