// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// Конфигурация игры
const config = {
    width: 1600,
    height: 1200,
    viewportWidth: 800,
    viewportHeight: 600,
    playerSpeed: 3,
    botSpeed: 2,
    bulletSpeed: 7,
    meleeRange: 50,
    shotgunRange: 300,
    pistolRange: 500,
    shotgunSpread: Math.PI / 6,
    playerSize: 30,
    bulletSize: 8,
    spawnProtectionTime: 2000,
    gameDuration: 120000,
    colors: {
        shotgun: '#FF5555',
        pistol: '#5555FF',
        melee: '#55FF55',
        player: '#FFFF00',
        trajectory: 'rgba(255, 255, 255, 0.3)'
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
const moveJoystick = document.getElementById('joystick');
const moveJoystickInner = document.getElementById('joystick-inner');
const attackJoystick = document.getElementById('attack-joystick');
const attackJoystickInner = document.getElementById('attack-joystick-inner');

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
let camera = { x: 0, y: 0 };
let attackAngle = 0;
let isAttacking = false;

// Управление
const keys = {
    w: false, a: false, s: false, d: false
};

const moveTouch = {
    active: false,
    startX: 0, startY: 0,
    moveX: 0, moveY: 0
};

const attackTouch = {
    active: false,
    startX: 0, startY: 0,
    moveX: 0, moveY: 0
};

const mouse = {
    x: 0, y: 0, click: false
};

// Инициализация игры
function initGame() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        moveJoystick.style.display = 'block';
        attackJoystick.style.display = 'block';
        setupTouchControls();
    } else {
        setupKeyboardControls();
    }
    
    brawlerSelection.style.display = 'flex';
}

function selectBrawler(brawlerId) {
    selectedBrawler = brawlerId;
    document.querySelectorAll('.brawler-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
}

function startGame() {
    brawlerSelection.style.display = 'none';
    gameOverScreen.style.display = 'none';
    
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
        damageDealt: 0,
        range: selectedBrawler === 1 ? config.shotgunRange : 
               selectedBrawler === 2 ? config.pistolRange : config.meleeRange
    };
    
    camera.x = player.x - config.viewportWidth / 2;
    camera.y = player.y - config.viewportHeight / 2;
    bots = createBots();
    bullets = [];
    particles = [];
    gameRunning = true;
    gameStartTime = Date.now();
    spawnProtection = true;
    spawnProtectionEndTime = Date.now() + config.spawnProtectionTime;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

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
            damageDealt: 0,
            range: brawlerType === 1 ? config.shotgunRange : 
                   brawlerType === 2 ? config.pistolRange : config.meleeRange
        });
    }
    
    return bots;
}

function gameLoop(timestamp) {
    if (!gameRunning) return;
    
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    update(deltaTime);
    render();
    
    const elapsedTime = Date.now() - gameStartTime;
    if (player.isDead || elapsedTime >= config.gameDuration) {
        endGame();
        return;
    }
    
    requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    if (!player.isDead) {
        updatePlayer(deltaTime);
        
        camera.x = player.x - config.viewportWidth / 2;
        camera.y = player.y - config.viewportHeight / 2;
        camera.x = Math.max(0, Math.min(config.width - config.viewportWidth, camera.x));
        camera.y = Math.max(0, Math.min(config.height - config.viewportHeight, camera.y));
        
        if (spawnProtection && Date.now() > spawnProtectionEndTime) {
            spawnProtection = false;
        }
    }
    
    bots.forEach(bot => {
        if (!bot.isDead) {
            updateBot(bot, deltaTime);
        }
    });
    
    bullets.forEach((bullet, index) => {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        
        // Проверка выхода за пределы дальности
        const distance = Math.sqrt(Math.pow(bullet.x - bullet.startX, 2) + Math.pow(bullet.y - bullet.startY, 2));
        if (distance > bullet.range) {
            bullets.splice(index, 1);
            return;
        }
        
        checkBulletCollisions(bullet, index);
        
        if (bullet.x < 0 || bullet.x > config.width || bullet.y < 0 || bullet.y > config.height) {
            bullets.splice(index, 1);
        }
    });
    
    particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.lifetime -= deltaTime;
        
        if (particle.lifetime <= 0) {
            particles.splice(index, 1);
        }
    });
    
    bots = bots.filter(bot => !bot.isDead);
    
    if (bots.length === 0 && !player.isDead) {
        playerPlace = 1;
        endGame();
    }
    
    updateUI();
}

