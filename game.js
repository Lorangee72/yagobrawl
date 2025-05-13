// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// Конфигурация игры
const config = {
    width: 800,
    height: 600,
    playerSpeed: 3,
    botSpeed: 2,
    bulletSpeed: 7,
    meleeRange: 50,
    shotgunSpread: Math.PI / 6,
    playerSize: 30,
    bulletSize: 8,
    spawnProtectionTime: 2000,
    gameDuration: 120000, // 2 минуты
    colors: {
        shotgun: '#FF5555',
        pistol: '#5555FF',
        melee: '#55FF55',
        player: '#FFFF00'
    }
};

// Элементы DOM
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const healthUI = document.getElementById('health');
const killsUI = document.getElementById('kills');
const timeUI = document.getElementById('time');
const aliveUI = document.getElementById('alive');
const brawlerSelection = document.getElementById('brawler-selection');
const gameOverScreen = document.getElementById('game-over');
const resultTitle = document.getElementById('result-title');
const resultText = document.getElementById('result-text');
const joystick = document.getElementById('joystick');
const joystickInner = document.getElementById('joystick-inner');
const shootBtn = document.getElementById('shoot-btn');

// Состояние игры
let gameRunning = false;
let player;
let bots = [];
let bullets = [];
let particles = [];
let lastTime = 0;
let gameStartTime = 0;
let selectedBrawler = 1;
let spawnProtection = false;
let spawnProtectionEndTime = 0;
let playerPlace = 0;
let isMobile = false;

// Управление
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    w: false,
    a: false,
    s: false,
    d: false
};

const touch = {
    active: false,
    startX: 0,
    startY: 0,
    moveX: 0,
    moveY: 0,
    shooting: false
};

// Инициализация игры
function initGame() {
    // Установка размеров canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Проверка мобильного устройства
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        joystick.style.display = 'block';
        shootBtn.style.display = 'block';
        setupTouchControls();
    } else {
        setupKeyboardControls();
    }
    
    // Показать выбор бойца
    brawlerSelection.style.display = 'flex';
}

