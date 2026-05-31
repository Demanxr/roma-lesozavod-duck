(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const startButton = document.getElementById("start-button");
  const heartsEl = document.getElementById("hearts");
  const floorLabel = document.getElementById("floor-label");
  const roomLabel = document.getElementById("room-label");
  const coinLabel = document.getElementById("coin-label");
  const itemsList = document.getElementById("items-list");
  const synergyToast = document.getElementById("synergy-toast");
  const bossWrap = document.getElementById("boss-wrap");
  const bossName = document.getElementById("boss-name");
  const bossBar = document.getElementById("boss-bar");

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const hash01 = (seed) => {
    const n = Math.sin(seed * 12.9898) * 43758.5453;
    return n - Math.floor(n);
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const now = () => performance.now() / 1000;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const sound = {
    ctx: null,
    master: null,
    last: Object.create(null),
  };

  const state = {
    w: 960,
    h: 540,
    dpr: 1,
    running: false,
    started: false,
    gameOver: false,
    won: false,
    time: 0,
    last: 0,
    floor: 1,
    room: 1,
    roomsBeforeBoss: 4,
    maxFloors: 3,
    roomIsBoss: false,
    roomIsShop: false,
    cleared: false,
    doorOpen: false,
    doorPulse: 0,
    shake: 0,
    coins: 0,
    player: null,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    pickups: [],
    puddles: [],
    obstacles: [],
    messages: [],
    activeSynergies: new Set(),
    combatRoomsCleared: 0,
    kioskVisits: 0,
    shop: {
      closed: false,
      items: [],
      noticeCooldown: 0,
      buyCooldown: 0,
    },
    bossIntro: null,
    input: {
      keys: new Set(),
      move: { x: 0, y: 0 },
      shoot: { x: 0, y: 0 },
      mouse: { x: 0, y: 0, down: false, seen: false },
    },
  };

  const quips = {
    hType: ["ЩА ДОГОНЮ!", "КТО ТУТ КРЯКНУЛ?", "АЙ, ГЛАЗА!", "НЕ СМОТРИ!"],
    drunk: ["У МЕНЯ ПЛАН!", "ГДЕ МОЙ ПАКЕТ?", "РОМА, СТОЙ, ПОГОВОРИМ!", "Я НОРМАЛЬНЫЙ!"],
    shade: ["НЮХ-НЮХ...", "Я ПРОСТО ТЕНЬ!", "НЕ ПАЛИ МЕНЯ!", "ТУТ ТЕМНО, ИДЕАЛЬНО."],
    keg: ["БУМ БУДЕТ.", "Я НЕ ПЬЯН, Я ОБЪЕМНЫЙ.", "ДЕРЖИ ДИСТАНЦИЮ!", "ПОЛ ЗАШАТАЛСЯ."],
    bossStuffy: ["Рома, ну это несерьезно.", "Мне просто душно за всех.", "Я не атакую, я объясняю.", "Давайте конструктивно.", "Можно без вот этого?"],
    bossDestroy: ["УСТРОЙ! ДЕСТРОЙ!", "ВОЛОСЫ ДЕРЖАТ УРОН!", "ЩАС В ТАЧКУ!", "ДВА МЕЧА, НОЛЬ ПЛАНА!"],
    bossShade: ["МЕНЯ НЕ ВИДНО.", "ТЕНЬ ТОЖЕ ЧЕЛОВЕК.", "НЮХЛЯ ВЫШЕЛ.", "СВЕТ ВЫКЛЮЧИ."],
  };

  const basePlayer = () => ({
    x: state.w * 0.5,
    y: state.h * 0.55,
    r: 17,
    hp: 8,
    maxHp: 8,
    speed: 220,
    damage: 1,
    fireDelay: 0.32,
    shotSpeed: 470,
    bulletLife: 1.18,
    bulletSize: 5.8,
    fireTimer: 0,
    invuln: 1.4,
    prideCharge: 55,
    dashTime: 0,
    dashDir: { x: 1, y: 0 },
    dashCooldown: 0,
    step: 0,
    shotPulse: 0,
    blinkTimer: rand(1.2, 3.4),
    blinking: 0,
    stepDust: 0,
    aim: { x: 1, y: 0 },
    items: [],
    itemIds: new Set(),
    traits: {
      burn: false,
      poison: false,
      chill: false,
      split: false,
      electric: false,
      trail: false,
      homing: 0,
      bounce: 0,
      pierce: 0,
      shots: 1,
      spread: 0,
      crit: 0,
      magnet: 0,
      coinMultiplier: 1,
      coinRain: 0,
      firework: 0,
      stinkAura: 0,
      healOnKill: 0,
      rainbowTrail: false,
      companion: false,
      companionTimer: 0,
      shieldCoins: false,
    },
  });

  const itemCatalog = [
    {
      id: "rubberBeak",
      name: "Использованный гондон",
      icon: "◇",
      desc: "Рома стреляет крупнее и получает запас здоровья. Мерзко, зато живуче.",
      apply: (p) => {
        p.bulletSize += 2.2;
        p.maxHp += 1;
        p.hp = Math.min(p.maxHp, p.hp + 1);
      },
    },
    {
      id: "bottleCap",
      name: "Пробка из канавы",
      icon: "◎",
      desc: "Снаряды отскакивают от стен: Лесозавод учит экономить мусор.",
      apply: (p) => {
        p.traits.bounce += 1;
        p.shotSpeed += 38;
      },
    },
    {
      id: "pondMud",
      name: "Лужа за ДК",
      icon: "≈",
      desc: "Попадания травят врагов и иногда оставляют подозрительные лужи.",
      apply: (p) => {
        p.traits.poison = true;
        p.damage += 0.15;
      },
    },
    {
      id: "featherFan",
      name: "Вентилятор с проходной",
      icon: "✦",
      desc: "Рома стреляет быстрее и бегает так, будто смена уже началась.",
      apply: (p) => {
        p.fireDelay *= 0.82;
        p.speed += 22;
      },
    },
    {
      id: "hotSauce",
      name: "Шаурмичный соус",
      icon: "▲",
      desc: "Поджигает цель и оставляет привкус ночного ларька.",
      apply: (p) => {
        p.traits.burn = true;
        p.damage += 0.28;
      },
    },
    {
      id: "soapBubble",
      name: "Пакетик из аптеки",
      icon: "○",
      desc: "Выстрелы проходят сквозь одного врага и делают вид, что так и надо.",
      apply: (p) => {
        p.traits.pierce += 1;
        p.bulletLife += 0.16;
      },
    },
    {
      id: "mirrorTears",
      name: "Осколок маршрутки",
      icon: "◇",
      desc: "При попадании снаряд делится на мелкие обидные осколки.",
      apply: (p) => {
        p.traits.split = true;
        p.fireDelay *= 1.06;
      },
    },
    {
      id: "sparkPlug",
      name: "Искра с лесопилки",
      icon: "ϟ",
      desc: "Попадания бьют током ближайших врагов: техника безопасности отдыхает.",
      apply: (p) => {
        p.traits.electric = true;
        p.shotSpeed += 28;
      },
    },
    {
      id: "crackedEgg",
      name: "Подкинутое яйцо",
      icon: "●",
      desc: "Появляется маленький утенок-помощник, который ничего не объясняет.",
      apply: (p) => {
        p.traits.companion = true;
      },
    },
    {
      id: "coffeeBean",
      name: "Энергос из киоска",
      icon: "◆",
      desc: "Скорость и темп стрельбы выше. Сердце просит не надо.",
      apply: (p) => {
        p.fireDelay *= 0.88;
        p.speed += 18;
      },
    },
    {
      id: "freezer",
      name: "Снег с остановки",
      icon: "❄",
      desc: "Снаряды замедляют врагов холодом поселковой остановки.",
      apply: (p) => {
        p.traits.chill = true;
        p.damage += 0.1;
      },
    },
    {
      id: "luckySock",
      name: "Носок из общаги",
      icon: "◇",
      desc: "Шанс критического попадания. Почему он счастливый, лучше не знать.",
      apply: (p) => {
        p.traits.crit += 0.14;
      },
    },
    {
      id: "magnetWorm",
      name: "Магнит из счетчика",
      icon: "U",
      desc: "Монеты и предметы тянутся к Роме, будто знают дорогу к ларьку.",
      apply: (p) => {
        p.traits.magnet += 150;
      },
    },
    {
      id: "goldenCoin",
      name: "Заначка под линолеумом",
      icon: "$",
      desc: "Выпадающие лесо-монеты ценнее.",
      apply: (p) => {
        p.traits.coinMultiplier += 1;
      },
    },
    {
      id: "tripleQuack",
      name: "Три сплетни у подъезда",
      icon: "Ψ",
      desc: "Рома стреляет веером, потому что слухи летят в разные стороны.",
      apply: (p) => {
        p.traits.shots += 2;
        p.traits.spread += 0.18;
        p.fireDelay *= 1.18;
      },
    },
    {
      id: "oldBread",
      name: "Черствый батон",
      icon: "▣",
      desc: "Снаряды слегка доворачивают к врагам, как батон к голубям.",
      apply: (p) => {
        p.traits.homing += 0.9;
        p.damage += 0.1;
      },
    },
    {
      id: "corkArmor",
      name: "Фуфайка деда",
      icon: "▰",
      desc: "Больше здоровья и меньше отдачи от ударов.",
      apply: (p) => {
        p.maxHp += 2;
        p.hp = Math.min(p.maxHp, p.hp + 2);
      },
    },
    {
      id: "coinShield",
      name: "Пакет с мелочью",
      icon: "◉",
      desc: "Лесо-монеты иногда гасят урон.",
      apply: (p) => {
        p.traits.shieldCoins = true;
      },
    },
    {
      id: "cheapFirecrackers",
      name: "Петарды из ларька",
      icon: "✹",
      desc: "Попадания иногда взрываются комиксовым БАХ и раскидывают мелкие осколки.",
      apply: (p) => {
        p.traits.firework += 1;
        p.damage += 0.12;
      },
    },
    {
      id: "stinkCologne",
      name: "Одеколон «Душнила»",
      icon: "☁",
      desc: "Вокруг Ромы появляется вонючая аура. Враги рядом теряют здоровье и уважение.",
      apply: (p) => {
        p.traits.stinkAura += 1;
        p.maxHp += 1;
        p.hp = Math.min(p.maxHp, p.hp + 1);
      },
    },
    {
      id: "glitterJar",
      name: "Банка пошлых блесток",
      icon: "✦",
      desc: "Снаряды оставляют радужный след, а критические попадания становятся чаще.",
      apply: (p) => {
        p.traits.rainbowTrail = true;
        p.traits.crit += 0.1;
      },
    },
    {
      id: "benchSeeds",
      name: "Семки с лавочки",
      icon: "••",
      desc: "Рома плюется чаще. Не культурно, зато эффективно.",
      apply: (p) => {
        p.fireDelay *= 0.78;
        p.shotSpeed += 24;
      },
    },
    {
      id: "dendyCartridge",
      name: "Картридж Денди без наклейки",
      icon: "▦",
      desc: "Снаряды отскакивают и дробятся, будто графон из детства проснулся.",
      apply: (p) => {
        p.traits.bounce += 1;
        p.traits.split = true;
        p.bulletLife += 0.12;
      },
    },
    {
      id: "busTicket",
      name: "Билет до конечной",
      icon: "⇥",
      desc: "Скорость выше, рывок заряжается быстрее от подбора монет и сердец.",
      apply: (p) => {
        p.speed += 34;
        p.prideCharge = Math.min(100, p.prideCharge + 28);
      },
    },
    {
      id: "cashUnderSock",
      name: "Заначка в мокром носке",
      icon: "₽",
      desc: "С врагов иногда падает лишняя монетка. Экономика поселка плачет.",
      apply: (p) => {
        p.traits.coinRain += 1;
        p.traits.magnet += 55;
      },
    },
    {
      id: "bathrobeCape",
      name: "Халат супергероя",
      icon: "▲",
      desc: "Рома жирнее, быстрее и выглядит так, будто сейчас спасет подъезд.",
      apply: (p) => {
        p.maxHp += 2;
        p.hp = Math.min(p.maxHp, p.hp + 2);
        p.speed += 16;
      },
    },
    {
      id: "vampireKefir",
      name: "Кефир из темного угла",
      icon: "♣",
      desc: "Иногда убийство лечит Рому. Лучше не спрашивать, почему кефир красный.",
      apply: (p) => {
        p.traits.healOnKill += 0.18;
        p.damage += 0.08;
      },
    },
    {
      id: "posterMarker",
      name: "Маркер для подъездных плакатов",
      icon: "!!",
      desc: "Снаряды сильнее, а комиксовые вспышки становятся наглее.",
      apply: (p) => {
        p.damage += 0.24;
        p.traits.firework += 0.45;
      },
    },
  ];

  const itemById = new Map(itemCatalog.map((item) => [item.id, item]));

  const synergies = [
    {
      id: "wiredSoda",
      needs: ["bottleCap", "sparkPlug"],
      name: "Коротнуло у проходной",
      desc: "Отскоки усиливают цепную молнию.",
    },
    {
      id: "frozenSwamp",
      needs: ["pondMud", "freezer"],
      name: "Лесозаводский каток",
      desc: "Подозрительные лужи еще и морозят врагов.",
    },
    {
      id: "echoQuack",
      needs: ["rubberBeak", "mirrorTears"],
      name: "Гондон с осколками",
      desc: "Крупные снаряды выпускают маленькое эхо.",
    },
    {
      id: "spicyFoam",
      needs: ["soapBubble", "hotSauce"],
      name: "Аптечная шаурма",
      desc: "Пробивающие снаряды оставляют горячий след.",
    },
    {
      id: "ducklingStorm",
      needs: ["crackedEgg", "featherFan"],
      name: "Смена с утенком",
      desc: "Утенок стреляет почти вдвое чаще.",
    },
    {
      id: "luckyCoffee",
      needs: ["coffeeBean", "luckySock"],
      name: "Энергосный фарт",
      desc: "Криты чаще срабатывают при быстрой стрельбе.",
    },
    {
      id: "magnetBank",
      needs: ["magnetWorm", "goldenCoin"],
      name: "Линолеумный банк",
      desc: "Монеты летят быстрее и лечат после каждой пятой.",
    },
    {
      id: "sparkFireworks",
      needs: ["sparkPlug", "cheapFirecrackers"],
      name: "Салют у проходной",
      desc: "Петарды чаще бьют током по соседям.",
    },
    {
      id: "rainbowStink",
      needs: ["glitterJar", "stinkCologne"],
      name: "Гламурная духота",
      desc: "Вонючая аура становится ярче и злее.",
    },
    {
      id: "retroRicochet",
      needs: ["dendyCartridge", "bottleCap"],
      name: "Восьмибитный отскок",
      desc: "Отскоки живут дольше и выглядят как старый мультик.",
    },
    {
      id: "kefirSock",
      needs: ["vampireKefir", "luckySock"],
      name: "Кефирный фарт",
      desc: "Убийства чаще подлечивают Рому, хотя запах спорный.",
    },
    {
      id: "cashCape",
      needs: ["cashUnderSock", "bathrobeCape"],
      name: "Батя-капитал",
      desc: "Лишние монеты падают чаще, а Рома выглядит богаче на полтора подъезда.",
    },
  ];

  function hasItem(id) {
    return state.player.itemIds.has(id);
  }

  function hasSynergy(id) {
    return state.activeSynergies.has(id);
  }

  function ensureAudio() {
    if (!AudioCtor) return null;
    if (!sound.ctx) {
      sound.ctx = new AudioCtor();
      sound.master = sound.ctx.createGain();
      sound.master.gain.value = 0.18;
      sound.master.connect(sound.ctx.destination);
    }
    if (sound.ctx.state === "suspended") sound.ctx.resume();
    return sound.ctx;
  }

  function tone(freq, duration, gain = 0.22, type = "sine", delay = 0, bend = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq + bend), t + duration);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp);
    amp.connect(sound.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noise(duration, gain = 0.12, delay = 0, filterFreq = 620) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(sound.master);
    src.start(t);
  }

  function playSound(name) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = performance.now();
    const gap = {
      shoot: 70,
      quack: 90,
      aura: 900,
      knock: 380,
      denied: 650,
    }[name] || 0;
    if (gap && t - (sound.last[name] || 0) < gap) return;
    sound.last[name] = t;

    if (name === "start") {
      tone(220, 0.08, 0.12, "square", 0, 90);
      tone(330, 0.12, 0.1, "triangle", 0.07, 160);
    } else if (name === "shoot") {
      tone(360 + rand(-24, 34), 0.055, 0.075, "square", 0, -150);
      tone(155, 0.05, 0.035, "sawtooth", 0.015, -55);
    } else if (name === "coin") {
      tone(920, 0.055, 0.11, "sine", 0, 180);
      tone(1320, 0.075, 0.08, "triangle", 0.055, 220);
    } else if (name === "heart") {
      tone(280, 0.1, 0.09, "sine", 0, -35);
      tone(420, 0.13, 0.08, "sine", 0.08, -40);
    } else if (name === "item") {
      tone(520, 0.08, 0.1, "triangle", 0, 240);
      tone(760, 0.1, 0.08, "sine", 0.07, 310);
      noise(0.16, 0.035, 0.02, 1800);
    } else if (name === "synergy") {
      tone(390, 0.09, 0.1, "triangle", 0, 180);
      tone(620, 0.1, 0.085, "triangle", 0.08, 280);
      tone(980, 0.16, 0.075, "sine", 0.16, 420);
    } else if (name === "dash") {
      noise(0.2, 0.12, 0, 1600);
      tone(180, 0.16, 0.12, "sawtooth", 0, 520);
      tone(740, 0.12, 0.07, "triangle", 0.04, -220);
    } else if (name === "hit") {
      noise(0.12, 0.11, 0, 460);
      tone(150, 0.11, 0.08, "sawtooth", 0, -55);
    } else if (name === "shield") {
      tone(210, 0.08, 0.08, "square", 0, 85);
      tone(140, 0.1, 0.06, "square", 0.055, -40);
    } else if (name === "pop") {
      tone(170, 0.075, 0.1, "triangle", 0, -70);
      noise(0.08, 0.07, 0.01, 850);
    } else if (name === "boss") {
      tone(92, 0.22, 0.13, "sawtooth", 0, -24);
      tone(70, 0.28, 0.1, "square", 0.12, -18);
      noise(0.25, 0.06, 0, 420);
    } else if (name === "phase") {
      tone(180, 0.11, 0.13, "sawtooth", 0, 340);
      noise(0.22, 0.11, 0.04, 900);
      tone(520, 0.18, 0.08, "square", 0.12, -210);
    } else if (name === "knock") {
      noise(0.07, 0.13, 0, 260);
      tone(115, 0.065, 0.11, "square", 0.005, -35);
    } else if (name === "aura") {
      tone(118, 0.18, 0.055, "sawtooth", 0, -12);
      noise(0.2, 0.03, 0, 300);
    } else if (name === "door") {
      tone(240, 0.09, 0.08, "triangle", 0, 160);
      tone(360, 0.11, 0.06, "triangle", 0.075, -80);
    } else if (name === "buy") {
      tone(640, 0.06, 0.1, "triangle", 0, 180);
      tone(980, 0.08, 0.08, "sine", 0.06, 160);
    } else if (name === "denied") {
      tone(160, 0.09, 0.08, "square", 0, -60);
      tone(120, 0.11, 0.06, "square", 0.08, -35);
    } else if (name === "win") {
      [330, 420, 520, 660, 880].forEach((freq, i) => tone(freq, 0.12, 0.08, "triangle", i * 0.075, 90));
    } else if (name === "lose") {
      tone(220, 0.18, 0.1, "sawtooth", 0, -65);
      tone(150, 0.24, 0.09, "square", 0.14, -60);
      noise(0.28, 0.07, 0.08, 360);
    }
  }

  function resize() {
    state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    state.w = Math.max(320, window.innerWidth);
    state.h = Math.max(360, window.innerHeight);
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function resetGame() {
    playSound("start");
    state.running = true;
    state.started = true;
    state.gameOver = false;
    state.won = false;
    state.time = 0;
    state.last = now();
    state.floor = 1;
    state.room = 1;
    state.roomsBeforeBoss = 3;
    state.roomIsBoss = false;
    state.roomIsShop = false;
    state.cleared = false;
    state.doorOpen = false;
    state.coins = 0;
    state.player = basePlayer();
    state.enemies = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.particles = [];
    state.pickups = [];
    state.puddles = [];
    state.obstacles = [];
    state.messages = [];
    state.activeSynergies = new Set();
    state.combatRoomsCleared = 0;
    state.kioskVisits = 0;
    state.shop = { closed: false, items: [], noticeCooldown: 0, buyCooldown: 0 };
    state.bossIntro = null;
    overlay.classList.add("hidden");
    spawnRoom(false);
    addMessage("Рома вышел в Лесозавод. Духота уже близко.");
    updateHud();
  }

  function spawnRoom(isBoss) {
    state.roomIsBoss = isBoss;
    state.roomIsShop = false;
    state.cleared = false;
    state.doorOpen = false;
    state.doorPulse = 0;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.enemyBullets.length = 0;
    state.puddles.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.bossIntro = null;
    state.obstacles = makeObstacles(isBoss);
    state.player.x = state.w * 0.5;
    state.player.y = state.h * 0.58;
    state.player.invuln = Math.max(state.player.invuln, 1.35);

    if (isBoss && state.floor === 1) {
      startAmirIntro();
    } else if (isBoss) {
      spawnBoss();
    } else {
      const arenaScale = clamp((state.w * state.h) / (960 * 540), 0.52, 1);
      const count = Math.max(3, Math.round((4 + state.floor * 1.8 + state.room * 1.05) * arenaScale));
      for (let i = 0; i < count; i++) {
        const typePool = ["hType", "drunk"];
        if (state.floor >= 2) typePool.push("shade");
        if (state.floor >= 3) typePool.push("keg");
        spawnEnemy(pick(typePool));
      }
    }
    updateHud();
  }

  function spawnShopRoom() {
    state.roomIsBoss = false;
    state.roomIsShop = true;
    state.cleared = true;
    state.doorOpen = true;
    state.doorPulse = 0;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.enemyBullets.length = 0;
    state.puddles.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.obstacles = [];
    state.player.x = Math.max(76, state.w * 0.22);
    state.player.y = state.h * 0.58;
    state.player.invuln = Math.max(state.player.invuln, 1.1);

    const visit = state.kioskVisits;
    const randomBreak = Math.random() < (visit > 0 && visit % 3 === 2 ? 0.58 : 0.24);
    state.shop = {
      closed: visit === 0 || randomBreak,
      items: [],
      noticeCooldown: 0,
      buyCooldown: 0,
    };
    if (!state.shop.closed) state.shop.items = makeShopItems();
    state.kioskVisits += 1;
    addMessage("Киоск Романьковой показался между домами.");
    updateHud();
  }

  function startAmirIntro() {
    state.cleared = false;
    state.doorOpen = false;
    state.obstacles = [];
    state.bossIntro = {
      type: "amir",
      time: 0,
      stage: 0,
      done: false,
    };
    state.player.x = state.w * 0.5;
    state.player.y = state.h * 0.68;
    state.player.invuln = Math.max(state.player.invuln, 7.0);
    addMessage("Комната пустая. Прохладно. Даже дышать приятно.", "#64c7ff");
  }

  function makeShopItems() {
    const available = itemCatalog.filter((item) => !state.player.itemIds.has(item.id));
    const chosen = [];
    for (const item of available.sort(() => Math.random() - 0.5).slice(0, 3)) {
      const index = chosen.length;
      chosen.push({
        item,
        price: 5 + state.floor * 2 + index * 2 + Math.floor(rand(0, 3)),
        x: state.w * (0.46 + index * 0.14),
        y: state.h * 0.56,
        r: 20,
        bought: false,
      });
    }
    return chosen;
  }

  function makeObstacles(isBoss) {
    const list = [];
    const count = isBoss ? 2 : 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const w = rand(38, 76);
      const h = rand(28, 64);
      list.push({
        x: rand(82, state.w - 82 - w),
        y: rand(98, state.h - 92 - h),
        w,
        h,
      });
    }
    return list;
  }

  function spawnEnemy(type, x = null, y = null) {
    const edge = Math.floor(rand(0, 4));
    const pos = {
      x: x ?? (edge < 2 ? rand(60, state.w - 60) : edge === 2 ? 58 : state.w - 58),
      y: y ?? (edge >= 2 ? rand(88, state.h - 62) : edge === 0 ? 88 : state.h - 60),
    };
    const templates = {
      hType: {
        name: "Писюк-икс",
        hp: 2.8 + state.floor * 0.7,
        r: 17,
        speed: 92 + state.floor * 7,
        color: "#d7504f",
        damage: 1,
        attack: "dash",
      },
      drunk: {
        name: "Сисишар с бутылкой",
        hp: 3.8 + state.floor * 0.9,
        r: 19,
        speed: 72 + state.floor * 5,
        color: "#8c74d8",
        damage: 1,
        attack: "bottle",
      },
      shade: {
        name: "Нюхля-тень",
        hp: 2.6 + state.floor * 0.8,
        r: 15,
        speed: 118 + state.floor * 7,
        color: "#58c58b",
        damage: 1,
        attack: "needle",
      },
      keg: {
        name: "Пузан-брага",
        hp: 4.6 + state.floor * 1.1,
        r: 20,
        speed: 64,
        color: "#bd8d4a",
        damage: 1,
        attack: "explode",
      },
    };
    const data = templates[type];
    const speedScale = clamp(Math.min(state.w / 720, state.h / 500), 0.66, 1.08);
    const enemy = {
      ...data,
      type,
      x: pos.x,
      y: pos.y,
      maxHp: data.hp,
      speed: data.speed * speedScale,
      vx: 0,
      vy: 0,
      wobble: rand(0, TAU),
      cooldown: rand(0.3, 1.6),
      dash: 0,
      burn: 0,
      poison: 0,
      chill: 0,
      flash: 0,
      boss: false,
      spawnTimer: 0,
      spawnGrace: 1.1,
      quip: null,
      quipTimer: rand(1.4, 4.8),
    };
    state.enemies.push(enemy);
    return enemy;
  }

  function spawnBoss() {
    const bosses = [
      {
        name: "Амир Душный",
        type: "bossStuffy",
        hp: 34,
        r: 15,
        color: "#c4b49a",
        attack: "bossStuffy",
        auraRange: 178,
      },
      {
        name: "Устрой Дестрой",
        type: "bossDestroy",
        hp: 68,
        r: 39,
        color: "#e07058",
        attack: "bossDestroy",
      },
      {
        name: "Синтетический Колдун",
        type: "bossShade",
        hp: 76,
        r: 47,
        color: "#4fd08f",
        attack: "bossSpiral",
      },
    ];
    const data = bosses[state.floor - 1] ?? bosses[bosses.length - 1];
    const speedScale = clamp(Math.min(state.w / 720, state.h / 500), 0.66, 1.08);
    state.enemies.push({
      ...data,
      x: state.w * 0.5,
      y: state.h * 0.34,
      maxHp: data.hp,
      vx: 0,
      vy: 0,
      speed: (72 + state.floor * 8) * speedScale,
      damage: data.attack === "bossStuffy" ? 0 : 1,
      wobble: 0,
      cooldown: 1,
      dash: 0,
      burn: 0,
      poison: 0,
      chill: 0,
      flash: 0,
      boss: true,
      spawnTimer: 2.4,
      phase: 1,
      angle: 0,
      spawnGrace: 1.25,
      quip: null,
      quipTimer: 1.4,
    });
    playSound("boss");
    addMessage(`${data.name} вылез на шум.`);
  }

  function addMessage(text, color = "#f7c75d") {
    const life = clamp(3.2 + text.length / 80, 3.2, 6.4);
    state.messages.push({ text, color, life, max: life });
    if (state.messages.length > 5) state.messages.splice(0, state.messages.length - 5);
  }

  function getRandomItem() {
    const available = itemCatalog.filter((item) => !state.player.itemIds.has(item.id));
    return available.length ? pick(available) : null;
  }

  function giveItem(item) {
    if (!item || state.player.itemIds.has(item.id)) return;
    playSound("item");
    const p = state.player;
    p.itemIds.add(item.id);
    p.items.push(item);
    item.apply(p);
    p.fireDelay = Math.max(0.09, p.fireDelay);
    addMessage(`${item.name}: ${item.desc}`, "#7be0ad");
    checkSynergies();
    updateHud();
  }

  function checkSynergies() {
    for (const synergy of synergies) {
      if (state.activeSynergies.has(synergy.id)) continue;
      if (synergy.needs.every((id) => state.player.itemIds.has(id))) {
        state.activeSynergies.add(synergy.id);
        playSound("synergy");
        addMessage(`Синергия: ${synergy.name}. ${synergy.desc}`, "#64c7ff");
        synergyToast.textContent = `${synergy.name}: ${synergy.desc}`;
        if (synergy.id === "luckyCoffee") state.player.traits.crit += 0.12;
        if (synergy.id === "magnetBank") state.player.traits.magnet += 140;
        if (synergy.id === "sparkFireworks") state.player.traits.firework += 0.75;
        if (synergy.id === "rainbowStink") state.player.traits.stinkAura += 1;
        if (synergy.id === "retroRicochet") state.player.bulletLife += 0.24;
        if (synergy.id === "kefirSock") state.player.traits.healOnKill += 0.14;
        if (synergy.id === "cashCape") state.player.traits.coinRain += 1;
      }
    }
  }

  function updateHud() {
    if (!state.player) return;
    heartsEl.innerHTML = "";
    const hearts = Math.ceil(state.player.maxHp / 2);
    const filled = Math.ceil(state.player.hp / 2);
    for (let i = 0; i < hearts; i++) {
      const heart = document.createElement("span");
      heart.className = `heart${i >= filled ? " empty" : ""}`;
      heartsEl.appendChild(heart);
    }
    floorLabel.textContent = state.floor;
    roomLabel.textContent = state.roomIsShop ? "Киоск" : state.roomIsBoss ? "Босс" : `${state.room}/${state.roomsBeforeBoss}`;
    coinLabel.textContent = state.coins;
    itemsList.innerHTML = "";
    for (const item of state.player.items) {
      const chip = document.createElement("div");
      chip.className = "item-chip";
      chip.textContent = item.icon;
      chip.title = `${item.name}: ${item.desc}`;
      itemsList.appendChild(chip);
    }
  }

  function moveInput() {
    let x = 0;
    let y = 0;
    const keys = state.input.keys;
    if (keys.has("KeyA")) x -= 1;
    if (keys.has("KeyD")) x += 1;
    if (keys.has("KeyW")) y -= 1;
    if (keys.has("KeyS")) y += 1;
    x += state.input.move.x;
    y += state.input.move.y;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, active: Math.hypot(x, y) > 0.05 };
  }

  function shootInput() {
    let x = 0;
    let y = 0;
    const keys = state.input.keys;
    if (keys.has("ArrowLeft")) x -= 1;
    if (keys.has("ArrowRight")) x += 1;
    if (keys.has("ArrowUp")) y -= 1;
    if (keys.has("ArrowDown")) y += 1;
    x += state.input.shoot.x;
    y += state.input.shoot.y;
    if (state.input.mouse.down) {
      x = state.input.mouse.x - state.player.x;
      y = state.input.mouse.y - state.player.y;
    }
    const len = Math.hypot(x, y) || 1;
    const active = Math.hypot(x, y) > 0.08 || state.input.mouse.down;
    return { x: x / len, y: y / len, active };
  }

  function update(dt) {
    if (!state.running || !state.player) return;
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 16);

    updatePlayer(dt);
    updateCompanion(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePuddles(dt);
    updatePickups(dt);
    updateShop(dt);
    updateBossIntro(dt);
    updateParticles(dt);
    updateRoomFlow(dt);
    updateMessages(dt);
  }

  function updatePlayer(dt) {
    const p = state.player;
    const move = moveInput();
    p.step += (move.active ? 10 : 2.4) * dt;
    p.shotPulse = Math.max(0, (p.shotPulse || 0) - dt * 7.5);
    p.blinkTimer -= dt;
    if (p.blinkTimer <= 0 && p.blinking <= 0) {
      p.blinking = 0.13;
      p.blinkTimer = rand(1.6, 4.2);
    }
    p.blinking = Math.max(0, p.blinking - dt);
    p.stepDust = Math.max(0, (p.stepDust || 0) - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);

    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.invuln = Math.max(p.invuln, 0.18);
      p.x += p.dashDir.x * 620 * dt;
      p.y += p.dashDir.y * 620 * dt;
      for (const e of state.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r + 16) {
          damageEnemy(e, p.damage * 2.2, null, true);
          e.x += p.dashDir.x * 28;
          e.y += p.dashDir.y * 28;
        }
      }
      if (Math.random() < dt * 45) addParticle(p.x + rand(-10, 10), p.y + rand(-10, 10), pick(["#ff6b8a", "#f7c75d", "#7be0ad", "#64c7ff"]), rand(3, 7), 0.45);
    } else if (move.active) {
      p.x += move.x * p.speed * dt;
      p.y += move.y * p.speed * dt;
      if (p.stepDust <= 0) {
        p.stepDust = 0.075;
        addParticle(p.x - move.x * 12 + rand(-5, 5), p.y + 23 + rand(-2, 3), "rgba(214, 171, 98, 0.42)", rand(2, 4.2), rand(0.22, 0.36));
      }
    }
    p.x = clamp(p.x, 35, state.w - 35);
    p.y = clamp(p.y, 65, state.h - 35);
    resolveObstacleCircle(p);
    p.invuln = Math.max(0, p.invuln - dt);
    updatePlayerAura(dt);

    const aim = shootInput();
    if (aim.active) {
      p.aim = { x: aim.x, y: aim.y };
      p.fireTimer -= dt;
      if (p.fireTimer <= 0) {
        firePlayerShot(p.x, p.y, aim.x, aim.y);
        p.fireTimer = p.fireDelay;
      }
    } else {
      p.fireTimer = Math.min(p.fireTimer, p.fireDelay * 0.45);
    }
  }

  function updatePlayerAura(dt) {
    const p = state.player;
    if (!p.traits.stinkAura) return;
    const range = 58 + p.traits.stinkAura * 14;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < range + e.r) {
        damageEnemy(e, dt * (0.34 + p.traits.stinkAura * 0.18), null, false);
        if (Math.random() < dt * 9) addParticle(e.x + rand(-10, 10), e.y + rand(-10, 10), hasSynergy("rainbowStink") ? pick(["#ff6b8a", "#7be0ad", "#64c7ff"]) : "#c4b49a", rand(2, 5), 0.38);
      }
    }
    if (Math.random() < dt * 10) addParticle(p.x + rand(-28, 28), p.y + rand(-20, 20), hasSynergy("rainbowStink") ? pick(["#ff6b8a", "#f7c75d", "#7be0ad", "#64c7ff"]) : "#a89d82", rand(2, 4), 0.5);
  }

  function startPrideDash() {
    const p = state.player;
    if (!state.running || !p || p.prideCharge < 100 || p.dashCooldown > 0 || p.dashTime > 0) return;
    const move = moveInput();
    const aim = shootInput();
    const dir = move.active ? move : aim.active ? aim : p.aim;
    p.dashDir = { x: dir.x, y: dir.y };
    p.dashTime = 0.22;
    p.dashCooldown = 0.35;
    p.prideCharge = 0;
    p.invuln = Math.max(p.invuln, 0.35);
    state.shake = Math.max(state.shake, 5);
    playSound("dash");
    addMessage("Радужный рывок!", "#64c7ff");
    for (let i = 0; i < 18; i++) addParticle(p.x, p.y, pick(["#ff6b8a", "#f7c75d", "#7be0ad", "#64c7ff"]), rand(3, 7), rand(0.35, 0.8));
  }

  function updateCompanion(dt) {
    const p = state.player;
    if (!p.traits.companion) return;
    p.traits.companionTimer -= dt;
    const rate = hasSynergy("ducklingStorm") ? 0.42 : 0.78;
    if (p.traits.companionTimer > 0 || state.enemies.length === 0) return;
    const nearest = nearestEnemy(p.x, p.y, 520);
    if (!nearest) return;
    const offsetAngle = state.time * 3.2;
    const sx = p.x + Math.cos(offsetAngle) * 30;
    const sy = p.y + Math.sin(offsetAngle) * 22;
    const dx = nearest.x - sx;
    const dy = nearest.y - sy;
    const len = Math.hypot(dx, dy) || 1;
    spawnPlayerBullet(sx, sy, dx / len, dy / len, {
      damage: p.damage * 0.55,
      r: Math.max(3.5, p.bulletSize * 0.7),
      life: p.bulletLife * 0.8,
      color: "#f7c75d",
      companion: true,
    });
    p.traits.companionTimer = rate;
  }

  function firePlayerShot(x, y, dx, dy) {
    const p = state.player;
    playSound("shoot");
    p.shotPulse = 1;
    const shots = p.traits.shots;
    const spread = shots > 1 ? p.traits.spread || 0.16 : 0;
    const baseAngle = Math.atan2(dy, dx);
    const start = -spread * (shots - 1) * 0.5;
    for (let i = 0; i < shots; i++) {
      const angle = baseAngle + start + spread * i;
      spawnPlayerBullet(x, y, Math.cos(angle), Math.sin(angle));
    }
  }

  function spawnPlayerBullet(x, y, dx, dy, overrides = {}) {
    const p = state.player;
    let damage = overrides.damage ?? p.damage;
    let crit = false;
    if (Math.random() < p.traits.crit) {
      damage *= hasSynergy("luckyCoffee") ? 2.05 : 1.7;
      crit = true;
    }
    state.bullets.push({
      x,
      y,
      vx: dx * (overrides.speed ?? p.shotSpeed),
      vy: dy * (overrides.speed ?? p.shotSpeed),
      r: overrides.r ?? p.bulletSize,
      damage,
      life: overrides.life ?? p.bulletLife,
      maxLife: overrides.life ?? p.bulletLife,
      bounce: overrides.bounce ?? p.traits.bounce,
      pierce: overrides.pierce ?? p.traits.pierce,
      homing: overrides.homing ?? p.traits.homing,
      burn: overrides.burn ?? p.traits.burn,
      poison: overrides.poison ?? p.traits.poison,
      chill: overrides.chill ?? p.traits.chill,
      split: overrides.split ?? p.traits.split,
      electric: overrides.electric ?? p.traits.electric,
      trail: overrides.trail ?? (p.traits.trail || hasSynergy("spicyFoam")),
      firework: overrides.firework ?? p.traits.firework,
      rainbowTrail: overrides.rainbowTrail ?? p.traits.rainbowTrail,
      color: overrides.color ?? (p.traits.rainbowTrail ? `hsl(${Math.floor((state.time * 210 + rand(0, 80)) % 360)}, 92%, 72%)` : crit ? "#fff3a6" : "#f7f0dc"),
      hit: new Set(),
      didSplit: false,
      didFirework: false,
      companion: !!overrides.companion,
      crit,
    });
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const e of state.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      e.spawnGrace = Math.max(0, (e.spawnGrace || 0) - dt);
      if (e.burn > 0) {
        e.burn -= dt;
        damageEnemy(e, dt * 1.05, null, false);
        if (Math.random() < dt * 5) addParticle(e.x, e.y, "#ff8a43", 3, 0.35);
      }
      if (e.poison > 0) {
        e.poison -= dt;
        damageEnemy(e, dt * 0.85, null, false);
        if (Math.random() < dt * 5) addParticle(e.x, e.y, "#72df84", 3, 0.35);
      }
      e.chill = Math.max(0, e.chill - dt);

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const slow = (e.chill > 0 ? 0.48 : 1) * (e.spawnGrace > 0 ? 0.28 : 1);
      e.cooldown -= dt;
      e.wobble += dt * (e.boss ? 1.6 : 4.2);
      e.hitPulse = Math.max(0, (e.hitPulse || 0) - dt * 7.5);
      updateEnemyQuip(e, dt);

      if (e.dash > 0) {
        e.dash -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      } else {
        const wobble =
          e.type === "drunk" || e.type === "bossDrunk" || e.type === "bossStuffy" ? Math.sin(e.wobble) * 0.8 : 0;
        const flee = e.type === "bossStuffy" && len < 170 ? -0.58 : 1;
        e.vx = (dx / len * flee + Math.cos(e.wobble * 0.7) * wobble) * e.speed * slow;
        e.vy = (dy / len * flee + Math.sin(e.wobble * 0.5) * wobble) * e.speed * slow;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }

      e.x = clamp(e.x, 38 + e.r, state.w - 38 - e.r);
      e.y = clamp(e.y, 70 + e.r, state.h - 32 - e.r);
      resolveObstacleCircle(e);

      if (e.spawnGrace <= 0) {
        if (e.boss) updateBossAttack(e, dt, dx / len, dy / len);
        else updateEnemyAttack(e, dx / len, dy / len);
      }

      const contact = dist(e, p);
      if (e.spawnGrace <= 0 && contact < e.r + p.r) {
        const nx = dx / len;
        const ny = dy / len;
        const overlap = e.r + p.r - contact;
        const push = overlap + 12;
        e.x -= nx * push * 0.55;
        e.y -= ny * push * 0.55;
        p.x += nx * push * (p.invuln > 0 ? 0.35 : 0.6);
        p.y += ny * push * (p.invuln > 0 ? 0.35 : 0.6);
        p.x = clamp(p.x, 35, state.w - 35);
        p.y = clamp(p.y, 65, state.h - 35);
        resolveObstacleCircle(p);
        if (e.damage > 0) hurtPlayer(e.damage);
      }
    }

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      if (state.enemies[i].hp <= 0) killEnemy(i);
    }
  }

  function updateEnemyQuip(e, dt) {
    if (e.quip) {
      e.quip.life -= dt;
      if (e.quip.life <= 0) e.quip = null;
    }
    e.quipTimer = Math.max(0, (e.quipTimer || 0) - dt);
    if (e.spawnGrace > 0 || e.quip || e.quipTimer > 0) return;
    const list = quips[e.type] || quips[e.attack] || quips.hType;
    const text = pick(list);
    e.quip = { text, life: e.boss ? 2.6 : 1.65, max: e.boss ? 2.6 : 1.65 };
    e.quipTimer = rand(e.boss ? 3.3 : 4.8, e.boss ? 6.4 : 9.0);
  }

  function updateEnemyAttack(e, nx, ny) {
    if (e.cooldown > 0) return;
    if (e.attack === "dash") {
      e.vx = nx * (250 + state.floor * 18);
      e.vy = ny * (250 + state.floor * 18);
      e.dash = 0.28;
      e.cooldown = rand(1.0, 1.7);
    }
    if (e.attack === "bottle") {
      spawnEnemyBullet(e.x, e.y, nx, ny, "#bba6ff", 5, 210);
      e.cooldown = rand(1.35, 2.05);
    }
    if (e.attack === "needle") {
      const a = Math.atan2(ny, nx) + rand(-0.22, 0.22);
      spawnEnemyBullet(e.x, e.y, Math.cos(a), Math.sin(a), "#8cffb6", 4, 250);
      e.cooldown = rand(0.9, 1.45);
    }
    if (e.attack === "explode") {
      const len = dist(e, state.player);
      if (len < 132) {
        radialEnemyBullets(e.x, e.y, 8, "#f0ba67", 170, 4.6);
        e.hp = 0;
        state.shake = 8;
      } else {
        e.cooldown = 0.3;
      }
    }
  }

  function updateBossAttack(e, dt, nx, ny) {
    if (e.attack === "bossStuffy") {
      updateStuffyAura(e, dt);
      e.cooldown = 0.35;
      return;
    }
    e.angle += dt * (1.6 + state.floor * 0.2);
    if (e.hp < e.maxHp * 0.48 && e.phase === 1) {
      e.phase = 2;
      playSound("phase");
      if (e.type === "bossDestroy") {
        e.r = 47;
        e.speed *= 1.18;
        e.damage = 2;
        radialEnemyBullets(e.x, e.y, 14, "#d4d4d4", 190, 4.4);
        addMessage("Устрой Дестрой сбривает волосы и залезает в тачку.");
      } else {
        addMessage(`${e.name} злится сильнее.`);
      }
      state.shake = 9;
    }
    e.spawnTimer -= dt;
    if (e.spawnTimer <= 0) {
      const minionType = e.type === "bossShade" ? "shade" : e.type === "bossDestroy" ? (e.phase === 2 ? "keg" : "hType") : "drunk";
      const angle = rand(0, TAU);
      spawnEnemy(minionType, e.x + Math.cos(angle) * (e.r + 32), e.y + Math.sin(angle) * (e.r + 32));
      e.spawnTimer = e.phase === 2 ? 4.1 : 5.4;
    }
    if (e.cooldown > 0) return;

    if (e.attack === "bossBottles") {
      const shots = e.phase === 2 ? 9 : 6;
      for (let i = 0; i < shots; i++) {
        const a = Math.atan2(ny, nx) + rand(-0.8, 0.8);
        spawnEnemyBullet(e.x, e.y, Math.cos(a), Math.sin(a), "#c8b0ff", 6, rand(160, 230));
      }
      e.cooldown = e.phase === 2 ? 1.05 : 1.45;
    }
    if (e.attack === "bossDash") {
      e.vx = nx * (360 + e.phase * 48);
      e.vy = ny * (360 + e.phase * 48);
      e.dash = 0.36;
      radialEnemyBullets(e.x, e.y, e.phase === 2 ? 12 : 8, "#ff8a86", 150, 4.8);
      e.cooldown = e.phase === 2 ? 1.35 : 1.85;
    }
    if (e.attack === "bossDestroy") {
      if (e.phase === 1) {
        e.vx = nx * 320;
        e.vy = ny * 320;
        e.dash = 0.24;
        const base = Math.atan2(ny, nx);
        for (const side of [-1, 1]) {
          const a = base + side * 0.72;
          spawnEnemyBullet(e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, Math.cos(a), Math.sin(a), "#dce4e8", 5, 255);
        }
        e.cooldown = 1.05;
      } else {
        e.vx = nx * 500;
        e.vy = ny * 500;
        e.dash = 0.48;
        for (let i = 0; i < 6; i++) {
          const a = Math.atan2(ny, nx) + rand(-0.9, 0.9);
          spawnEnemyBullet(e.x, e.y, Math.cos(a), Math.sin(a), "#3d3a33", 5.2, rand(155, 230));
        }
        radialEnemyBullets(e.x, e.y, 8, "#9ca9ad", 170, 4.6);
        e.cooldown = 1.22;
      }
    }
    if (e.attack === "bossSpiral") {
      const shots = e.phase === 2 ? 16 : 11;
      for (let i = 0; i < shots; i++) {
        const a = e.angle + (TAU / shots) * i;
        spawnEnemyBullet(e.x, e.y, Math.cos(a), Math.sin(a), "#8dffc0", 4.8, e.phase === 2 ? 220 : 180);
      }
      e.cooldown = e.phase === 2 ? 0.82 : 1.08;
    }
  }

  function updateStuffyAura(e, dt) {
    const p = state.player;
    const range = e.auraRange || 178;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    e.auraHudTick = (e.auraHudTick || 0) + dt;
    e.auraMessageTick = (e.auraMessageTick || 0) + dt;
    if (d < range && p.hp > 1) {
      const pressure = 1 - d / range;
      const drain = dt * (0.42 + pressure * 0.95);
      p.hp = Math.max(1, p.hp - drain);
      if (Math.random() < dt * 8) addParticle(p.x + rand(-16, 16), p.y + rand(-14, 14), "#c4b49a", rand(2, 5), 0.45);
      if (e.auraHudTick > 0.2) {
        updateHud();
        e.auraHudTick = 0;
      }
      if (e.auraMessageTick > 1.35) {
        playSound("aura");
        addMessage("Духота Амира давит, но не добивает.", "#c4b49a");
        e.auraMessageTick = 0;
      }
    }
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      if (b.homing > 0) {
        const target = nearestEnemy(b.x, b.y, 260);
        if (target) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const len = Math.hypot(dx, dy) || 1;
          const speed = Math.hypot(b.vx, b.vy);
          b.vx += (dx / len) * speed * b.homing * dt;
          b.vy += (dy / len) * speed * b.homing * dt;
          const fixed = Math.hypot(b.vx, b.vy) || 1;
          b.vx = (b.vx / fixed) * speed;
          b.vy = (b.vy / fixed) * speed;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.trail && Math.random() < dt * 18) {
        state.puddles.push({
          x: b.x,
          y: b.y,
          r: 16,
          life: 0.9,
          dps: hasSynergy("spicyFoam") ? 1.4 : 0.7,
          color: hasSynergy("spicyFoam") ? "rgba(255, 115, 52, 0.32)" : "rgba(125, 224, 173, 0.24)",
          chill: false,
        });
      }
      if (b.rainbowTrail && Math.random() < dt * 34) {
        addParticle(b.x + rand(-3, 3), b.y + rand(-3, 3), pick(["#ff6b8a", "#f7c75d", "#7be0ad", "#64c7ff"]), rand(2, 5), 0.5);
      }

      if (b.x < 34 + b.r || b.x > state.w - 34 - b.r) {
        if (b.bounce > 0) {
          b.vx *= -1;
          b.bounce -= 1;
          b.x = clamp(b.x, 34 + b.r, state.w - 34 - b.r);
        } else {
          b.life = -1;
        }
      }
      if (b.y < 66 + b.r || b.y > state.h - 30 - b.r) {
        if (b.bounce > 0) {
          b.vy *= -1;
          b.bounce -= 1;
          b.y = clamp(b.y, 66 + b.r, state.h - 30 - b.r);
        } else {
          b.life = -1;
        }
      }

      for (const o of state.obstacles) {
        if (circleRectHit(b, o)) {
          if (b.bounce > 0) {
            bounceFromRect(b, o);
            b.bounce -= 1;
          } else {
            b.life = -1;
          }
        }
      }

      for (const e of state.enemies) {
        if (b.life <= 0 || b.hit.has(e)) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
          b.hit.add(e);
          damageEnemy(e, b.damage, b, true);
          if (b.pierce > 0) b.pierce -= 1;
          else b.life = -1;
        }
      }
    }

    for (const b of state.enemyBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (Math.hypot(b.x - state.player.x, b.y - state.player.y) < b.r + state.player.r) {
        hurtPlayer(1);
        b.life = -1;
      }
    }

    state.bullets = state.bullets.filter((b) => b.life > 0);
    state.enemyBullets = state.enemyBullets.filter(
      (b) => b.life > 0 && b.x > -40 && b.x < state.w + 40 && b.y > -40 && b.y < state.h + 40,
    );
  }

  function damageEnemy(e, amount, bullet = null, direct = true) {
    e.hp -= amount;
    if (direct) {
      e.hitPulse = 1;
      e.flash = 0.11;
      addParticle(e.x, e.y, bullet?.crit ? "#fff3a6" : "#f7f0dc", bullet?.crit ? 9 : 5, 0.28);
    }
    if (!bullet) return;
    if (bullet.burn) e.burn = Math.max(e.burn, hasSynergy("spicyFoam") ? 3 : 2.2);
    if (bullet.poison) {
      e.poison = Math.max(e.poison, 3.2);
      if (Math.random() < (hasSynergy("frozenSwamp") ? 0.75 : 0.45)) {
        state.puddles.push({
          x: e.x + rand(-10, 10),
          y: e.y + rand(-10, 10),
          r: hasSynergy("frozenSwamp") ? 34 : 26,
          life: 3.2,
          dps: hasSynergy("frozenSwamp") ? 1.0 : 0.74,
          color: hasSynergy("frozenSwamp") ? "rgba(94, 207, 255, 0.26)" : "rgba(92, 216, 112, 0.28)",
          chill: hasSynergy("frozenSwamp"),
        });
      }
    }
    if (bullet.chill) e.chill = Math.max(e.chill, 2.4);
    if (bullet.electric) chainLightning(e, bullet.damage * (hasSynergy("wiredSoda") && bullet.bounce < state.player.traits.bounce ? 0.72 : 0.48));
    if (bullet.firework && !bullet.didFirework && Math.random() < Math.min(0.5, 0.16 + bullet.firework * 0.08)) {
      bullet.didFirework = true;
      addComicBurst(e.x, e.y, pick(["БАХ!", "ПАУ!", "КРЯК!", "ФУХ!"]), bullet.rainbowTrail ? pick(["#ff6b8a", "#f7c75d", "#7be0ad", "#64c7ff"]) : "#f7c75d");
      const count = hasSynergy("sparkFireworks") ? 7 : 5;
      for (let i = 0; i < count; i++) {
        const a = (TAU / count) * i + rand(-0.18, 0.18);
        spawnPlayerBullet(e.x, e.y, Math.cos(a), Math.sin(a), {
          damage: bullet.damage * (hasSynergy("sparkFireworks") ? 0.32 : 0.24),
          r: Math.max(3, bullet.r * 0.45),
          life: 0.38,
          speed: 230,
          bounce: 0,
          pierce: 0,
          firework: 0,
          electric: hasSynergy("sparkFireworks"),
          color: bullet.rainbowTrail ? `hsl(${Math.floor((i / count) * 360)}, 92%, 72%)` : "#ffe08a",
        });
      }
    }
    if (bullet.split && !bullet.didSplit) {
      bullet.didSplit = true;
      const angle = Math.atan2(bullet.vy, bullet.vx);
      const count = hasSynergy("echoQuack") ? 4 : 2;
      for (let i = 0; i < count; i++) {
        const offset = ((i - (count - 1) / 2) / count) * 1.15;
        spawnPlayerBullet(bullet.x, bullet.y, Math.cos(angle + Math.PI + offset), Math.sin(angle + Math.PI + offset), {
          damage: bullet.damage * 0.36,
          r: Math.max(3, bullet.r * 0.56),
          life: 0.48,
          speed: Math.hypot(bullet.vx, bullet.vy) * 0.72,
          split: false,
          pierce: 0,
          bounce: 0,
          color: "#d7f7ff",
        });
      }
    }
  }

  function chainLightning(source, damage) {
    let chained = 0;
    for (const e of state.enemies) {
      if (e === source || e.hp <= 0) continue;
      const range = hasSynergy("wiredSoda") ? 150 : 108;
      if (Math.hypot(e.x - source.x, e.y - source.y) < range) {
        e.hp -= damage;
        e.flash = 0.16;
        addLightning(source.x, source.y, e.x, e.y);
        chained += 1;
        if (chained >= (hasSynergy("wiredSoda") ? 3 : 1)) break;
      }
    }
  }

  function killEnemy(index) {
    const e = state.enemies[index];
    state.enemies.splice(index, 1);
    playSound(e.boss ? "boss" : "pop");
    state.shake = Math.max(state.shake, e.boss ? 14 : 4);
    addComicBurst(
      e.x,
      e.y - e.r - 4,
      e.boss ? pick(["ФИНАЛ!", "БАБАХ!", "КРЯК-КРЯК!"]) : pick(["БАХ!", "КРЯК!", "ПАУ!", "ФУХ!"]),
      e.boss ? "#ff6b8a" : pick(["#f7c75d", "#7be0ad", "#64c7ff", "#ff6b8a"]),
      e.boss ? 1.25 : 1,
    );
    for (let i = 0; i < (e.boss ? 26 : 8); i++) addParticle(e.x, e.y, e.color, rand(3, 8), rand(0.35, 0.8));
    state.player.prideCharge = Math.min(100, state.player.prideCharge + (e.boss ? 35 : 9));
    if (!e.boss) {
      state.pickups.push({ type: "coin", x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), r: 9, value: state.player.traits.coinMultiplier });
      if (state.player.traits.coinRain && Math.random() < Math.min(0.62, 0.16 * state.player.traits.coinRain)) {
        state.pickups.push({ type: "coin", x: e.x + rand(-18, 18), y: e.y + rand(-18, 18), r: 9, value: state.player.traits.coinMultiplier });
        addComicBurst(e.x, e.y - 14, "КЭШ!", "#f7c75d");
      }
      if (state.player.traits.healOnKill && Math.random() < state.player.traits.healOnKill && state.player.hp < state.player.maxHp) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1);
        addComicBurst(e.x, e.y - 22, "ХЛЕБНУЛ!", "#e75d55");
        updateHud();
      }
      if (Math.random() < 0.14) {
        state.pickups.push({ type: "heart", x: e.x + rand(-12, 12), y: e.y + rand(-12, 12), r: 10, value: 1 });
      }
    }
    if (e.boss) {
      for (let i = 0; i < 6; i++) {
        state.pickups.push({ type: "coin", x: e.x + rand(-34, 34), y: e.y + rand(-24, 24), r: 9, value: state.player.traits.coinMultiplier });
      }
      if (state.player.hp < state.player.maxHp) {
        state.pickups.push({ type: "heart", x: e.x, y: e.y + 34, r: 10, value: 2 });
      }
      state.pickups.push({ type: "item", x: state.w * 0.5, y: state.h * 0.48, r: 18, item: getRandomItem(), bob: 0 });
    }
  }

  function updatePuddles(dt) {
    for (const puddle of state.puddles) {
      puddle.life -= dt;
      for (const e of state.enemies) {
        if (Math.hypot(e.x - puddle.x, e.y - puddle.y) < e.r + puddle.r) {
          e.hp -= puddle.dps * dt;
          if (puddle.chill) e.chill = Math.max(e.chill, 0.8);
        }
      }
    }
    state.puddles = state.puddles.filter((p) => p.life > 0);
  }

  function updatePickups(dt) {
    const p = state.player;
    for (const pickup of state.pickups) {
      pickup.bob = (pickup.bob || 0) + dt * 4;
      const magnet = p.traits.magnet + (hasSynergy("magnetBank") ? 110 : 0);
      const d = Math.hypot(p.x - pickup.x, p.y - pickup.y);
      if (magnet > 0 && d < magnet) {
        const pull = (1 - d / magnet) * (hasSynergy("magnetBank") ? 620 : 420);
        pickup.x += ((p.x - pickup.x) / (d || 1)) * pull * dt;
        pickup.y += ((p.y - pickup.y) / (d || 1)) * pull * dt;
      }
      if (d < p.r + pickup.r + 6) {
        if (pickup.type === "coin") {
          pickup.dead = true;
          state.coins += pickup.value || 1;
          playSound("coin");
          p.prideCharge = Math.min(100, p.prideCharge + 4);
          if (hasSynergy("magnetBank") && state.coins % 5 === 0) p.hp = Math.min(p.maxHp, p.hp + 1);
          updateHud();
        }
        if (pickup.type === "heart") {
          if (p.hp < p.maxHp) {
            pickup.dead = true;
            p.hp = Math.min(p.maxHp, p.hp + (pickup.value || 1));
            p.prideCharge = Math.min(100, p.prideCharge + 8);
            playSound("heart");
            addMessage("Рома подобрал сердце.", "#e75d55");
            updateHud();
          }
        }
        if (pickup.type === "item") {
          pickup.dead = true;
          giveItem(pickup.item);
        }
      }
    }
    state.pickups = state.pickups.filter((p) => !p.dead);
  }

  function updateShop(dt) {
    if (!state.roomIsShop) return;
    state.shop.noticeCooldown = Math.max(0, state.shop.noticeCooldown - dt);
    state.shop.buyCooldown = Math.max(0, state.shop.buyCooldown - dt);

    const kiosk = kioskRect();
    const p = state.player;
    const nearKiosk =
      p.x > kiosk.x - 28 && p.x < kiosk.x + kiosk.w + 28 && p.y > kiosk.y - 34 && p.y < kiosk.y + kiosk.h + 34;

    if (state.shop.closed && nearKiosk && state.shop.noticeCooldown <= 0) {
      playSound("denied");
      addMessage(state.kioskVisits === 1 ? "Блядь опять перерыв." : "Романькова опять на перерыве. Бывает.", "#f7c75d");
      state.shop.noticeCooldown = 2.0;
    }

    if (state.shop.closed) return;
    for (const slot of state.shop.items) {
      if (slot.bought) continue;
      const d = Math.hypot(p.x - slot.x, p.y - slot.y);
      if (d < p.r + slot.r + 6 && state.shop.buyCooldown <= 0) {
        if (state.coins >= slot.price) {
          state.coins -= slot.price;
          slot.bought = true;
          playSound("buy");
          giveItem(slot.item);
          addMessage(`Куплено у Романьковой за ${slot.price}.`, "#7be0ad");
          state.shop.buyCooldown = 0.55;
          updateHud();
        } else {
          playSound("denied");
          addMessage(`Не хватает монет: нужно ${slot.price}.`, "#f7c75d");
          state.shop.buyCooldown = 1.0;
        }
      }
    }
  }

  function updateBossIntro(dt) {
    const intro = state.bossIntro;
    if (!intro || intro.done) return;
    intro.time += dt;

    if (intro.stage === 0 && intro.time > 2.0) {
      intro.stage = 1;
      state.shake = Math.max(state.shake, 3);
      playSound("knock");
      addMessage("Тук.", "#f7f0dc");
      addKnockDust();
    }
    if (intro.stage === 1 && intro.time > 3.65) {
      intro.stage = 2;
      state.shake = Math.max(state.shake, 5);
      playSound("knock");
      addMessage("Тук. Тук.", "#f7f0dc");
      addKnockDust();
    }
    if (intro.stage === 2 && intro.time > 5.65) {
      intro.stage = 3;
      state.shake = Math.max(state.shake, 8);
      playSound("aura");
      addMessage("Входит Амир. Воздух сразу стал тяжелым.", "#c4b49a");
      state.bullets.length = 0;
      state.enemyBullets.length = 0;
      spawnBoss();
      intro.done = true;
      state.bossIntro = null;
    }
  }

  function addKnockDust() {
    const x = state.w * 0.5;
    const y = 72;
    for (let i = 0; i < 18; i++) {
      addParticle(x + rand(-42, 42), y + rand(-6, 22), "#dbefff", rand(2, 6), rand(0.35, 0.7));
    }
  }

  function updateRoomFlow(dt) {
    if (state.bossIntro) return;

    if (state.roomIsShop) {
      state.doorPulse += dt;
      const door = doorRect();
      const p = state.player;
      const inDoor = p.x > door.x && p.x < door.x + door.w && p.y > door.y && p.y < door.y + door.h;
      if (inDoor) nextRoom();
      return;
    }

    if (!state.cleared && state.enemies.length === 0) {
      state.cleared = true;
      if (!state.roomIsBoss) {
        state.doorOpen = true;
        const itemChance = 0.72 - state.player.items.length * 0.018;
        if (Math.random() < itemChance) {
          state.pickups.push({ type: "item", x: state.w * 0.5, y: state.h * 0.43, r: 18, item: getRandomItem(), bob: 0 });
        }
        addMessage("Комната очищена. Дверь открыта.");
      } else {
        addMessage("Босс повержен. Прыгай в люк.");
        state.doorOpen = true;
      }
    }

    if (state.doorOpen) {
      state.doorPulse += dt;
      const door = doorRect();
      const p = state.player;
      const inDoor = p.x > door.x && p.x < door.x + door.w && p.y > door.y && p.y < door.y + door.h;
      if (inDoor) nextRoom();
    }
  }

  function nextRoom() {
    playSound("door");
    if (state.roomIsShop) {
      if (state.room >= state.roomsBeforeBoss) {
        spawnRoom(true);
      } else {
        state.room += 1;
        spawnRoom(false);
      }
      return;
    }

    if (state.roomIsBoss) {
      if (state.floor >= state.maxFloors) {
        winGame();
        return;
      }
      state.floor += 1;
      state.room = 1;
      state.roomsBeforeBoss = 3 + state.floor;
      state.combatRoomsCleared = 0;
      spawnRoom(false);
      addMessage(`Этаж ${state.floor}: запах хуже, добыча вкуснее.`);
      return;
    }

    state.combatRoomsCleared += 1;
    if (state.combatRoomsCleared % 2 === 0 && state.room < state.roomsBeforeBoss) {
      spawnShopRoom();
      return;
    }

    if (state.room >= state.roomsBeforeBoss) {
      spawnRoom(true);
    } else {
      state.room += 1;
      spawnRoom(false);
    }
  }

  function hurtPlayer(amount) {
    const p = state.player;
    if (p.invuln > 0 || state.gameOver) return;
    if (p.traits.shieldCoins && state.coins >= 3 && Math.random() < 0.55) {
      state.coins -= 3;
      playSound("shield");
      addMessage("Кошелек-щит съел удар.", "#64c7ff");
      p.invuln = 0.75;
      updateHud();
      return;
    }
    p.hp -= amount;
    p.invuln = 1.0;
    state.shake = 9;
    playSound("hit");
    addParticle(p.x, p.y, "#e75d55", 12, 0.55);
    updateHud();
    if (p.hp <= 0) loseGame();
  }

  function loseGame() {
    state.running = false;
    state.gameOver = true;
    playSound("lose");
    showEndOverlay("Рома упал", "Лесозавод победил в этот раз. Предметы сочетались, но район сочетался жестче.", "Начать заново");
  }

  function winGame() {
    state.running = false;
    state.won = true;
    playSound("win");
    showEndOverlay("Лесозавод очищен", "Рома выжил, боссы повержены, мерзкий арсенал собран. Основа готова для новых районов, предметов и безумных синергий.", "Играть еще раз");
  }

  function showEndOverlay(title, text, buttonText) {
    overlay.querySelector("h1").textContent = title;
    overlay.querySelector(".overlay-card > p:not(.kicker)").textContent = text;
    startButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  function spawnEnemyBullet(x, y, dx, dy, color, r = 5, speed = 200) {
    state.enemyBullets.push({ x, y, vx: dx * speed, vy: dy * speed, r, color, life: 4 });
  }

  function radialEnemyBullets(x, y, count, color, speed, r) {
    for (let i = 0; i < count; i++) {
      const a = (TAU / count) * i + rand(-0.04, 0.04);
      spawnEnemyBullet(x, y, Math.cos(a), Math.sin(a), color, r, speed);
    }
  }

  function nearestEnemy(x, y, range = Infinity) {
    let best = null;
    let bestD = range;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function resolveObstacleCircle(obj) {
    for (const o of state.obstacles) {
      const cx = clamp(obj.x, o.x, o.x + o.w);
      const cy = clamp(obj.y, o.y, o.y + o.h);
      const dx = obj.x - cx;
      const dy = obj.y - cy;
      const d = Math.hypot(dx, dy);
      if (d < obj.r && d > 0.001) {
        const push = obj.r - d;
        obj.x += (dx / d) * push;
        obj.y += (dy / d) * push;
      }
    }
  }

  function circleRectHit(circle, rect) {
    const cx = clamp(circle.x, rect.x, rect.x + rect.w);
    const cy = clamp(circle.y, rect.y, rect.y + rect.h);
    return Math.hypot(circle.x - cx, circle.y - cy) < circle.r;
  }

  function bounceFromRect(b, o) {
    const left = Math.abs(b.x - o.x);
    const right = Math.abs(b.x - (o.x + o.w));
    const top = Math.abs(b.y - o.y);
    const bottom = Math.abs(b.y - (o.y + o.h));
    const min = Math.min(left, right, top, bottom);
    if (min === left || min === right) b.vx *= -1;
    else b.vy *= -1;
  }

  function addParticle(x, y, color, size, life) {
    const a = rand(0, TAU);
    const speed = rand(30, 180);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      size,
      color,
      life,
      max: life,
      lightning: false,
    });
  }

  function addComicBurst(x, y, text, color = "#f7c75d", scale = 1) {
    state.particles.push({
      x,
      y,
      vx: rand(-20, 20),
      vy: rand(-88, -52),
      size: rand(1.0, 1.28) * scale,
      color,
      life: 1.1,
      max: 1.1,
      comic: true,
      text,
    });
    for (let i = 0; i < Math.round(12 * scale); i++) addParticle(x, y, color, rand(3, 8), rand(0.24, 0.6));
  }

  function addLightning(x1, y1, x2, y2) {
    state.particles.push({ x: x1, y: y1, x2, y2, color: "#9fe9ff", life: 0.12, max: 0.12, lightning: true });
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      if (!p.lightning) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy = p.comic ? p.vy * 0.94 + 28 * dt : p.vy * 0.96;
      }
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function updateMessages(dt) {
    for (const m of state.messages) m.life -= dt;
    state.messages = state.messages.filter((m) => m.life > 0);
    if (synergyToast.textContent && !state.messages.some((m) => m.text.startsWith("Синергия"))) {
      synergyToast.textContent = "";
    }
  }

  function doorRect() {
    if (state.roomIsBoss) {
      return { x: state.w * 0.5 - 34, y: state.h - 72, w: 68, h: 40 };
    }
    return { x: state.w - 62, y: state.h * 0.5 - 44, w: 42, h: 88 };
  }

  function kioskRect() {
    return { x: state.w * 0.5 - 82, y: state.h * 0.3 - 28, w: 164, h: 82 };
  }

  function draw() {
    const sx = state.shake ? rand(-state.shake, state.shake) : 0;
    const sy = state.shake ? rand(-state.shake, state.shake) : 0;
    ctx.save();
    ctx.clearRect(0, 0, state.w, state.h);
    ctx.translate(sx, sy);
    drawRoom();
    drawShop();
    drawPuddles();
    drawPickups();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawDoor();
    drawBossIntro();
    drawScreenFx();
    drawMessages();
    ctx.restore();
    drawBossHud();
  }

  function drawRoom() {
    const coolIntro = state.bossIntro?.type === "amir";
    const g = ctx.createLinearGradient(0, 0, state.w, state.h);
    if (coolIntro) {
      g.addColorStop(0, "#1e3134");
      g.addColorStop(0.54, "#172324");
      g.addColorStop(1, "#203033");
    } else {
      g.addColorStop(0, "#2b2c1f");
      g.addColorStop(0.54, "#211f19");
      g.addColorStop(1, "#302019");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);

    const tile = 54;
    for (let y = 76; y < state.h - 25; y += tile) {
      for (let x = 34; x < state.w - 34; x += tile) {
        const seed = x * 0.17 + y * 0.31 + state.floor * 19 + state.room * 7;
        const shade = hash01(seed);
        ctx.fillStyle = coolIntro
          ? `rgba(190, 239, 255, ${0.035 + shade * 0.04})`
          : `rgba(255, 244, 200, ${0.018 + shade * 0.04})`;
        ctx.fillRect(x, y, tile - 3, tile - 3);
        ctx.strokeStyle = coolIntro ? "rgba(202, 246, 255, 0.1)" : "rgba(0, 0, 0, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 7, y + tile * 0.42);
        ctx.lineTo(x + tile - 12, y + tile * 0.42 + Math.sin((x + y) * 0.02) * 3);
        ctx.moveTo(x + 10, y + tile * 0.72);
        ctx.lineTo(x + tile - 8, y + tile * 0.72 + Math.cos((x - y) * 0.02) * 3);
        ctx.stroke();
        if (shade > 0.72) {
          ctx.fillStyle = coolIntro ? "rgba(197, 237, 245, 0.08)" : "rgba(18, 14, 8, 0.12)";
          ctx.beginPath();
          ctx.ellipse(x + 18 + shade * 18, y + 14 + hash01(seed + 2) * 22, 15, 3, hash01(seed + 4) * TAU, 0, TAU);
          ctx.fill();
        }
      }
    }

    for (let i = 0; i < 95; i++) {
      const seed = i + state.floor * 101 + state.room * 37 + (state.roomIsBoss ? 500 : 0) + (state.roomIsShop ? 900 : 0);
      const x = 46 + hash01(seed) * (state.w - 92);
      const y = 78 + hash01(seed + 9.7) * (state.h - 122);
      const r = 1 + hash01(seed + 3.1) * 2.6;
      ctx.fillStyle = coolIntro
        ? hash01(seed + 1.9) > 0.6 ? "rgba(183, 236, 247, 0.16)" : "rgba(255, 255, 255, 0.06)"
        : hash01(seed + 1.9) > 0.6 ? "rgba(150, 106, 55, 0.22)" : "rgba(0, 0, 0, 0.12)";
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.8, r, hash01(seed + 2.6) * TAU, 0, TAU);
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 22; i++) {
      const seed = 1200 + i * 13 + state.floor * 29 + state.room * 31;
      const drift = (state.time * (10 + hash01(seed + 4) * 22) + hash01(seed + 1) * state.w) % (state.w + 80);
      const x = drift - 40;
      const y = 86 + hash01(seed + 2) * (state.h - 138) + Math.sin(state.time * 1.8 + seed) * 5;
      const alpha = coolIntro ? 0.08 + hash01(seed + 3) * 0.08 : 0.05 + hash01(seed + 3) * 0.09;
      ctx.fillStyle = coolIntro ? `rgba(190, 239, 255, ${alpha})` : `rgba(247, 199, 93, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.2 + hash01(seed + 5) * 2.4, 0.7 + hash01(seed + 6) * 1.2, Math.sin(state.time + seed), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (let i = 0; i < 12; i++) {
      const seed = 900 + i * 11 + state.floor * 43 + state.room * 17 + (state.roomIsShop ? 700 : 0);
      const x = 58 + hash01(seed) * (state.w - 116);
      const y = 90 + hash01(seed + 5) * (state.h - 142);
      ctx.strokeStyle = coolIntro ? "rgba(197, 237, 245, 0.12)" : "rgba(18, 18, 14, 0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + hash01(seed + 1) * 34 - 17, y + 16 + hash01(seed + 2) * 18);
      ctx.lineTo(x + hash01(seed + 3) * 42 - 21, y + 30 + hash01(seed + 4) * 20);
      ctx.stroke();
    }

    ctx.fillStyle = "#151510";
    ctx.fillRect(0, 0, state.w, 64);
    ctx.fillRect(0, state.h - 28, state.w, 28);
    ctx.fillRect(0, 0, 34, state.h);
    ctx.fillRect(state.w - 34, 0, 34, state.h);

    ctx.strokeStyle = "rgba(247, 240, 220, 0.17)";
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 64, state.w - 68, state.h - 92);
    drawWallBolts(coolIntro);

    for (const o of state.obstacles) {
      drawBlobShadow(o.x + o.w * 0.5, o.y + o.h + 5, o.w * 0.46, 8, 0.24);
      ctx.fillStyle = "#3c3327";
      roundedRect(o.x, o.y, o.w, o.h, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(o.x + 6, o.y + o.h - 8, o.w - 12, 4);
      ctx.strokeStyle = "rgba(214, 171, 98, 0.18)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const yy = o.y + 10 + i * (o.h - 18) / 3;
        ctx.beginPath();
        ctx.moveTo(o.x + 8, yy);
        ctx.lineTo(o.x + o.w - 8, yy + Math.sin(o.x + yy) * 2);
        ctx.stroke();
      }
      drawNails(o.x + 10, o.y + 9, o.w - 20, o.h - 18);
    }
  }

  function drawShop() {
    if (!state.roomIsShop) return;
    const k = kioskRect();
    ctx.save();

    ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
    ctx.beginPath();
    ctx.ellipse(k.x + k.w / 2, k.y + k.h + 9, k.w * 0.55, 14, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#5e3f2a";
    roundedRect(k.x, k.y, k.w, k.h, 8);
    ctx.fill();
    ctx.strokeStyle = "#d7a65b";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#2f2017";
    roundedRect(k.x + 12, k.y + 48, k.w - 24, 26, 5);
    ctx.fill();
    ctx.fillStyle = "#f7c75d";
    ctx.font = "900 13px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("КИОСК РОМАНЬКОВОЙ", k.x + k.w / 2, k.y + 22);

    if (state.shop.closed) {
      ctx.fillStyle = "#151510";
      roundedRect(k.x + 22, k.y + 44, k.w - 44, 34, 5);
      ctx.fill();
      ctx.strokeStyle = "#e75d55";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f7f0dc";
      ctx.font = "900 12px system-ui";
      ctx.fillText("ПЕРЕРЫВ 15 МИН", k.x + k.w / 2, k.y + 61);
    } else {
      ctx.fillStyle = "#7be0ad";
      ctx.font = "800 12px system-ui";
      ctx.fillText("подходи к товару", k.x + k.w / 2, k.y + 61);
      drawShopItems();
    }
    ctx.restore();
  }

  function drawShopItems() {
    for (const slot of state.shop.items) {
      if (slot.bought) continue;
      ctx.save();
      ctx.translate(slot.x, slot.y + Math.sin(state.time * 4 + slot.price) * 3);
      ctx.fillStyle = "#e0b05b";
      roundedRect(-24, -18, 48, 36, 7);
      ctx.fill();
      ctx.strokeStyle = state.coins >= slot.price ? "#7be0ad" : "#e75d55";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#fff3bd";
      ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(slot.item.icon, 0, 0);

      ctx.fillStyle = "rgba(0,0,0,0.58)";
      roundedRect(-22, 24, 44, 20, 5);
      ctx.fill();
      ctx.fillStyle = "#f7c75d";
      ctx.font = "900 12px system-ui";
      ctx.fillText(`${slot.price}$`, 0, 34);
      ctx.restore();
    }
  }

  function drawDoor() {
    if (!state.doorOpen) return;
    const d = doorRect();
    const pulse = 0.5 + Math.sin(state.doorPulse * 5) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.78 + pulse * 0.22;
    ctx.fillStyle = state.roomIsBoss ? "#11100c" : state.roomIsShop ? "#241a0e" : "#201711";
    roundedRect(d.x, d.y, d.w, d.h, state.roomIsBoss ? 22 : 6);
    ctx.fill();
    ctx.strokeStyle = state.roomIsBoss ? "#64c7ff" : state.roomIsShop ? "#7be0ad" : "#f7c75d";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = state.roomIsBoss ? "rgba(100,199,255,0.22)" : state.roomIsShop ? "rgba(123,224,173,0.18)" : "rgba(247,199,93,0.18)";
    roundedRect(d.x + 8, d.y + 8, d.w - 16, d.h - 16, state.roomIsBoss ? 16 : 4);
    ctx.fill();
    ctx.restore();
  }

  function drawPuddles() {
    for (const p of state.puddles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / 0.8, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.72, Math.sin(p.life) * 0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPickups() {
    for (const p of state.pickups) {
      const bob = Math.sin((p.bob || 0) * 3) * 4;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      const pickupPulse = 1 + Math.sin(state.time * 5 + p.x * 0.03 + p.y * 0.02) * 0.055;
      const pickupTilt = Math.sin(state.time * 3.1 + p.x * 0.01) * 0.08;
      ctx.rotate(pickupTilt);
      ctx.scale(pickupPulse, pickupPulse);
      if (p.type === "coin") {
        drawBlobShadow(0, 7, p.r * 1.2, 4, 0.24);
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, p.r * 2.4);
        glow.addColorStop(0, "rgba(247,199,93,0.45)");
        glow.addColorStop(1, "rgba(247,199,93,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 2.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#f7c75d";
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#7b5420";
        ctx.lineWidth = 2;
        ctx.stroke();
        drawSpriteHighlight(-3, -4, p.r * 0.32, p.r * 0.18, 0.42);
        ctx.fillStyle = "#7b5420";
        ctx.font = "bold 12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("$", 0, 0);
      } else if (p.type === "heart") {
        ctx.fillStyle = "#e75d55";
        ctx.beginPath();
        ctx.moveTo(0, 9);
        ctx.bezierCurveTo(-18, -3, -9, -18, 0, -8);
        ctx.bezierCurveTo(9, -18, 18, -3, 0, 9);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();
        drawSpriteHighlight(-4, -7, 5, 3, 0.34);
      } else if (p.item) {
        drawBlobShadow(0, 18, 24, 7, 0.25);
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
        glow.addColorStop(0, "rgba(255, 220, 126, 0.38)");
        glow.addColorStop(1, "rgba(255, 220, 126, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 34, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#e0b05b";
        roundedRect(-22, -17, 44, 34, 7);
        ctx.fill();
        ctx.strokeStyle = "#6b4326";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "#fff3bd";
        ctx.font = "bold 20px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.item.icon, 0, 1);
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-15, -9);
        ctx.lineTo(15, -12);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of state.bullets) {
      ctx.save();
      ctx.globalAlpha = clamp(b.life / 0.12, 0.25, 1);
      const speed = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = b.rainbowTrail ? b.color : "rgba(247,240,220,0.32)";
      ctx.lineWidth = Math.max(2, b.r * 0.45);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / speed) * b.r * 5, b.y - (b.vy / speed) * b.r * 5);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const glow = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 3.3);
      glow.addColorStop(0, b.crit ? "rgba(255,243,166,0.48)" : "rgba(247,240,220,0.3)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      if (b.electric) {
        ctx.strokeStyle = "rgba(159,233,255,0.65)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 3, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const b of state.enemyBullets) {
      const speed = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = "rgba(231,93,85,0.28)";
      ctx.lineWidth = Math.max(2, b.r * 0.42);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / speed) * b.r * 4, b.y - (b.vy / speed) * b.r * 4);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const glow = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 3.2);
      glow.addColorStop(0, "rgba(231,93,85,0.28)");
      glow.addColorStop(1, "rgba(231,93,85,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const e of state.enemies) {
      if (e.type === "bossStuffy") drawStuffyAura(e);
      ctx.save();
      const hitPulse = e.hitPulse || 0;
      const dashPulse = e.dash > 0 ? 1 : 0;
      const hop = Math.sin(e.wobble * (e.boss ? 1.35 : 2.1)) * (e.boss ? 1.2 : 2.4);
      const squishX = 1 + hitPulse * 0.16 + dashPulse * 0.11;
      const squishY = 1 - hitPulse * 0.1 - dashPulse * 0.08 + Math.sin(e.wobble * 2.2) * (e.boss ? 0.012 : 0.025);
      ctx.translate(e.x, e.y + hop);
      drawBlobShadow(0, e.r * 0.95 - hop * 0.18, e.r * (1.15 + hitPulse * 0.18), e.r * (0.34 - hitPulse * 0.04), e.boss ? 0.34 : 0.26);
      ctx.rotate(Math.sin(e.wobble) * (e.boss ? 0.05 : 0.12) + hitPulse * Math.sin(state.time * 48) * 0.035);
      ctx.scale(squishX, squishY);
      ctx.globalAlpha = e.spawnGrace > 0 ? 0.42 + Math.sin(state.time * 18) * 0.18 : e.flash > 0 ? 0.72 : 1;
      if (e.boss) drawBoss(e);
      else if (e.type === "hType") drawXType(e);
      else if (e.type === "drunk") drawDrunk(e);
      else if (e.type === "shade") drawShade(e);
      else drawKeg(e);
      ctx.restore();

      if (!e.boss) {
        const barW = e.r * 2;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(e.x - barW / 2, e.y - e.r - 12, barW, 4);
        ctx.fillStyle = "#e75d55";
        ctx.fillRect(e.x - barW / 2, e.y - e.r - 12, barW * clamp(e.hp / e.maxHp, 0, 1), 4);
      }
      if (e.quip) drawSpeechBubble(e.x, e.y - e.r - (e.boss ? 36 : 22), e.quip.text, e.quip.life / e.quip.max, e.boss);
    }
  }

  function drawStuffyAura(e) {
    const range = e.auraRange || 178;
    const pulse = 0.5 + Math.sin(state.time * 4) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.14 + pulse * 0.08;
    ctx.fillStyle = "#c4b49a";
    ctx.beginPath();
    ctx.arc(e.x, e.y, range, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "#e6d0a5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, range * (0.82 + pulse * 0.08), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawMouth(x, y, w, mood = "snarl") {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#251510";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    if (mood === "snarl") ctx.quadraticCurveTo(w * 0.5, 5, w, 0);
    else ctx.quadraticCurveTo(w * 0.5, -5, w, 0);
    ctx.stroke();
    ctx.fillStyle = "#f7f0dc";
    for (let i = 1; i <= 3; i++) {
      const tx = (w / 4) * i;
      ctx.beginPath();
      ctx.moveTo(tx - 3, 1);
      ctx.lineTo(tx, 7);
      ctx.lineTo(tx + 3, 1);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawXType(e) {
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#d98978";
    ctx.beginPath();
    ctx.ellipse(0, -2, e.r * 0.62, e.r * 1.28, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e8aa9b";
    ctx.beginPath();
    ctx.arc(0, -e.r * 0.92, e.r * 0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f4b5a3";
    ctx.beginPath();
    ctx.ellipse(-e.r * 0.18, -e.r * 0.14, e.r * 0.18, e.r * 0.52, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(90, 31, 31, 0.28)";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(Math.sin(e.wobble + i) * e.r * 0.34, -e.r * 0.38 + i * 7, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "#6e2630";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.18, -e.r * 0.65);
    ctx.quadraticCurveTo(0, -e.r * 0.55, e.r * 0.18, -e.r * 0.65);
    ctx.stroke();
    ctx.strokeStyle = "#5c171a";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.42, e.r * 0.08);
    ctx.lineTo(e.r * 0.42, e.r * 0.72);
    ctx.moveTo(e.r * 0.42, e.r * 0.08);
    ctx.lineTo(-e.r * 0.42, e.r * 0.72);
    ctx.stroke();
    ctx.fillStyle = "#f7f0dc";
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 4, e.r * 0.04);
      ctx.lineTo(i * 4 + 3, e.r * 0.18);
      ctx.lineTo(i * 4 - 3, e.r * 0.18);
      ctx.fill();
    }
    drawMouth(-e.r * 0.36, -e.r * 0.72, e.r * 0.72, "snarl");
    drawEyes(-5, -e.r * 1.02, 5, -e.r * 1.02, 2.4);
  }

  function drawDrunk(e) {
    ctx.strokeStyle = "rgba(0,0,0,0.44)";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#c985b7";
    ctx.beginPath();
    ctx.arc(-e.r * 0.45, 0, e.r * 0.82, 0, TAU);
    ctx.arc(e.r * 0.45, 0, e.r * 0.82, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.ellipse(-e.r * 0.68, -e.r * 0.23, e.r * 0.18, e.r * 0.26, -0.45, 0, TAU);
    ctx.ellipse(e.r * 0.2, -e.r * 0.28, e.r * 0.2, e.r * 0.24, -0.35, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(84, 35, 75, 0.36)";
    ctx.beginPath();
    ctx.arc(-e.r * 0.45, e.r * 0.05, e.r * 0.18, 0, TAU);
    ctx.arc(e.r * 0.45, e.r * 0.05, e.r * 0.18, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(68, 28, 63, 0.34)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-e.r * 0.45, 0, e.r * 0.58, 0.4, Math.PI * 1.15);
    ctx.arc(e.r * 0.45, 0, e.r * 0.58, Math.PI * 1.85, Math.PI * 0.6);
    ctx.stroke();
    ctx.fillStyle = "#d7f0ff";
    ctx.fillRect(-e.r * 0.38, -e.r * 1.28, e.r * 0.76, e.r * 0.42);
    ctx.fillStyle = "#f7c75d";
    ctx.beginPath();
    ctx.arc(0, -e.r * 0.4, e.r * 0.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#6b4224";
    ctx.beginPath();
    ctx.arc(0, e.r * 0.52, e.r * 0.12, 0, TAU);
    ctx.fill();
    drawMouth(-e.r * 0.36, e.r * 0.35, e.r * 0.72, "sad");
    drawEyes(-6, -e.r * 0.28, 6, -e.r * 0.24, 2.6);
  }

  function drawShade(e) {
    ctx.fillStyle = "rgba(88,197,139,0.86)";
    ctx.beginPath();
    ctx.moveTo(0, -e.r * 1.12);
    ctx.bezierCurveTo(e.r * 1.1, -e.r * 0.8, e.r * 0.95, e.r * 0.45, e.r * 0.25, e.r * 1.05);
    ctx.bezierCurveTo(e.r * 0.05, e.r * 0.62, -e.r * 0.18, e.r * 0.62, -e.r * 0.32, e.r * 1.05);
    ctx.bezierCurveTo(-e.r * 1.05, e.r * 0.45, -e.r * 1.0, -e.r * 0.8, 0, -e.r * 1.12);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.36)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "rgba(182,255,198,0.2)";
    ctx.beginPath();
    ctx.ellipse(-e.r * 0.2, -e.r * 0.12, e.r * 0.28, e.r * 0.78, -0.25, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(20,53,30,0.35)";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(Math.cos(e.wobble + i) * e.r * 0.48, -e.r * 0.18 + i * e.r * 0.18, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#14351e";
    ctx.beginPath();
    ctx.arc(-5, -4, 3, 0, TAU);
    ctx.arc(5, -4, 3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-e.r, e.r * 0.4);
    ctx.lineTo(e.r, e.r * 0.2);
    ctx.stroke();
    ctx.fillStyle = "#d8ffe0";
    ctx.beginPath();
    ctx.moveTo(-4, e.r * 0.18);
    ctx.lineTo(0, e.r * 0.33);
    ctx.lineTo(4, e.r * 0.18);
    ctx.fill();
    drawMouth(-e.r * 0.32, e.r * 0.42, e.r * 0.64, "snarl");
  }

  function drawKeg(e) {
    ctx.strokeStyle = "rgba(0,0,0,0.42)";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#bd8d4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r * 1.1, e.r * 0.92, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,235,178,0.18)";
    ctx.beginPath();
    ctx.ellipse(-e.r * 0.28, -e.r * 0.28, e.r * 0.42, e.r * 0.2, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 210, 126, 0.22)";
    ctx.beginPath();
    ctx.arc(-e.r * 0.42, -e.r * 0.05, e.r * 0.28, 0, TAU);
    ctx.arc(e.r * 0.42, -e.r * 0.05, e.r * 0.28, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#5d3921";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.72, -e.r * 0.34);
    ctx.bezierCurveTo(-e.r * 0.22, -e.r * 0.52, e.r * 0.18, -e.r * 0.52, e.r * 0.72, -e.r * 0.34);
    ctx.moveTo(-e.r * 0.78, e.r * 0.28);
    ctx.bezierCurveTo(-e.r * 0.22, e.r * 0.48, e.r * 0.22, e.r * 0.48, e.r * 0.78, e.r * 0.28);
    ctx.stroke();
    ctx.fillStyle = "#6b3b22";
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * e.r * 0.34, e.r * 0.52 + Math.sin(e.wobble + i) * 2, 2.4, 0, TAU);
      ctx.fill();
    }
    drawMouth(-e.r * 0.36, e.r * 0.13, e.r * 0.72, "sad");
    drawEyes(-6, -e.r * 0.42, 6, -e.r * 0.42, 2.6);
  }

  function drawBoss(e) {
    if (e.type === "bossStuffy") {
      ctx.fillStyle = e.color;
      roundedRect(-e.r * 0.42, -e.r * 1.55, e.r * 0.84, e.r * 3.1, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#5b4f42";
      ctx.beginPath();
      ctx.moveTo(0, -e.r * 1.34);
      ctx.lineTo(-e.r * 0.26, -e.r * 0.62);
      ctx.lineTo(0, -e.r * 0.18);
      ctx.lineTo(e.r * 0.26, -e.r * 0.62);
      ctx.fill();
      ctx.fillStyle = "#ebe0c8";
      ctx.beginPath();
      ctx.ellipse(0, -e.r * 1.78, e.r * 0.68, e.r * 0.78, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(100, 199, 255, 0.5)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(e.r * (0.55 + i * 0.13), -e.r * (1.86 - i * 0.18), 2.2, 4.4, 0.2, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = "#2d251f";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-4, -e.r * 1.83, 4, 0, TAU);
      ctx.arc(4, -e.r * 1.83, 4, 0, TAU);
      ctx.moveTo(0, -e.r * 1.83);
      ctx.lineTo(0, -e.r * 1.82);
      ctx.stroke();
      drawEyes(-4, -e.r * 1.83, 4, -e.r * 1.83, 1.6);
      drawMouth(-e.r * 0.28, -e.r * 1.58, e.r * 0.56, "sad");
      ctx.strokeStyle = "#4f4639";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.34, -e.r * 1.3);
      ctx.lineTo(-e.r * 1.1, -e.r * 0.15);
      ctx.moveTo(e.r * 0.34, -e.r * 1.3);
      ctx.lineTo(e.r * 1.1, -e.r * 0.15);
      ctx.stroke();
      ctx.strokeStyle = "rgba(246, 225, 180, 0.28)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.2, -e.r * 1.0 + i * e.r * 0.36);
        ctx.lineTo(e.r * 0.2, -e.r * 0.94 + i * e.r * 0.36);
        ctx.stroke();
      }
      return;
    }
    if (e.type === "bossDestroy") {
      drawDestroyBoss(e);
      return;
    }
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.r * 1.12, e.r, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.36)";
    ctx.lineWidth = 5;
    ctx.stroke();
    if (e.type === "bossX") {
      ctx.strokeStyle = "#5c171a";
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.45, -e.r * 0.45);
      ctx.lineTo(e.r * 0.45, e.r * 0.45);
      ctx.moveTo(e.r * 0.45, -e.r * 0.45);
      ctx.lineTo(-e.r * 0.45, e.r * 0.45);
      ctx.stroke();
    } else if (e.type === "bossShade") {
      ctx.strokeStyle = "rgba(180,255,215,0.48)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, e.r * (0.45 + i * 0.13), 0, TAU);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "#d7f0ff";
      ctx.fillRect(-e.r * 0.22, -e.r * 1.18, e.r * 0.44, e.r * 0.48);
      ctx.fillStyle = "#f7c75d";
      ctx.beginPath();
      ctx.arc(0, -e.r * 0.25, e.r * 0.18, 0, TAU);
      ctx.fill();
    }
    drawEyes(-14, -9, 14, -9, 5);
    ctx.strokeStyle = "#151510";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 8, e.r * 0.28, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  function drawDestroyBoss(e) {
    if (e.phase === 1) {
      ctx.fillStyle = "#2b1d18";
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 5, -e.r * 0.42 + Math.sin(e.wobble + i) * 3, 7, e.r * 0.98, 0.18 * i, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#e07058";
      roundedRect(-e.r * 0.44, -e.r * 0.35, e.r * 0.88, e.r * 1.22, 10);
      ctx.fill();
      ctx.fillStyle = "#812e2b";
      roundedRect(-e.r * 0.32, -e.r * 0.05, e.r * 0.64, e.r * 0.36, 5);
      ctx.fill();
      ctx.fillStyle = "#f0c6a0";
      ctx.beginPath();
      ctx.ellipse(0, -e.r * 0.82, e.r * 0.52, e.r * 0.58, 0, 0, TAU);
      ctx.fill();
      drawEyes(-7, -e.r * 0.86, 7, -e.r * 0.86, 3);
      drawMouth(-e.r * 0.24, -e.r * 0.64, e.r * 0.48, "snarl");
      ctx.strokeStyle = "#dce4e8";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-e.r * 0.46, -e.r * 0.04);
      ctx.lineTo(-e.r * 1.25, e.r * 0.78);
      ctx.moveTo(e.r * 0.46, -e.r * 0.04);
      ctx.lineTo(e.r * 1.25, e.r * 0.78);
      ctx.stroke();
      ctx.strokeStyle = "#7b8790";
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    ctx.fillStyle = "#2a2c2f";
    roundedRect(-e.r * 1.35, -e.r * 0.58, e.r * 2.7, e.r * 1.16, 10);
    ctx.fill();
    ctx.strokeStyle = "#101214";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#8fa3b0";
    roundedRect(-e.r * 0.72, -e.r * 0.94, e.r * 1.44, e.r * 0.68, 8);
    ctx.fill();
    ctx.fillStyle = "#f7c75d";
    ctx.beginPath();
    ctx.ellipse(-e.r * 1.22, -e.r * 0.22, e.r * 0.18, e.r * 0.12, 0, 0, TAU);
    ctx.ellipse(e.r * 1.22, -e.r * 0.22, e.r * 0.18, e.r * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#f0c6a0";
    ctx.beginPath();
    ctx.arc(0, -e.r * 0.66, e.r * 0.28, 0, TAU);
    ctx.fill();
    drawEyes(-5, -e.r * 0.69, 5, -e.r * 0.69, 2.2);
    drawMouth(-e.r * 0.18, -e.r * 0.5, e.r * 0.36, "snarl");
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-e.r * 0.82, e.r * 0.52, e.r * 0.28, 0, TAU);
    ctx.arc(e.r * 0.82, e.r * 0.52, e.r * 0.28, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#c8d1d3";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.05, -e.r * 0.1);
    ctx.lineTo(e.r * 1.05, -e.r * 0.1);
    ctx.stroke();
    ctx.fillStyle = "#2b1d18";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(-e.r + i * e.r * 0.5, -e.r * 1.08 + Math.sin(state.time * 5 + i) * 2, 4, 8, 0.4, 0, TAU);
      ctx.fill();
    }
  }

  function drawEyes(x1, y1, x2, y2, r = 3) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x1, y1, r, 0, TAU);
    ctx.arc(x2, y2, r, 0, TAU);
    ctx.fill();
  }

  function drawPlayer() {
    const p = state.player;
    if (!p) return;
    const walk = Math.sin(p.step) * 3;
    const bodyBob = Math.sin(p.step) * 1.2 - (p.shotPulse || 0) * 1.4;
    const breathe = Math.sin(state.time * 4.2) * 0.035;
    const shotKick = p.shotPulse || 0;
    const dashGlow = p.dashTime > 0;
    const dashStretch = dashGlow ? 0.14 : 0;
    const facing = p.aim.x < -0.15 ? -1 : 1;
    ctx.save();
    ctx.translate(p.x, p.y + bodyBob);
    if (p.invuln > 0 && Math.floor(state.time * 18) % 2 === 0) ctx.globalAlpha = 0.55;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 24 - bodyBob * 0.35, 25 + shotKick * 4 + dashStretch * 12, 7 - shotKick * 0.9, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = p.prideCharge >= 100 ? 0.92 : 0.42;
    ctx.strokeStyle = p.prideCharge >= 100 ? "#7be0ad" : "rgba(247, 240, 220, 0.35)";
    ctx.lineWidth = p.prideCharge >= 100 ? 4 : 3;
    ctx.beginPath();
    ctx.arc(0, 4, 29, -Math.PI / 2, -Math.PI / 2 + TAU * (p.prideCharge / 100));
    ctx.stroke();
    ctx.restore();

    ctx.scale(facing * (1 + breathe + dashStretch + shotKick * 0.08), 1 - breathe * 0.45 - dashStretch * 0.28 + shotKick * 0.04);
    ctx.rotate(p.aim.y * 0.035);
    if (p.traits.stinkAura) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 58 + p.traits.stinkAura * 14);
      aura.addColorStop(0, hasSynergy("rainbowStink") ? "rgba(255, 107, 138, 0.22)" : "rgba(196, 180, 154, 0.2)");
      aura.addColorStop(0.55, hasSynergy("rainbowStink") ? "rgba(123, 224, 173, 0.12)" : "rgba(196, 180, 154, 0.08)");
      aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 58 + p.traits.stinkAura * 14, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (dashGlow) {
      ctx.strokeStyle = "#64c7ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 3, 26, 0, TAU);
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const y = -10 + i * 8;
        ctx.strokeStyle = i % 2 ? "#7be0ad" : "#64c7ff";
        ctx.beginPath();
        ctx.moveTo(-25 - i * 4, y);
        ctx.lineTo(-47 - i * 8, y + Math.sin(state.time * 18 + i) * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.strokeStyle = "#8e6417";
    ctx.lineWidth = 3;
    ctx.fillStyle = "#f4bd3d";
    ctx.beginPath();
    ctx.ellipse(-2, 6, 21, 17, -0.12, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(112, 71, 16, 0.38)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-6 + i * 5, 4 + Math.sin(p.step + i) * 1.2, 10 - i, -0.25, 1.05);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffd75f";
    ctx.beginPath();
    ctx.moveTo(-19, 4);
    ctx.lineTo(-31, -3);
    ctx.lineTo(-24, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#9b701f";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#d99623";
    ctx.beginPath();
    ctx.ellipse(-7, 5, 10, 12, -0.25, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(105, 70, 16, 0.36)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(-10, 0, 6, 0.2, 2.5);
    ctx.stroke();

    ctx.fillStyle = "#202322";
    roundedRect(-17, 3, 34, 24, 7);
    ctx.fill();
    ctx.strokeStyle = "#0b0c0c";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(230, 240, 238, 0.18)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-15 + i * 8, 4);
      ctx.lineTo(-20 + i * 9, 23);
      ctx.stroke();
    }
    ctx.fillStyle = "#111414";
    ctx.beginPath();
    ctx.moveTo(-13, 5);
    ctx.lineTo(-4, 19);
    ctx.lineTo(5, 5);
    ctx.lineTo(14, 19);
    ctx.lineTo(17, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#efc1a7";
    ctx.beginPath();
    ctx.ellipse(6, -15, 15, 17, 0.02, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#6c4a37";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(120, 108, 96, 0.42)";
    ctx.beginPath();
    ctx.ellipse(6, -28, 13, 4.2, 0, Math.PI, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(60, 54, 48, 0.5)";
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(6 + i * 2, -29);
      ctx.lineTo(6 + i * 2.1, -25.5 + Math.abs(i) * 0.2);
      ctx.stroke();
    }

    ctx.fillStyle = "#ff9f3f";
    ctx.beginPath();
    ctx.ellipse(22, -10, 8, 3.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#b75f14";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, -10);
    ctx.lineTo(29, -10);
    ctx.stroke();

    ctx.strokeStyle = "#171717";
    ctx.lineWidth = 1.9;
    roundedRect(-6, -21, 11, 8, 2);
    ctx.stroke();
    roundedRect(8, -21, 11, 8, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, -17);
    ctx.lineTo(8, -17);
    ctx.moveTo(-6, -18);
    ctx.lineTo(-12, -17);
    ctx.moveTo(19, -18);
    ctx.lineTo(24, -17);
    ctx.stroke();

    if (p.blinking > 0) {
      ctx.strokeStyle = "#171717";
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-3.2, -17);
      ctx.lineTo(1.8, -16.8);
      ctx.moveTo(11, -16.8);
      ctx.lineTo(16, -17);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#55616d";
      ctx.beginPath();
      ctx.arc(-1, -17, 2.1, 0, TAU);
      ctx.arc(13, -17, 2.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(-0.5, -16.8, 1.1, 0, TAU);
      ctx.arc(13.5, -16.8, 1.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0.2, -17.6, 0.45, 0, TAU);
      ctx.arc(14.2, -17.6, 0.45, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = "#2a1d17";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, -23);
    ctx.lineTo(3, -22);
    ctx.moveTo(9, -22);
    ctx.lineTo(19, -23);
    ctx.stroke();

    ctx.strokeStyle = "rgba(95, 55, 42, 0.65)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(6, -15);
    ctx.quadraticCurveTo(4.5, -11, 6.5, -8);
    ctx.stroke();

    ctx.strokeStyle = "#6b2f35";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(1, -4);
    ctx.quadraticCurveTo(7, -2.5, 13, -4);
    ctx.stroke();
    ctx.fillStyle = "rgba(48, 34, 28, 0.44)";
    for (let i = 0; i < 18; i++) {
      const sx = -3 + (i % 6) * 3.2;
      const sy = -5 + Math.floor(i / 6) * 3.2;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.55, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(210, 110, 40, 0.22)";
    ctx.beginPath();
    ctx.arc(-3, -10, 2.2, 0, TAU);
    ctx.arc(15, -10, 1.8, 0, TAU);
    ctx.fill();

    const scarfColors = ["#ff5d73", "#f7c75d", "#7be0ad", "#64c7ff"];
    for (let i = 0; i < scarfColors.length; i++) {
      ctx.fillStyle = scarfColors[i];
      roundedRect(-4 + i * 4, -3, 5, 8, 2);
      ctx.fill();
    }
    ctx.fillStyle = "#64c7ff";
    ctx.beginPath();
    ctx.moveTo(8, 3);
    ctx.lineTo(20, 11);
    ctx.lineTo(8, 12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#c96b18";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-10, 18);
    ctx.lineTo(-16, 25 + walk);
    ctx.lineTo(-7, 24 + walk);
    ctx.moveTo(6, 18);
    ctx.lineTo(13, 25 - walk);
    ctx.lineTo(4, 24 - walk);
    ctx.stroke();
    ctx.restore();

    if (p.traits.companion) drawCompanion();
  }

  function drawCompanion() {
    const p = state.player;
    const a = state.time * 3.2;
    const x = p.x + Math.cos(a) * 30;
    const y = p.y + Math.sin(a) * 22;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.64, 0.64);
    ctx.fillStyle = "#f7d66d";
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ff9f3f";
    ctx.beginPath();
    ctx.ellipse(13, -2, 9, 4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#141414";
    ctx.beginPath();
    ctx.arc(3, -6, 2.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      if (p.comic) {
        const progress = 1 - p.life / p.max;
        const pop = 1 + Math.sin(progress * Math.PI) * 0.35;
        ctx.translate(p.x, p.y);
        ctx.scale(p.size * pop, p.size * pop);
        ctx.rotate(Math.sin(p.life * 8) * 0.08);
        ctx.font = "1000 20px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = ctx.measureText(p.text).width + 20;
        ctx.fillStyle = "rgba(255, 252, 228, 0.94)";
        roundedRect(-w / 2, -16, w, 30, 7);
        ctx.fill();
        ctx.strokeStyle = "#151510";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "#151510";
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, 0, -1);
        ctx.fillText(p.text, 0, -1);
      } else if (p.lightning) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const mx = (p.x + p.x2) / 2 + rand(-8, 8);
        const my = (p.y + p.y2) / 2 + rand(-8, 8);
        ctx.lineTo(mx, my);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawMessages() {
    const mobile = state.w <= 680 || state.h > state.w * 1.2;
    const maxWidth = mobile ? state.w - 28 : Math.min(580, state.w - 96);
    const x = mobile ? 14 : 48;
    let y = mobile ? Math.max(94, state.h * 0.17) : state.h - 88;
    const shown = state.messages.slice(mobile ? -2 : -3);
    ctx.save();
    ctx.font = mobile ? "800 13px system-ui" : "700 14px system-ui";
    ctx.textBaseline = "top";
    for (let i = shown.length - 1; i >= 0; i--) {
      const m = shown[i];
      const lines = wrapText(m.text, maxWidth - 18, mobile ? 3 : 2);
      const lineHeight = mobile ? 17 : 18;
      const boxHeight = lines.length * lineHeight + 14;
      const alpha = clamp(Math.min(m.life, m.max - m.life + 0.45), 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      roundedRect(x + 4, y + 5, maxWidth, boxHeight, 7);
      ctx.fill();
      ctx.fillStyle = mobile ? "rgba(255, 249, 219, 0.93)" : "rgba(18,19,18,0.78)";
      roundedRect(x, y, maxWidth, boxHeight, 7);
      ctx.fill();
      ctx.strokeStyle = mobile ? "#151510" : m.color;
      ctx.lineWidth = mobile ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = mobile ? "#151510" : m.color;
      lines.forEach((line, index) => ctx.fillText(line, x + 9, y + 7 + index * lineHeight));
      if (mobile) {
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.moveTo(x + maxWidth - 34, y);
        ctx.lineTo(x + maxWidth - 10, y);
        ctx.lineTo(x + maxWidth - 22, y + 12);
        ctx.fill();
      }
      if (mobile) y += boxHeight + 7;
      else y -= boxHeight + 7;
    }
    ctx.restore();
  }

  function wrapText(text, maxWidth, maxLines = 3) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) {
        line = test;
      } else {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (words.length && lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
      const last = lines[lines.length - 1];
      let trimmed = last;
      while (trimmed.length > 4 && ctx.measureText(`${trimmed}...`).width > maxWidth) trimmed = trimmed.slice(0, -1);
      lines[lines.length - 1] = `${trimmed.trim()}...`;
    }
    return lines;
  }

  function drawBossIntro() {
    const intro = state.bossIntro;
    if (!intro) return;

    ctx.save();
    const topX = state.w * 0.5;
    const topY = 72;
    ctx.globalAlpha = clamp(1 - intro.time / 5, 0.18, 0.72);
    ctx.fillStyle = "rgba(205, 245, 255, 0.13)";
    ctx.beginPath();
    ctx.arc(topX, topY, 130 + Math.sin(state.time * 2) * 8, 0, TAU);
    ctx.fill();

    if (intro.stage >= 1) {
      const pulse = Math.sin(state.time * 18) * 4;
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "#f7f0dc";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(topX - 32, 66 + pulse);
      ctx.lineTo(topX + 32, 66 - pulse);
      ctx.stroke();
    }

    if (intro.stage >= 2) {
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = "#c4b49a";
      ctx.beginPath();
      ctx.arc(topX, topY + 18, 42 + Math.sin(state.time * 8) * 4, 0, TAU);
      ctx.fill();
    }

    const introText = intro.stage < 1 ? "Слишком свежо. Подозрительно." : intro.stage < 3 ? "Кто-то стучит сверху." : "Духота входит.";
    const introW = Math.min(390, state.w - 28);
    ctx.font = "900 14px system-ui";
    const introLines = wrapText(introText, introW - 24, 2);
    const introH = introLines.length * 17 + 14;
    const introX = state.w * 0.5 - introW * 0.5;
    const introY = 90;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(5, 10, 11, 0.58)";
    roundedRect(introX, introY, introW, introH, 7);
    ctx.fill();
    ctx.strokeStyle = intro.stage < 2 ? "rgba(219,239,255,0.3)" : "rgba(247,216,168,0.32)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = intro.stage < 2 ? "#dbefff" : "#f7d8a8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    introLines.forEach((line, index) => ctx.fillText(line, state.w * 0.5, introY + 16 + index * 17));
    ctx.restore();
  }

  function drawBossHud() {
    if (state.bossIntro) {
      bossWrap.classList.add("hidden");
      return;
    }
    const boss = state.enemies.find((e) => e.boss);
    if (!boss) {
      bossWrap.classList.add("hidden");
      return;
    }
    bossWrap.classList.remove("hidden");
    bossName.textContent = boss.name;
    bossBar.style.width = `${clamp((boss.hp / boss.maxHp) * 100, 0, 100)}%`;
  }

  function drawScreenFx() {
    const player = state.player;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const cx = player ? player.x : state.w * 0.5;
    const cy = player ? player.y : state.h * 0.5;
    const light = ctx.createRadialGradient(cx, cy, 18, cx, cy, Math.max(state.w, state.h) * 0.62);
    light.addColorStop(0, state.bossIntro ? "rgba(150, 230, 255, 0.16)" : "rgba(255, 215, 126, 0.13)");
    light.addColorStop(0.45, "rgba(247, 199, 93, 0.045)");
    light.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, state.w, state.h);
    ctx.globalCompositeOperation = "source-over";

    const vignette = ctx.createRadialGradient(state.w * 0.5, state.h * 0.5, Math.min(state.w, state.h) * 0.24, state.w * 0.5, state.h * 0.5, Math.max(state.w, state.h) * 0.68);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, state.w, state.h);
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = "rgba(247, 240, 220, 0.5)";
    const dotStep = 12;
    const phase = Math.floor(state.time * 8) % dotStep;
    for (let y = phase; y < state.h; y += dotStep) {
      for (let x = (y / dotStep) % 2 ? 0 : 6; x < state.w; x += dotStep) {
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#151510";
    ctx.lineWidth = 2;
    for (let y = 66; y < state.h - 30; y += 108) {
      ctx.beginPath();
      ctx.moveTo(34, y);
      ctx.lineTo(state.w - 34, y + 18);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpeechBubble(x, y, text, lifeRatio = 1, boss = false) {
    const mobile = state.w <= 680 || state.h > state.w * 1.2;
    if (mobile && !boss) return;
    ctx.save();
    const fontSize = boss ? (mobile ? 11 : 12) : 10;
    ctx.font = `900 ${fontSize}px system-ui`;
    const maxWidth = boss ? Math.min(mobile ? state.w - 24 : 260, state.w - 20) : 118;
    const lines = wrapText(text, maxWidth - 20, boss ? 3 : 1);
    const lineHeight = boss ? fontSize + 5 : 13;
    const w = Math.max(54, Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 18));
    const h = lines.length * lineHeight + 13;
    const float = Math.sin(state.time * (boss ? 5 : 7) + x * 0.03) * (boss ? 2 : 1.4);
    const bx = clamp(x - w * 0.5, 10, state.w - w - 10);
    const by = clamp(y - h + float, 72, state.h - h - 36);
    ctx.globalAlpha = clamp(lifeRatio * 1.6, 0, 1);
    ctx.fillStyle = boss ? "rgba(247, 240, 220, 0.96)" : "rgba(255, 252, 228, 0.94)";
    ctx.strokeStyle = boss ? "#151510" : "#1f1710";
    ctx.lineWidth = boss ? 4 : 3;
    roundedRect(bx, by, w, h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(clamp(x, bx + 18, bx + w - 18), by + h - 1);
    ctx.lineTo(clamp(x - 9, bx + 8, bx + w - 8), by + h + 10);
    ctx.lineTo(clamp(x + 7, bx + 8, bx + w - 8), by + h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = boss ? "#3c3327" : "#2b1d18";
    lines.forEach((line, index) => ctx.fillText(line, bx + 9, by + 7 + index * lineHeight));
    ctx.restore();
  }

  function drawWallBolts(coolIntro) {
    ctx.save();
    ctx.fillStyle = coolIntro ? "rgba(200, 240, 250, 0.18)" : "rgba(247, 199, 93, 0.16)";
    const top = 64;
    const bottom = state.h - 28;
    for (let x = 58; x < state.w - 58; x += 58) {
      ctx.beginPath();
      ctx.arc(x, top + 9, 2, 0, TAU);
      ctx.arc(x + 14, bottom - 9, 2, 0, TAU);
      ctx.fill();
    }
    for (let y = 88; y < state.h - 54; y += 58) {
      ctx.beginPath();
      ctx.arc(25, y, 2, 0, TAU);
      ctx.arc(state.w - 25, y + 14, 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNails(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(247, 240, 220, 0.18)";
    for (const [nx, ny] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.beginPath();
      ctx.arc(nx, ny, 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBlobShadow(x, y, rx, ry, alpha = 0.28) {
    ctx.save();
    const s = ctx.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
    s.addColorStop(0, `rgba(0,0,0,${alpha})`);
    s.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawSpriteHighlight(x, y, rx, ry, alpha = 0.24) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function loop() {
    const t = now();
    const dt = clamp(t - state.last, 0, 0.033);
    state.last = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function setupInput() {
    const blockTouch = (e) => e.preventDefault();
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("selectstart", (e) => e.preventDefault());
    document.addEventListener("dragstart", (e) => e.preventDefault());
    document.addEventListener("gesturestart", blockTouch, { passive: false });
    document.addEventListener("touchmove", blockTouch, { passive: false });
    document.addEventListener("touchstart", (e) => {
      if (e.target?.closest?.("#mobile-controls, #game")) e.preventDefault();
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
      state.input.keys.add(e.code);
      if (e.code === "Space" && !state.running) resetGame();
      else if (e.code === "Space") startPrideDash();
    });
    window.addEventListener("keyup", (e) => state.input.keys.delete(e.code));
    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      state.input.mouse.x = e.clientX - rect.left;
      state.input.mouse.y = e.clientY - rect.top;
      state.input.mouse.seen = true;
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      state.input.mouse.down = true;
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      state.input.mouse.x = e.clientX - rect.left;
      state.input.mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") return;
      state.input.mouse.down = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // The pointer can already be released by the browser.
      }
    });
    canvas.addEventListener("pointercancel", () => {
      state.input.mouse.down = false;
    });

    setupStick("move-zone", "move-knob", state.input.move);
    setupStick("shoot-zone", "shoot-knob", state.input.shoot);
    document.getElementById("dash-button")?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startPrideDash();
    });
  }

  function setupStick(zoneId, knobId, target) {
    const zone = document.getElementById(zoneId);
    const knob = document.getElementById(knobId);
    let pointerId = null;
    const reset = () => {
      pointerId = null;
      target.x = 0;
      target.y = 0;
      knob.style.transform = "translate(-50%, -50%)";
    };
    const move = (e) => {
      if (pointerId !== e.pointerId) return;
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width * 0.34;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      target.x = dx / max;
      target.y = dy / max;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      e.preventDefault();
    };
    zone.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pointerId = e.pointerId;
      zone.setPointerCapture(pointerId);
      move(e);
    });
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", (e) => {
      e.preventDefault();
      reset();
    });
    zone.addEventListener("pointercancel", (e) => {
      e.preventDefault();
      reset();
    });
    zone.addEventListener("lostpointercapture", reset);
  }

  startButton.addEventListener("click", resetGame);
  window.addEventListener("resize", resize);
  resize();
  setupInput();
  updateHud();
  loop();
})();
