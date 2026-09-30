/*
 * ShortStop: content categories
 * =============================
 * "Shape what you see, rather than blocking the internet." People choose, per
 * category, whether videos are allowed, reduced (fewer of them in
 * recommendations) or hidden (with a "Show anyway" button). This file is the
 * platform-neutral half: the categories, the presets, and a small keyword
 * classifier that guesses a video's category from its title, channel name,
 * description and (where the site gives one) its own category label.
 *
 * It is a guess, and treated as one:
 *   - A category needs real evidence (a score of at least CONFIDENT) before it
 *     counts. Anything weaker is "Other", which is allowed unless the person
 *     chose otherwise.
 *   - When two categories are close, the gentler choice wins: a coding video
 *     that also mentions a game is not hidden because Gaming is.
 *   - A correction (this channel is Education) always beats the guess.
 *
 * Used by the popup (categories, presets, the saved choices) and by the content
 * scripts (classify, decide), so the two agree. Nothing leaves the device.
 */
(function (global) {
  'use strict';

  const MODES = ['allow', 'reduce', 'hide']; // Gentlest first.
  const CONFIDENT = 3; // One strong keyword, or two weaker ones.
  const CLOSE = 0.6; // A category within 60% of the best one also counts.
  const MAX_FIXES = 200; // Corrections kept per platform (oldest dropped first).

  const CATEGORIES = [
    { id: 'education', label: 'Education' },
    { id: 'science', label: 'Science & Technology' },
    { id: 'business', label: 'Business & Finance' },
    { id: 'news', label: 'News' },
    { id: 'productivity', label: 'Productivity' },
    { id: 'coding', label: 'Coding / Programming' },
    { id: 'health', label: 'Health & Fitness' },
    { id: 'music', label: 'Music' },
    { id: 'gaming', label: 'Gaming' },
    { id: 'entertainment', label: 'Entertainment' },
    { id: 'sports', label: 'Sports' },
    { id: 'lifestyle', label: 'Lifestyle' },
    { id: 'vlogs', label: 'Vlogs' },
    { id: 'podcasts', label: 'Podcasts' },
    { id: 'movies', label: 'Movies / TV' },
    { id: 'documentaries', label: 'Documentaries' },
    { id: 'comedy', label: 'Comedy' },
    { id: 'celebrity', label: 'Celebrity / Influencer' },
    { id: 'other', label: 'Other' }, // Anything the classifier can't place.
  ];
  const IDS = CATEGORIES.map((category) => category.id);
  const LABELS = Object.fromEntries(CATEGORIES.map((category) => [category.id, category.label]));

  // Presets set every category at once: the listed ones (and Other, so an
  // uncertain guess is never hidden) are allowed, the rest hidden.
  const PRESETS = [
    {
      id: 'focus',
      label: 'Focus',
      detail: 'Education, Science & Technology, Productivity, Coding and Business',
      allow: ['education', 'science', 'productivity', 'coding', 'business', 'other'],
    },
    {
      id: 'study',
      label: 'Study',
      detail: 'Education, Science & Technology (maths included) and Documentaries',
      allow: ['education', 'science', 'documentaries', 'other'],
    },
    { id: 'all', label: 'Allow all', detail: 'Every category shown', allow: IDS },
  ];

  /*
   * Keywords: [weight, words]. 3 is enough on its own, 2 and 1 need company.
   * Words match whole words (a trailing "s" is allowed), case and accents
   * ignored. `channel` words are only looked for in the channel's name.
   */
  const KEYWORDS = {
    education: [
      [3, 'tutorial|lecture|lesson|full course|crash course|online course|explained|exam|revision|gcse|a level|a-level|sat prep|ielts|toefl|calculus|algebra|geometry|trigonometry|mathematics|maths|math|grammar|vocabulary|learn english|khan academy|homework help|study guide'],
      [2, 'course|learn|learning|beginner|how does|why do|why does|teacher|professor|university|history of|introduction to|intro to|masterclass'],
      [1, 'guide|explain|basics|fundamentals|class|school'],
    ],
    science: [
      [3, 'physics|chemistry|biology|astronomy|astrophysics|quantum|black hole|neuroscience|nasa|spacex|rocket launch|scientist|scientific|robotics|engineering|artificial intelligence|machine learning|tech review|gpu|cpu|semiconductor'],
      [2, 'science|space|universe|galaxy|planet|evolution|dna|experiment|engineer|robot|ai|technology|tech|smartphone|iphone|android|laptop|gadget|electric vehicle|nvidia|chip'],
      [1, 'review|unboxing|test'],
    ],
    business: [
      [3, 'investing|investment|stock market|personal finance|entrepreneur|startup|cryptocurrency|bitcoin|economics|economy|inflation|recession|real estate|side hustle|passive income|dividend|index fund|etf|forex|venture capital'],
      [2, 'business|finance|financial|money|stock|crypto|marketing|sales|wealth|millionaire|trading|budget|tax|salary|income|company|ceo|brand strategy'],
    ],
    news: [
      [3, 'breaking news|news|headlines|election|prime minister|parliament|congress|senate|white house|press conference|live coverage|politics|political|geopolitics'],
      [2, 'president|government|minister|war|ukraine|gaza|israel|russia|protest|policy|supreme court|report|reporter|journalist'],
      [1, 'update|latest|today'],
    ],
    productivity: [
      [3, 'productivity|productive|study with me|pomodoro|time management|deep work|procrastination|second brain|note taking|notion|obsidian|self improvement|self-improvement|habit tracker'],
      [2, 'habit|focus|discipline|motivation|morning routine|planner|to-do|todo|goal setting|workflow|organize|organise|efficiency|journaling'],
    ],
    coding: [
      [3, 'programming|programmer|coding|javascript|typescript|python|java|c\\+\\+|c#|rust|golang|kotlin|react|vue|angular|node\\.?js|django|flask|sql|leetcode|data structures|algorithm|github|git|linux|docker|kubernetes|devops|web development|web dev|frontend|backend|full stack|fullstack|html|css|api|compiler|debugging|vscode|neovim'],
      [2, 'code|coder|developer|software|database|framework|aws|terminal|open source|app development|swift|swiftui'],
    ],
    health: [
      [3, 'workout|fitness|gym|yoga|pilates|cardio|hiit|stretching|nutrition|weight loss|lose weight|fat loss|bodybuilding|calisthenics|mental health|physiotherapy|meal prep'],
      [2, 'exercise|diet|healthy|health|muscle|protein|calorie|abs|meditation|sleep|therapy|anxiety|doctor|medical|running|stretch|wellness'],
    ],
    music: [
      [3, 'official music video|music video|official video|official audio|lyric video|lyrics|lyric|album|remix|acoustic|live performance|concert|lofi|lo-fi|hip hop|rap|jazz|symphony|orchestra|karaoke|instrumental|song|music'],
      [2, 'playlist|mix|beat|cover|piano|guitar|drum|single|feat|ft|band|singer|vocal'],
    ],
    gaming: [
      [3, 'gameplay|gaming|gamer|video game|playthrough|walkthrough|let\'s play|lets play|speedrun|minecraft|fortnite|roblox|gta|call of duty|valorant|league of legends|overwatch|apex legends|elden ring|zelda|pokemon|nintendo|playstation|ps5|xbox|esports|counter-strike|cs2|dota|genshin|among us|boss fight|patch notes|warzone|skyrim|mario'],
      [2, 'game|games|steam|cod|twitch|stream highlights|level|speed run|mod|mods'],
    ],
    entertainment: [
      [3, 'prank|try not to laugh|funny moments|reaction|reacts|reacting|tier list|challenge|last to leave|i survived|24 hours|mrbeast|game show|talent show|got talent|magic trick'],
      [2, 'compilation|entertainment|show|top 10|top ten|ranking|fails|experiment|vs'],
      [1, 'crazy|insane|epic|viral|fun'],
    ],
    sports: [
      [3, 'football|soccer|premier league|champions league|la liga|serie a|bundesliga|nfl|nba|mlb|nhl|ufc|mma|boxing|tennis|golf|cricket|rugby|formula 1|formula one|f1|grand prix|olympics|world cup|touchdown|super bowl|wwe|wrestling|tour de france|transfer news|match highlights'],
      [2, 'highlights|match|goal|league|championship|athlete|coach|marathon|cycling|messi|ronaldo|lebron|fifa|ea fc|team'],
    ],
    lifestyle: [
      [3, 'skincare|makeup|fashion|outfit|haul|room tour|home tour|apartment tour|house tour|decor|interior design|recipe|cooking|baking|clean with me|cleaning|gardening|minimalism|minimalist|beauty|hairstyle|travel guide|things to do in|wedding|parenting'],
      [2, 'food|travel|hotel|diy|home|style|routine|family|relationship|pet|dog|cat'],
    ],
    vlogs: [
      [3, 'vlog|day in my life|day in the life|week in my life|daily vlog|storytime|story time|grwm|get ready with me|come with me|life update|spend the day with me|weekend in my life'],
      [2, 'my life|my week|my day|moving to|i moved'],
    ],
    podcasts: [
      [3, 'podcast|full episode|the joe rogan experience|joe rogan|lex fridman|huberman lab|diary of a ceo|flagrant|impaulsive|in conversation with|conversation with'],
      [2, 'episode|ep|interview|talks|sits down with'],
    ],
    movies: [
      [3, 'movie|film|official trailer|trailer|teaser|full movie|tv show|tv series|season finale|netflix|hbo|disney\\+|marvel|star wars|anime|box office|movie review|film review|ending explained|behind the scenes|cinema|sitcom'],
      [2, 'scene|clip|series|season|episode|actor|actress|director|cartoon|animation|recap'],
    ],
    documentaries: [
      [3, 'documentary|full documentary|docuseries|the rise and fall|rise and fall of|untold story|true story|true crime|investigation|investigative|bbc earth|national geographic|nat geo|dw documentary|frontline|real stories'],
      [2, 'the story of|the history of|inside the|how it became|what happened to'],
    ],
    comedy: [
      [3, 'comedy|comedian|stand-up|stand up|standup|sketch|snl|saturday night live|parody|satire|roast|bloopers|skit'],
      [2, 'funny|jokes|joke|meme|memes|hilarious|laugh'],
    ],
    celebrity: [
      [3, 'celebrity|celebrities|kardashian|red carpet|met gala|gossip|influencer|youtuber|tiktoker|paparazzi|oscars|grammys|award show|apology video|exposed'],
      [2, 'drama|feud|beef|dating|breakup|famous|star|taylor swift|drake|beyonce|justin bieber|logan paul|jake paul|ksi|sidemen|streamer'],
    ],
  };

  // Channel names alone say a lot: "... - Topic" and VEVO channels are music,
  // "... News" is news, and so on.
  const CHANNEL_KEYWORDS = {
    music: [[3, 'vevo|records|recordings|music']],
    news: [[3, 'news|cnn|bbc news|sky news|fox news|al jazeera|reuters|nbc news|abc news|cbs news|msnbc|associated press']],
    gaming: [[3, 'gaming|games|plays|gameplay']],
    education: [[3, 'academy|university|institute|school|college|tutorials|education|khan academy|crashcourse|ted-ed']],
    podcasts: [[3, 'podcast|pod']],
    sports: [[3, 'fc|sports|espn|nba|nfl|ufc|formula 1|f1|sky sports|tnt sports']],
    comedy: [[3, 'comedy|comedians']],
    coding: [[3, 'fireship|freecodecamp|traversy media|the primeagen|web dev simplified|programming|code']],
    science: [[3, 'veritasium|kurzgesagt|vsauce|smarter every day|mkbhd|linus tech tips|science|tech']],
    documentaries: [[3, 'documentary|documentaries']],
    movies: [[3, 'movieclips|trailers|pictures|studios|films|netflix|hbo|disney']],
  };

  // YouTube's own category (from the watch page), turned into our scores.
  const GENRES = {
    'education': { education: 4 },
    'science & technology': { science: 4 },
    'gaming': { gaming: 4 },
    'music': { music: 4 },
    'news & politics': { news: 4 },
    'sports': { sports: 4 },
    'comedy': { comedy: 4 },
    'film & animation': { movies: 3 },
    'entertainment': { entertainment: 2 },
    'people & blogs': { vlogs: 1 },
    'howto & style': { lifestyle: 2, education: 1 },
    'travel & events': { lifestyle: 2, vlogs: 1 },
    'autos & vehicles': { lifestyle: 1 },
    'pets & animals': { lifestyle: 1, entertainment: 1 },
    'nonprofits & activism': { news: 1 },
  };

  // One regex per weight per category. Word edges are "not a letter or digit",
  // so "c++", "c#" and "let's play" work, and "ai" does not match "said".
  const EDGE_BEFORE = '(?<![\\p{L}\\p{N}])';
  const EDGE_AFTER = '(?![\\p{L}\\p{N}])';
  function compile(table) {
    const compiled = {};
    for (const [category, rows] of Object.entries(table)) {
      compiled[category] = rows.map(([weight, words]) => ({
        weight,
        pattern: new RegExp(`${EDGE_BEFORE}(?:${words})s?${EDGE_AFTER}`, 'gu'),
      }));
    }
    return compiled;
  }
  const TITLE_RULES = compile(KEYWORDS);
  const CHANNEL_RULES = compile(CHANNEL_KEYWORDS);

  // Lower case, accents off ("Pokémon" -> "pokemon"), curly quotes straightened.
  function normalize(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[‘’]/g, "'")
      .toLowerCase();
  }

  // Adds `factor` x weight for each different keyword found in `text`.
  function addScores(scores, rules, text, factor) {
    if (!text) return;
    for (const [category, rows] of Object.entries(rules)) {
      for (const { weight, pattern } of rows) {
        pattern.lastIndex = 0;
        const found = new Set(text.match(pattern) || []);
        if (found.size) scores[category] = (scores[category] || 0) + found.size * weight * factor;
      }
    }
  }

  /*
   * Guesses a video's category from what the page shows about it:
   *   { title, channel, text (description or snippet), genre (the site's own category) }
   * Returns { category, confident, scores, close } where `close` lists every
   * category near enough to the best one to count (used by decide()).
   */
  function classify(video) {
    const scores = {};
    const title = normalize(video && video.title);
    const channel = normalize(video && video.channel);
    addScores(scores, TITLE_RULES, title, 1);
    addScores(scores, TITLE_RULES, channel, 1);
    addScores(scores, CHANNEL_RULES, channel, 1);
    addScores(scores, TITLE_RULES, normalize(video && video.text).slice(0, 600), 0.5);
    // "Artist - Topic" channels are YouTube's auto-generated music channels, and
    // "ArtistVEVO" ones are record labels'.
    if (/ - topic$|vevo$/.test(channel)) scores.music = (scores.music || 0) + 4;
    const genre = GENRES[normalize(video && video.genre).trim()];
    if (genre) for (const [category, points] of Object.entries(genre)) scores[category] = (scores[category] || 0) + points;

    let best = 'other';
    let top = 0;
    for (const [category, score] of Object.entries(scores)) {
      if (score > top) {
        best = category;
        top = score;
      }
    }
    if (top < CONFIDENT) return { category: 'other', confident: false, scores, close: ['other'] };
    const close = Object.keys(scores).filter((category) => scores[category] >= Math.max(CONFIDENT, top * CLOSE));
    return { category: best, confident: true, scores, close };
  }

  // The saved choices, cleaned up: { category: 'reduce' | 'hide' } (allowed
  // categories are left out, to keep the synced settings small).
  function normalizePrefs(prefs) {
    const clean = {};
    if (!prefs || typeof prefs !== 'object') return clean;
    for (const id of IDS) {
      if (prefs[id] === 'reduce' || prefs[id] === 'hide') clean[id] = prefs[id];
    }
    return clean;
  }

  const modeOf = (prefs, category) => (prefs && (prefs[category] === 'reduce' || prefs[category] === 'hide') ? prefs[category] : 'allow');

  /*
   * What to do with a classified video: 'allow', 'reduce' or 'hide'. When
   * several categories are close, the gentlest choice among them wins.
   */
  function decide(result, prefs) {
    let mode = 'allow';
    let rank = -1;
    for (const category of result.close) {
      const candidate = modeOf(prefs, category);
      const candidateRank = MODES.indexOf(candidate);
      if (rank === -1 || candidateRank < rank) {
        mode = candidate;
        rank = candidateRank;
      }
    }
    return mode;
  }

  // A correction wins over the guess: the category is certain.
  function fixed(category) {
    return { category, confident: true, scores: { [category]: Infinity }, close: [category] };
  }

  // The choices a preset makes.
  function presetPrefs(id) {
    const preset = PRESETS.find((entry) => entry.id === id);
    if (!preset) return null;
    const prefs = {};
    for (const category of IDS) if (!preset.allow.includes(category)) prefs[category] = 'hide';
    return prefs;
  }

  // The preset the saved choices match exactly, or null ("Custom").
  function matchingPreset(prefs) {
    const key = JSON.stringify(normalizePrefs(prefs));
    const preset = PRESETS.find((entry) => JSON.stringify(normalizePrefs(presetPrefs(entry.id))) === key);
    return preset ? preset.id : null;
  }

  // Corrections for one platform, cleaned up: { key: { category, label } },
  // oldest first, at most MAX_FIXES. `key` is "name:<channel name>" or
  // "video:<id>"; `label` is how the popup shows it.
  function normalizeFixes(fixes) {
    const clean = {};
    if (!fixes || typeof fixes !== 'object') return clean;
    const entries = [];
    for (const [key, value] of Object.entries(fixes)) {
      const category = value && typeof value === 'object' ? value.category : value;
      if (!/^(name|video):./.test(key) || key.length > 120 || !IDS.includes(category)) continue;
      const label = value && typeof value.label === 'string' ? value.label.slice(0, 80) : '';
      entries.push([key, { category, label }]);
    }
    for (const [key, value] of entries.slice(-MAX_FIXES)) clean[key] = value;
    return clean;
  }

  // A small, stable number for a video id, so "reduce" keeps the same third of
  // a category's videos every time instead of flickering between them.
  function bucket(id, buckets) {
    let hash = 0;
    for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return hash % buckets;
  }

  global.ShortStopCategories = {
    MODES,
    CONFIDENT,
    MAX_FIXES,
    CATEGORIES,
    LABELS,
    PRESETS,
    classify,
    decide,
    fixed,
    modeOf,
    normalizePrefs,
    normalizeFixes,
    presetPrefs,
    matchingPreset,
    bucket,
  };
})(globalThis);