// Выбор бойца
function selectBrawler(brawlerId) {
    selectedBrawler = brawlerId;
    document.querySelectorAll('.brawler-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
}

// Начать игру
function startGame() {
    brawlerSelection.style.display = 'none';
    gameOverScreen.style.display = 'none';
    
    // Создание игрока
    player = {
        x: config.width / 2,
        y: config.height / 2,
        size: config.playerSize,
        speed: config.playerSpeed,
        health: 100,
        maxHealth: 100,
        brawlerType: selectedBrawler,
        lastShot: 0,
        shotDelay: selectedBrawler === 3 ? 500 : 1000,
        color: config.colors[selectedBrawler === 1 ? 'shotgun' : selectedBrawler === 2 ? 'pistol' : 'melee'],
        isPlayer: true,
        isDead: false,
        kills: 0,
        damageDealt: 0
    };
    
    // Создание ботов
    bots = createBots();
    
    // Сброс состояния
    bullets = [];
    particles = [];
    gameRunning = true;
    gameStartTime = Date.now();
    spawnProtection = true;
    spawnProtectionEndTime = Date.now() + config.spawnProtectionTime;
    
    // Запуск игрового цикла
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// Создание ботов
function createBots() {
    const botCount = 9;
    const bots = [];
    
    for (let i = 0; i < botCount; i++) {
        let x, y;
        do {
            x = Math.random() * (config.width - 100) + 50;
            y = Math.random() * (config.height - 100) + 50;
        } while (Math.abs(x - config.width/2) < 100 && Math.abs(y - config.height/2) < 100);
        
        const brawlerType = Math.floor(Math.random() * 3) + 1;
        
        bots.push({
            x: x,
            y: y,
            size: config.playerSize,
            speed: config.botSpeed,
            health: 100,
            maxHealth: 100,
            brawlerType: brawlerType,
            lastShot: 0,
            shotDelay: brawlerType === 3 ? 500 : 1000,
            color: config.colors[brawlerType === 1 ? 'shotgun' : brawlerType === 2 ? 'pistol' : 'melee'],
            targetX: x,
            targetY: y,
            targetChangeTime: 0,
            isPlayer: false,
            isDead: false,
            kills: 0,
            damageDealt: 0
        });
    }
    
    return bots;
}

// Игровой цикл
function gameLoop(timestamp) {
    if (!gameRunning) return;
    
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    update(deltaTime);
    render();
    
    // Проверка окончания игры
    const elapsedTime = Date.now() - gameStartTime;
    if (player.isDead || elapsedTime >= config.gameDuration) {
        endGame();
        return;
    }
    
    requestAnimationFrame(gameLoop);
}

// Обновление состояния игры
function update(deltaTime) {
    // Обновление игрока
    if (!player.isDead) {
        updatePlayer(deltaTime);
        
        // Проверка защиты при спавне
        if (spawnProtection && Date.now() > spawnProtectionEndTime) {
            spawnProtection = false;
        }
    }
    
    // Обновление ботов
    bots.forEach(bot => {
        if (!bot.isDead) {
            updateBot(bot, deltaTime);
        }
    });
    
    // Обновление пуль
    bullets.forEach((bullet, index) => {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        
        // Проверка столкновений
        checkBulletCollisions(bullet, index);
        
        // Удаление пуль за пределами экрана
        if (bullet.x < 0 || bullet.x > config.width || 
            bullet.y < 0 || bullet.y > config.height) {
            bullets.splice(index, 1);
        }
    });
    
    // Обновление частиц
    particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.lifetime -= deltaTime;
        
        if (particle.lifetime <= 0) {
            particles.splice(index, 1);
        }
    });
    
    // Удаление мертвых ботов
    bots = bots.filter(bot => !bot.isDead);
    
    // Проверка победы
    if (bots.length === 0 && !player.isDead) {
        playerPlace = 1;
        endGame();
    }
    
    // Обновление UI
    updateUI();
}