function updatePlayer(deltaTime) {
    let dx = 0, dy = 0;
    
    if (isMobile) {
        // Управление движением
        if (moveTouch.active) {
            const dist = Math.sqrt(Math.pow(moveTouch.moveX - moveTouch.startX, 2) + 
                                 Math.pow(moveTouch.moveY - moveTouch.startY, 2));
            const maxDist = 40;
            
            if (dist > 5) {
                const angle = Math.atan2(moveTouch.moveY - moveTouch.startY, 
                                        moveTouch.moveX - moveTouch.startX);
                const moveDist = Math.min(dist, maxDist);
                
                dx = Math.cos(angle) * moveDist / maxDist;
                dy = Math.sin(angle) * moveDist / maxDist;
                moveJoystickInner.style.transform = `translate(${dx * 30}px, ${dy * 30}px)`;
            }
        }
        
        // Управление атакой
        if (attackTouch.active) {
            isAttacking = true;
            attackAngle = Math.atan2(attackTouch.moveY - attackTouch.startY, 
                                   attackTouch.moveX - attackTouch.startX);
            
            // Обновление позиции джойстика атаки
            const dist = Math.sqrt(Math.pow(attackTouch.moveX - attackTouch.startX, 2) + 
                                 Math.pow(attackTouch.moveY - attackTouch.startY, 2));
            const maxDist = 50;
            const moveDist = Math.min(dist, maxDist);
            
            attackJoystickInner.style.transform = `translate(
                ${(attackTouch.moveX - attackTouch.startX) / maxDist * 30}px, 
                ${(attackTouch.moveY - attackTouch.startY) / maxDist * 30}px
            )`;
            
            // Автоматическая стрельба при наведении
            if (Date.now() - player.lastShot > player.shotDelay) {
                player.lastShot = Date.now();
                shoot(player, attackAngle);
            }
        } else {
            isAttacking = false;
        }
    } else {
        // Управление с клавиатуры
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        
        if (dx !== 0 && dy !== 0) {
            const invSqrt = 1 / Math.sqrt(dx*dx + dy*dy);
            dx *= invSqrt;
            dy *= invSqrt;
        }
        
        // Стрельба по клику мыши
        if (mouse.click) {
            isAttacking = true;
            attackAngle = Math.atan2(mouse.y - (player.y - camera.y), 
                                   mouse.x - (player.x - camera.x));
            
            if (Date.now() - player.lastShot > player.shotDelay) {
                player.lastShot = Date.now();
                shoot(player, attackAngle);
            }
        } else {
            isAttacking = false;
        }
    }
    
    player.x += dx * player.speed;
    player.y += dy * player.speed;
    player.x = Math.max(player.size, Math.min(config.width - player.size, player.x));
    player.y = Math.max(player.size, Math.min(config.height - player.size, player.y));
}

function shoot(shooter, angle) {
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
                    if (shooter.isPlayer) player.kills++;
                }
            }
        });
    } else {
        // Дальний бой
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

function createBullet(shooter, angle) {
    bullets.push({
        x: shooter.x,
        y: shooter.y,
        startX: shooter.x,
        startY: shooter.y,
        vx: Math.cos(angle) * config.bulletSpeed,
        vy: Math.sin(angle) * config.bulletSpeed,
        size: config.bulletSize,
        shooter: shooter,
        damage: shooter.brawlerType === 1 ? 15 : 20,
        range: shooter.range
    });
}

function checkBulletCollisions(bullet, bulletIndex) {
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
                    if (bullet.shooter.isPlayer) player.kills++;
                }
                
                bullets.splice(bulletIndex, 1);
            }
        }
    });
}

function updateBot(bot, deltaTime) {
    if (Date.now() > bot.targetChangeTime) {
        bot.targetX = Math.random() * config.width;
        bot.targetY = Math.random() * config.height;
        bot.targetChangeTime = Date.now() + 2000 + Math.random() * 3000;
    }
    
    const dx = bot.targetX - bot.x;
    const dy = bot.targetY - bot.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist > 10) {
        bot.x += (dx / dist) * bot.speed;
        bot.y += (dy / dist) * bot.speed;
    }
    
    bot.x = Math.max(bot.size, Math.min(config.width - bot.size, bot.x));
    bot.y = Math.max(bot.size, Math.min(config.height - bot.size, bot.y));
    
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
    
    if (nearestEnemy && Date.now() - bot.lastShot > bot.shotDelay) {
        bot.lastShot = Date.now();
        
        if (bot.brawlerType === 3) {
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
            const angle = Math.atan2(nearestEnemy.y - bot.y, nearestEnemy.x - bot.x);
            
            if (bot.brawlerType === 1) {
                for (let i = -1; i <= 1; i++) {
                    createBullet(bot, angle + i * config.shotgunSpread);
                }
            } else {
                createBullet(bot, angle);
            }
        }
    }
}

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

