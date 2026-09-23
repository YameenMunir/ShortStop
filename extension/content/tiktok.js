/*
 * ShortStop: TikTok
 * =================
 * TikTok is short-form video end to end, so the whole site is swapped for
 * ShortStop's "blocked" page. Switching TikTok off in the popup takes you back
 * to the page you were trying to open.
 */
ShortStop.start({
  id: 'tiktok',
  hosts: ['tiktok.com'],
  blockSite: true,
});