// Обновление игрока
function updatePlayer(deltaTime) {
    let dx = 0, dy = 0;
    
    if (isMobile) {
        // Управление джойстиком
        if (touch.active) {
            const dist = Math.sqrt(Math.pow(touch.moveX - touch.startX, 2) + 
                                 Math.pow(touch.moveY - touch.startY, 2));
            const maxDist = 40;
            
            if (dist > 5) {
                const angle = Math.atan2(touch.moveY - touch.startY, touch.moveX - touch.startX);
                const moveDist = Math.min(dist, maxDist);
                
                dx = Math.cos(angle) * moveDist / maxDist;
                dy = Math.sin(angle) * moveDist / maxDist;
                
                // Обновление позиции джойстика
                joystickInner.style.transform = `translate(${dx * 30}px, ${dy * 30}px)`;
            }
        }
    } else {
        // Клавиатурное управление
        if (keys.ArrowUp || keys.w) dy -= 1;
        if (keys.ArrowDown || keys.s) dy += 1;
        if (keys.ArrowLeft || keys.a) dx -= 1;
        if (keys.ArrowRight || keys.d) dx += 1;
        
        // Нормализация диагонального движения
        if (dx !== 0 && dy !== 0) {
            const invSqrt = 1 / Math.sqrt(dx*dx + dy*dy);
            dx *= invSqrt;
            dy *= invSqrt;
        }
    }
    
    // Применение движения
    player.x += dx * player.speed;
    player.y += dy * player.speed;
    
    // Границы экрана
    player.x = Math.max(player.size, Math.min(config.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(config.height - player.size, player.y));
    
    // Стрельба
    if ((!isMobile && mouse.click) || (isMobile && touch.shooting)) {
        if (Date.now() - player.lastShot > player.shotDelay) {
            player.lastShot = Date.now();
            shoot(player);
        }
    }
}

// Стрельба
function shoot(shooter) {
    if (shooter.brawlerType === 3) {
        // Ближний бой
        const targets = [...bots].filter(bot => !bot.isDead);
        targets.forEach(target => {
            const dist = Math.sqrt((target.x - shooter.x)**2 + (target.y - shooter.y)**2);
            if (dist < config.meleeRange) {
                target.health -= 25;
                shooter.damageDealt += 25;
                createParticles(target.x, target.y, target.color);
                
                if (target.health <= 0) {
                    target.isDead = true;
                    shooter.kills++;
                    
                    if (shooter.isPlayer) {
                        player.kills++;
                    }
                }
            }
        });
    } else {
        // Дальний бой
        let angle;
        
        if (isMobile) {
            // Стрельба в направлении от игрока к центру экрана
            angle = Math.atan2(config.height/2 - shooter.y, config.width/2 - shooter.x);
        } else {
            // Стрельба в направлении курсора
            angle = Math.atan2(mouse.y - shooter.y, mouse.x - shooter.x);
        }
        
        if (shooter.brawlerType === 1) {
            // Дробовик - 3 пули с разбросом
            for (let i = -1; i <= 1; i++) {
                const bulletAngle = angle + i * config.shotgunSpread;
                createBullet(shooter, bulletAngle);
            }
        } else {
            // Пистолет - 1 пуля
            createBullet(shooter, angle);
        }
    }
    
    createParticles(shooter.x, shooter.y, shooter.color);
}

// Создание пули
function createBullet(shooter, angle) {
    bullets.push({
        x: shooter.x,
        y: shooter.y,
        vx: Math.cos(angle) * config.bulletSpeed,
        vy: Math.sin(angle) * config.bulletSpeed,
        size: config.bulletSize,
        shooter: shooter,
        damage: shooter.brawlerType === 1 ? 15 : 20
    });
}

// Проверка столкновений пуль
function checkBulletCollisions(bullet, bulletIndex) {
    // Столкновение с игроком
    if (!bullet.shooter.isPlayer && !player.isDead && !spawnProtection) {
        const dist = Math.sqrt((bullet.x - player.x)**2 + (bullet.y - player.y)**2);
        if (dist < player.size + bullet.size) {
            player.health -= bullet.damage;
            bullet.shooter.damageDealt += bullet.damage;
            createParticles(player.x, player.y, player.color);
            
            if (player.health <= 0) {
                player.isDead = true;
                bullet.shooter.kills++;
                playerPlace = bots.filter(b => !b.isDead).length + 1;
            }
            
            bullets.splice(bulletIndex, 1);
            return;
        }
    }
    
    // Столкновение с ботами
    bots.forEach((bot, botIndex) => {
        if (!bot.isDead && bullet.shooter !== bot) {
            const dist = Math.sqrt((bullet.x - bot.x)**2 + (bullet.y - bot.y)**2);
            if (dist < bot.size + bullet.size) {
                bot.health -= bullet.damage;
                bullet.shooter.damageDealt += bullet.damage;
                createParticles(bot.x, bot.y, bot.color);
                
                if (bot.health <= 0) {
                    bot.isDead = true;
                    bullet.shooter.kills++;
                    
                    if (bullet.shooter.isPlayer) {
                        player.kills++;
                    }
                }
                
                bullets.splice(bulletIndex, 1);
            }
        }
    });
}

// Обновление ботов (ИИ)
function updateBot(bot, deltaTime) {
    // Смена цели
    if (Date.now() > bot.targetChangeTime) {
        bot.targetX = Math.random() * config.width;
        bot.targetY = Math.random() * config.height;
        bot.targetChangeTime = Date.now() + 2000 + Math.random() * 3000;
    }
    
    // Движение к цели
    const dx = bot.targetX - bot.x;
    const dy = bot.targetY - bot.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist > 10) {
        bot.x += (dx / dist) * bot.speed;
        bot.y += (dy / dist) * bot.speed;
    }
    
    // Границы экрана
    bot.x = Math.max(bot.size, Math.min(config.width - bot.size, bot.x));
    bot.y = Math.max(bot.size, Math.min(config.height - bot.size, bot.y));
    
    // Поиск ближайшего врага
    let nearestEnemy = null;
    let minDist = Infinity;
    
    if (!player.isDead) {
        const distToPlayer = Math.sqrt((player.x - bot.x)**2 + (player.y - bot.y)**2);
        if (distToPlayer < minDist) {
            minDist = distToPlayer;
            nearestEnemy = player;
        }
    }
    
    bots.forEach(otherBot => {
        if (otherBot !== bot && !otherBot.isDead) {
            const distToBot = Math.sqrt((otherBot.x - bot.x)**2 + (otherBot.y - bot.y)**2);
            if (distToBot < minDist) {
                minDist = distToBot;
                nearestEnemy = otherBot;
            }
        }
    });
    
    // Атака
    if (nearestEnemy && Date.now() - bot.lastShot > bot.shotDelay) {
        bot.lastShot = Date.now();
        
        if (bot.brawlerType === 3) {
            // Ближний бой
            if (minDist < config.meleeRange) {
                nearestEnemy.health -= 25;
                bot.damageDealt += 25;
                createParticles(nearestEnemy.x, nearestEnemy.y, nearestEnemy.color);
                
                if (nearestEnemy.health <= 0) {
                    nearestEnemy.isDead = true;
                    bot.kills++;
                    
                    if (nearestEnemy.isPlayer) {
                        playerPlace = bots.filter(b => !b.isDead).length + 1;
                    }
                }
            }
        } else {
            // Дальний бой
            const angle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
            
            if (bot.brawlerType === 1) {
                // Дробовик
                for (let i = -1; i <= 1; i++) {
                    createBullet(bot, angle + i * config.shotgunSpread);
                }
            } else {
                // Пистолет
                createBullet(bot, angle);
            }
        }
    }
}