function render() {
    ctx.clearRect(0, 0, config.viewportWidth, config.viewportHeight);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    
    drawBackground();
    
    // Отрисовка траектории атаки
    if (isAttacking && !player.isDead) {
        ctx.strokeStyle = config.colors.trajectory;
        ctx.lineWidth = 2;
        
        switch(player.brawlerType) {
            case 1: // Дробовик
                for (let i = -1; i <= 1; i++) {
                    const spreadAngle = attackAngle + i * config.shotgunSpread;
                    ctx.beginPath();
                    ctx.moveTo(player.x, player.y);
                    const endX = player.x + Math.cos(spreadAngle) * config.shotgunRange;
                    const endY = player.y + Math.sin(spreadAngle) * config.shotgunRange;
                    ctx.lineTo(endX, endY);
                    ctx.stroke();
                    
                    // Конец траектории
                    ctx.beginPath();
                    ctx.arc(endX, endY, 5, 0, Math.PI * 2);
                    ctx.fillStyle = config.colors.trajectory;
                    ctx.fill();
                }
                break;
                
            case 2: // Пистолет
                ctx.beginPath();
                ctx.moveTo(player.x, player.y);
                const endX = player.x + Math.cos(attackAngle) * config.pistolRange;
                const endY = player.y + Math.sin(attackAngle) * config.pistolRange;
                ctx.lineTo(endX, endY);
                ctx.stroke();
                
                // Конец траектории
                ctx.beginPath();
                ctx.arc(endX, endY, 5, 0, Math.PI * 2);
                ctx.fillStyle = config.colors.trajectory;
                ctx.fill();
                break;
                
            case 3: // Ближний бой
                ctx.beginPath();
                ctx.arc(player.x, player.y, config.meleeRange, 0, Math.PI * 2);
                ctx.stroke();
                
                // Визуализация направления атаки
                ctx.beginPath();
                ctx.moveTo(player.x, player.y);
                ctx.lineTo(
                    player.x + Math.cos(attackAngle) * config.meleeRange,
                    player.y + Math.sin(attackAngle) * config.meleeRange
                );
                ctx.stroke();
                break;
        }
    }
    
    bullets.forEach(bullet => {
        ctx.fillStyle = bullet.shooter.color;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2);
        ctx.fill();
    });
    
    particles.forEach(particle => {
        ctx.globalAlpha = particle.lifetime / 1000;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    
    bots.forEach(bot => {
        if (!bot.isDead) {
            drawCharacter(bot);
        }
    });
    
    if (!player.isDead) {
        if (spawnProtection) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.size + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        drawCharacter(player);
    }
    
    ctx.restore();
}

function drawCharacter(character) {
    ctx.fillStyle = character.color;
    ctx.beginPath();
    ctx.arc(character.x, character.y, character.size, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = character.isPlayer ? '#FFFFFF' : '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(character.x, character.y, character.size, 0, Math.PI * 2);
    ctx.stroke();
    
    const healthWidth = (character.size * 2) * (character.health / character.maxHealth);
    ctx.fillStyle = 'red';
    ctx.fillRect(character.x - character.size, character.y - character.size - 10, character.size * 2, 5);
    ctx.fillStyle = 'green';
    ctx.fillRect(character.x - character.size, character.y - character.size - 10, healthWidth, 5);
}

function drawBackground() {
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    
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

function endGame() {
    gameRunning = false;
    
    if (!playerPlace) {
        playerPlace = bots.filter(b => !b.isDead).length + 1;
    }
    
    resultTitle.textContent = player.isDead ? "Вы проиграли!" : "Победа!";
    resultText.textContent = `Вы заняли ${playerPlace} место из 10`;
    gameOverScreen.style.display = 'flex';
    
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

function restartGame() {
    startGame();
}

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

function setupTouchControls() {
    // Джойстик движения
    moveJoystick.addEventListener('touchstart', (e) => {
        const rect = moveJoystick.getBoundingClientRect();
        moveTouch.startX = rect.left + rect.width / 2;
        moveTouch.startY = rect.top + rect.height / 2;
        moveTouch.moveX = e.touches[0].clientX;
        moveTouch.moveY = e.touches[0].clientY;
        moveTouch.active = true;
        e.preventDefault();
    });
    
    moveJoystick.addEventListener('touchmove', (e) => {
        if (moveTouch.active) {
            moveTouch.moveX = e.touches[0].clientX;
            moveTouch.moveY = e.touches[0].clientY;
            e.preventDefault();
        }
    });
    
    moveJoystick.addEventListener('touchend', () => {
        moveTouch.active = false;
        moveJoystickInner.style.transform = 'translate(0, 0)';
    });
    
    // Джойстик атаки
    attackJoystick.addEventListener('touchstart', (e) => {
        const rect = attackJoystick.getBoundingClientRect();
        attackTouch.startX = rect.left + rect.width / 2;
        attackTouch.startY = rect.top + rect.height / 2;
        attackTouch.moveX = e.touches[0].clientX;
        attackTouch.moveY = e.touches[0].clientY;
        attackTouch.active = true;
        e.preventDefault();
    });
    
    attackJoystick.addEventListener('touchmove', (e) => {
        if (attackTouch.active) {
            attackTouch.moveX = e.touches[0].clientX;
            attackTouch.moveY = e.touches[0].clientY;
            e.preventDefault();
        }
    });
    
    attackJoystick.addEventListener('touchend', () => {
        attackTouch.active = false;
        attackJoystickInner.style.transform = 'translate(0, 0)';
    });
}

function resizeCanvas() {
    canvas.width = config.viewportWidth;
    canvas.height = config.viewportHeight;
    
    if (isMobile) {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const gameRatio = config.viewportWidth / config.viewportHeight;
        const windowRatio = windowWidth / windowHeight;
        
        if (windowRatio > gameRatio) {
            canvas.style.width = 'auto';
            canvas.style.height = '100%';
        } else {
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
        }
    }
}

window.addEventListener('load', () => {
    initGame();
    
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
