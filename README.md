# Heavy Rotation

A personal "what I'm loving on Apple Music right now" page. No backend, no database — `songs.json` is the source of truth, committed to this repo.

## Run it locally (to edit)

Needs a local server so the browser can fetch `songs.json` (opening `index.html` directly won't work):

```
python3 -m http.server 5500
```

Then open `http://localhost:5500`. Editing controls (search, add, edit, delete) only appear when running on `localhost` — anyone viewing the deployed site gets a read-only page.

## Adding tracks

Click **+ Add a track**, search (hits Apple's public iTunes Search API — real title, artist, art, and Apple Music link, no API key needed), pick a match, add a one-line note. If a song isn't in Apple's catalog, use "enter it manually."

**Saving:** in Chrome/Edge, the first save shows a native file picker — pick the `songs.json` file in this folder once, and every edit after that (that session) saves straight to disk. In Safari/Firefox (no File System Access API), each save downloads an updated `songs.json` — replace the file in this folder manually.

## Publishing changes

After editing locally:

```
git add songs.json
git commit -m "Update rotation"
git push
```

If deployed on Vercel/Netlify with git integration, that push redeploys automatically.

## Deploying

This is a static site — no build step. Either:

- **Vercel:** `npx vercel` from this folder (or connect the GitHub repo in the Vercel dashboard).
- **Netlify:** drag this folder onto [app.netlify.com/drop](https://app.netlify.com/drop), or connect the repo.
- **GitHub Pages:** push to GitHub, enable Pages on the repo, serve from the root of `main`.

## Later: real Apple Music account sync

Right now, adding a track means searching and picking it yourself. To pull directly from *your* Apple Music library (Recently Played, Heavy Rotation) automatically, you'd need the Apple Developer Program ($99/yr) and MusicKit JS — a bigger step, only worth it if search-and-pick starts feeling like too much friction.