// Создание частиц эффектов
function createParticles(x, y, color) {
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x,
            y: y,
            vx: Math.random() * 4 - 2,
            vy: Math.random() * 4 - 2,
            size: Math.random() * 3 + 2,
            color: color,
            lifetime: 500 + Math.random() * 500
        });
    }
}

// Отрисовка игры
function render() {
    // Очистка экрана
    ctx.clearRect(0, 0, config.width, config.height);
    
    // Фоновый узор
    drawBackground();
    
    // Отрисовка пуль
    bullets.forEach(bullet => {
        ctx.fillStyle = bullet.shooter.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Отрисовка частиц
    particles.forEach(particle => {
        ctx.globalAlpha = particle.lifetime / 1000;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    
    // Отрисовка ботов
    bots.forEach(bot => {
        if (!bot.isDead) {
            drawCharacter(bot);
        }
    });
    
    // Отрисовка игрока
    if (!player.isDead) {
        if (spawnProtection) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.size + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        drawCharacter(player);
        
        // Отрисовка прицела для дальнобойных персонажей
        if (player.brawlerType !== 3 && !isMobile) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
        }
    }
}

// Отрисовка персонажа
function drawCharacter(character) {
    // Тело
    ctx.fillStyle = character.color;
    ctx.beginPath();
    ctx.arc(character.x, character.y, character.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Полоска здоровья
    const healthWidth = (character.size * 2) * (character.health / character.maxHealth);
    ctx.fillStyle = 'red';
    ctx.fillRect(character.x - character.size, character.y - character.size - 10, character.size * 2, 5);
    ctx.fillStyle = 'green';
    ctx.fillRect(character.x - character.size, character.y - character.size - 10, healthWidth, 5);
}

// Отрисовка фона
function drawBackground() {
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    
    // Сетка
    for (let x = 0; x < config.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, config.height);
        ctx.stroke();
    }
    
    for (let y = 0; y < config.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(config.width, y);
        ctx.stroke();
    }
}

// Обновление UI
function updateUI() {
    healthUI.textContent = player.health;
    killsUI.textContent = player.kills;
    
    const elapsed = Date.now() - gameStartTime;
    const remaining = Math.max(0, config.gameDuration - elapsed);
    const seconds = Math.floor(remaining / 1000);
    timeUI.textContent = seconds;
    
    const aliveCount = bots.filter(b => !b.isDead).length + (player.isDead ? 0 : 1);
    aliveUI.textContent = `${aliveCount}/10`;
}

// Окончание игры
function endGame() {
    gameRunning = false;
    
    // Определение места
    if (!playerPlace) {
        playerPlace = bots.filter(b => !b.isDead).length + 1;
    }
    
    // Показ экрана результатов
    resultTitle.textContent = player.isDead ? "Вы проиграли!" : "Победа!";
    resultText.textContent = `Вы заняли ${playerPlace} место из 10`;
    gameOverScreen.style.display = 'flex';
    
    // Отправка результатов в бота
    const score = {
        type: 'battle_result',
        brawler_id: selectedBrawler,
        place: playerPlace,
        kills: player.kills,
        damage: player.damageDealt,
        survival_time: Date.now() - gameStartTime
    };
    
    tg.sendData(JSON.stringify(score));
}

// Перезапуск игры
function restartGame() {
    startGame();
}

// Управление с клавиатуры
function setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.key)) {
            keys[e.key] = true;
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.key)) {
            keys[e.key] = false;
        }
    });
    
    // Управление мышью
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    
    canvas.addEventListener('mousedown', () => {
        mouse.click = true;
    });
    
    canvas.addEventListener('mouseup', () => {
        mouse.click = false;
    });
}

