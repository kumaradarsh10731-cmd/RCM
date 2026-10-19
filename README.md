# Raja Chor Mantri Sipahi

Files: `index.html`, `style.css`, `script.js`, `firebase-config.js`, `README.md`. Keep them in one folder.

## Open in Acode (Android)
1. Copy the folder to your phone (e.g. Documents/raja-chor).
2. Acode > menu > Open Folder > Add a folder > pick it.
3. Open `index.html`, tap the Play (triangle) icon. Acode serves it in the browser. Or open index.html directly in Chrome.
Local mode needs no internet and no setup.

## Free hosting
- Netlify Drop: drag the folder onto app.netlify.com/drop.
- GitHub Pages: push the files to a repo > Settings > Pages > deploy from main branch.
- Firebase Hosting: `firebase init hosting`, then `firebase deploy`.

## Online leaderboard (Firebase, free Spark plan)
1. console.firebase.google.com > Add project.
2. Build > Authentication > Sign-in method > enable **Anonymous**.
3. Build > Firestore Database > Create (production mode).
4. Project settings > Your apps > Web (</>) > copy the config into `firebase-config.js`. This web config is public by design; never put service-account keys in the app.
5. If you host on your own domain, add it under Authentication > Settings > Authorized domains.
6. Firestore > Rules, paste and publish:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /scores/{id} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(['uid','name','total','rounds','matchId','ts'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 12
        && request.resource.data.total is int && request.resource.data.total >= 0 && request.resource.data.total <= 1000000
        && request.resource.data.rounds is int && request.resource.data.rounds >= 1 && request.resource.data.rounds <= 1000
        && request.resource.data.matchId is string && request.resource.data.matchId.size() <= 40
        && request.resource.data.ts == request.time;
      allow update, delete: if false;
    }
  }
}
```
7. First leaderboard query may ask for an index; the console error includes a one-click link. For `orderBy('total')` alone none is needed.

**Not cheat-proof:** scores are computed in the browser, so anyone can send fake numbers within the rules' limits. The rules only enforce shape and range. Treat the online board as casual fun; real protection needs server-side scoring (Cloud Functions).
The app only says "Uploaded" after the server confirms the write.

## Test checklist
- Menu: every button works; Reset Local Scores asks for confirmation.
- Setup: empty, duplicate, or 13+ char names are rejected; edits persist after refresh.
- Settings: invalid numbers rejected; saved rules apply to the next match.
- Reveal: "Give the phone to X" shows no role; Reveal button enables after ~1 second; role shows only for that player; Hide shows lock screen; no way back to a previous player; 4 players then black screen "Sabhi Players Ready?" with no roles.
- Roles: over many rounds each player gets each role; all four are always different.
- Discussion: timer uses the configured seconds; Start Guessing works at any time.
- Guessing: Raja and Mantri named; Mantri cannot pick themselves; selection hidden; Change answer works before confirm; after Confirm it is locked.
- Scoring: with defaults, correct guess = Raja 1000, Mantri 500, Sipahi 200, Chor 0; wrong guess = Mantri 0. Double-tapping Confirm adds scores once. Round count increases by 1.
- Next Round: new roles, totals kept. New Match (confirm) resets totals; the old match remains in history.
- Refresh during any round: returns to menu, roles not exposed, no points for the unfinished round. Browser Back shows a notice and stays.
- Leaderboard: local matches survive browser restart; Clear History asks confirmation. Without config the setup message shows and Online badge reads Offline; with config, status turns Online and Upload works only once per match. Airplane mode: game still plays, upload shows an error.
- Sound: silent until first tap; mute toggle works.