// Сенсорное управление
function setupTouchControls() {
    // Джойстик
    joystick.addEventListener('touchstart', handleTouchStart);
    joystick.addEventListener('touchmove', handleTouchMove);
    joystick.addEventListener('touchend', handleTouchEnd);
    
    // Кнопка стрельбы
    shootBtn.addEventListener('touchstart', () => {
        touch.shooting = true;
    });
    
    shootBtn.addEventListener('touchend', () => {
        touch.shooting = false;
    });
}

function handleTouchStart(e) {
    const rect = joystick.getBoundingClientRect();
    touch.startX = rect.left + rect.width / 2;
    touch.startY = rect.top + rect.height / 2;
    touch.moveX = e.touches[0].clientX;
    touch.moveY = e.touches[0].clientY;
    touch.active = true;
    e.preventDefault();
}

function handleTouchMove(e) {
    if (touch.active) {
        touch.moveX = e.touches[0].clientX;
        touch.moveY = e.touches[0].clientY;
        e.preventDefault();
    }
}

function handleTouchEnd() {
    touch.active = false;
    joystickInner.style.transform = 'translate(0, 0)';
}

// Изменение размера canvas
function resizeCanvas() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Сохраняем пропорции игры
    const gameRatio = config.width / config.height;
    const windowRatio = windowWidth / windowHeight;
    
    if (windowRatio > gameRatio) {
        // Ориентируемся по высоте
        canvas.style.width = 'auto';
        canvas.style.height = '100%';
    } else {
        // Ориентируемся по ширине
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
    }
    
    // Обновляем реальные размеры canvas
    canvas.width = config.width;
    canvas.height = config.height;
}

// Координаты мыши
const mouse = {
    x: 0,
    y: 0,
    click: false
};

// Запуск игры при загрузке
window.addEventListener('load', () => {
    initGame();
    
    // Если есть параметры из URL
    const urlParams = new URLSearchParams(window.location.search);
    const brawlerFromUrl = urlParams.get('brawler');
    
    if (brawlerFromUrl) {
        selectedBrawler = parseInt(brawlerFromUrl);
        const options = document.querySelectorAll('.brawler-option');
        if (options.length >= selectedBrawler) {
            options[selectedBrawler - 1].classList.add('selected');
        }
    }
});
